import asyncio
import json
import mss
import cv2
import numpy as np
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCIceCandidate
from av import VideoFrame


class ScreenCaptureTrack(VideoStreamTrack):
    """Captura a tela inteira continuamente como um stream de vídeo."""
    def __init__(self):
        super().__init__()
        self.sct = mss.mss()
        self.monitor = self.sct.monitors[1]  # monitor[0] é a tela toda (multi-monitor)

    async def recv(self):
        pts, time_base = await self.next_timestamp()

        img = np.array(self.sct.grab(self.monitor))
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

        frame = VideoFrame.from_ndarray(img, format='bgr24')
        frame.pts = pts
        frame.time_base = time_base
        return frame


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

                match data["type"]:
                    case "new-viewer":
                        await self._handle_new_viewer(data, socket)

                    case "answer":
                        await self._handle_answer(data)

                    case "candidate":
                        await self._handle_candidate(data)

    async def _handle_new_viewer(self, data, socket):
        viewer_id = data["viewerId"]
        print(f"👀 Novo viewer: {viewer_id}")

        pc = RTCPeerConnection()
        pc.addTrack(self.video_track)

        @pc.on("icecandidate")
        async def on_icecandidate(event):
            if event.candidate:
                await socket.send(json.dumps({
                    "type": "candidate",
                    "candidate": {
                        "candidate": event.candidate.candidate,
                        "sdpMid": event.candidate.sdpMid,
                        "sdpMLineIndex": event.candidate.sdpMLineIndex
                    },
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

    async def _handle_answer(self, data):
        viewer_id = data["senderId"]
        pc = self.peers.get(viewer_id)

        if pc:
            await pc.setRemoteDescription(
                RTCSessionDescription(sdp=data["sdp"]["sdp"], type=data["sdp"]["type"])
            )
            print(f"↩️ Answer aplicada de {viewer_id}")

    async def _handle_candidate(self, data):
        viewer_id = data["senderId"]
        pc = self.peers.get(viewer_id)

        if not pc:
            print(f"⚠️ PeerConnection para {viewer_id} não encontrado.")
            return

        try:
            candidate_dict = data["candidate"]
            candidate = RTCIceCandidate(
                candidate=candidate_dict["candidate"],
                sdpMid=candidate_dict["sdpMid"],
                sdpMLineIndex=candidate_dict["sdpMLineIndex"]
            )
            await pc.addIceCandidate(candidate)
            print(f"📥 ICE Candidate adicionado de {viewer_id}")
        except Exception as e:
            print(f"❌ Erro ao adicionar ICE Candidate de {viewer_id}: {e}")


if __name__ == "__main__":
    signaling_url = "ws://localhost:8080"
    broadcaster = Broadcaster(signaling_url)
    asyncio.run(broadcaster.connect())
