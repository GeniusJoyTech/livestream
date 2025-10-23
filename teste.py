import asyncio
import json
import mss
import cv2
import numpy as np
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.sdp import candidate_from_sdp
from av import VideoFrame


class ScreenCaptureTrack(VideoStreamTrack):
    def __init__(self, monitor_number=1, fps=30):
        super().__init__()
        self.sct = mss.mss()
        self.monitor_number = int(monitor_number)
        self.fps = fps
        self.update_monitor()

    def update_monitor(self):
        if self.monitor_number == 0:
            self.monitor_number = 1
        self.monitor = self.sct.monitors[self.monitor_number]
        print(f"🖥️ Capturando monitor {self.monitor_number}: {self.monitor}")

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        img = np.array(self.sct.grab(self.monitor))
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        frame = VideoFrame.from_ndarray(img, format='bgr24')
        frame.pts = pts
        frame.time_base = time_base
        await asyncio.sleep(1 / self.fps)
        return frame


class Broadcaster:
    def __init__(self, signaling_url, broadcaster_name="Broadcast Padrão"):
        self.signaling_url = signaling_url
        self.broadcaster_name = broadcaster_name
        self.peers = {}

    async def connect(self):
        async with websockets.connect(self.signaling_url) as socket:
            print("🔌 Conectado ao servidor de sinalização.")

            # Envia o nome junto com o registro
            await socket.send(json.dumps({
                "type": "broadcaster",
                "monitor_number": 1,
                "broadcaster_name": self.broadcaster_name
            }))

            print(f"📡 Registrado como: {self.broadcaster_name}")

            async for msg in socket:
                data = json.loads(msg)
                print("📩 Mensagem recebida:", data)

                if data["type"] == "new-viewer":
                    viewer_id = data["viewerId"]
                    monitor_number = int(data.get("monitor_number", 1))
                    print(f"👀 Novo viewer {viewer_id} solicitou monitor {monitor_number}")

                    video_track = ScreenCaptureTrack(monitor_number=monitor_number)
                    pc = RTCPeerConnection()
                    pc.addTrack(video_track)

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
                            RTCSessionDescription(
                                sdp=data["sdp"]["sdp"],
                                type=data["sdp"]["type"]
                            )
                        )

                elif data["type"] == "candidate":
                    viewer_id = data["senderId"]
                    pc = self.peers.get(viewer_id)
                    if pc:
                        c = data["candidate"]
                        cand = candidate_from_sdp(c["candidate"])
                        cand.sdpMid = c["sdpMid"]
                        cand.sdpMLineIndex = c["sdpMLineIndex"]
                        await pc.addIceCandidate(cand)


if __name__ == "__main__":
    signaling_url = "ws://192.168.88.181:8080"
    nome = input("📝 Nome do broadcast: ")
    broadcaster = Broadcaster(signaling_url, broadcaster_name=nome)
    asyncio.run(broadcaster.connect())
