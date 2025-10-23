import asyncio
import json
import mss
import cv2
import numpy as np
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.sdp import candidate_from_sdp
from av import VideoFrame

# Track de vídeo que captura a tela continuamente, com cursor visível
class ScreenCaptureTrack(VideoStreamTrack):
    def __init__(self):
        super().__init__()
        self.sct = mss.mss()
        self.monitor = self.sct.monitors[1]  # monitor[0] é um pseudo-monitor com todos os monitores
        self.width = self.monitor['width']
        self.height = self.monitor['height']

    async def recv(self):
        pts, time_base = await self.next_timestamp()

        # Captura a tela com cursor visível (mss por padrão captura cursor)
        img = np.array(self.sct.grab(self.monitor))
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

        frame = VideoFrame.from_ndarray(img, format='bgr24')
        frame.pts = pts
        frame.time_base = time_base
        return frame

# Broadcaster WebRTC que se comunica via WebSocket
class Broadcaster:
    def __init__(self, signaling_url):
        self.signaling_url = signaling_url
        self.peers = {}
        self.video_track = ScreenCaptureTrack()

    async def connect(self):
        async with websockets.connect(self.signaling_url) as socket:
            print("🔌 Conectado ao servidor de sinalização.")
            await socket.send(json.dumps({"type": "broadcaster"}))

            async for msg in socket:
                data = json.loads(msg)
                print("📩 Mensagem recebida:", data)

                if data["type"] == "new-viewer":
                    viewer_id = data["viewerId"]
                    print(f"👀 Novo viewer: {viewer_id}")

                    pc = RTCPeerConnection()
                    pc.addTrack(self.video_track)

                    @pc.on("icecandidate")
                    async def on_icecandidate(event):
                        if event.candidate:
                            candidate_data = {
                                "candidate": event.candidate.candidate,
                                "sdpMid": event.candidate.sdpMid,
                                "sdpMLineIndex": event.candidate.sdpMLineIndex
                            }
                            await socket.send(json.dumps({
                                "type": "candidate",
                                "candidate": candidate_data,
                                "targetId": viewer_id
                            }))
                            print(f"❄️ Enviando ICE para {viewer_id}")

                    offer = await pc.createOffer()
                    await pc.setLocalDescription(offer)

                    self.peers[viewer_id] = pc

                    await socket.send(json.dumps({
                        "type": "offer",
                        "sdp": {
                            "type": pc.localDescription.type,
                            "sdp": pc.localDescription.sdp
                        },
                        "targetId": viewer_id
                    }))
                    print(f"📤 Offer enviado para {viewer_id}")

                elif data["type"] == "answer":
                    viewer_id = data["senderId"]
                    pc = self.peers.get(viewer_id)
                    if pc:
                        await pc.setRemoteDescription(
                            RTCSessionDescription(sdp=data["sdp"]["sdp"], type=data["sdp"]["type"])
                        )
                        print(f"↩️ Answer aplicada de {viewer_id}")

                elif data["type"] == "candidate":
                    viewer_id = data["senderId"]
                    pc = self.peers.get(viewer_id)
                    if pc:
                        candidate_dict = data["candidate"]
                        candidate = candidate_from_sdp(candidate_dict["candidate"])
                        candidate.sdpMid = candidate_dict["sdpMid"]
                        candidate.sdpMLineIndex = candidate_dict["sdpMLineIndex"]

                        await pc.addIceCandidate(candidate)
                        print(f"📥 ICE Candidate adicionado de {viewer_id}")

if __name__ == "__main__":
    signaling_url = "ws://192.168.88.181:8080"  # Alterar para seu servidor de sinalização
    broadcaster = Broadcaster(signaling_url)
    asyncio.run(broadcaster.connect())
