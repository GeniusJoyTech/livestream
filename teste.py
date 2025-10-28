import os
import sys
import asyncio
import json
import mss
import cv2
import numpy as np
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCRtpSender
from aiortc.sdp import candidate_from_sdp
from av import VideoFrame
import time

cv2.setNumThreads(1)

# ===============================================================
# 🎬 Codec H.264
# ===============================================================
def ensure_openh264_available():
    base_dir = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    os.environ["PATH"] += os.pathsep + base_dir
    dll_found = any(f.lower().startswith("openh264") for f in os.listdir(base_dir))
    if dll_found:
        print(f"🎞️ OpenH264 detectado em: {base_dir}")
    else:
        print("⚠️ Nenhum OpenH264 encontrado, VP8 será usado.")

def check_h264_support():
    caps = RTCRtpSender.getCapabilities("video")
    for codec in caps.codecs:
        if "H264" in codec.mimeType:
            print(f"✅ Codec H.264 disponível: {codec.mimeType}")
            return True
    print("⚠️ Nenhum codec H.264 disponível, VP8 será usado.")
    return False

# ===============================================================
# 🖥️ Captura de tela com controle de FPS
# ===============================================================
class ScreenCaptureTrack(VideoStreamTrack):
    def __init__(self, monitor_number=1, fps=60):
        super().__init__()
        self.sct = mss.mss()
        self.monitor_number = int(monitor_number)
        self.fps = fps
        self.update_monitor()
        self.last_frame = None

    def update_monitor(self):
        total_monitors = len(self.sct.monitors) - 1
        if self.monitor_number <= 0 or self.monitor_number > total_monitors:
            self.monitor_number = 1
        self.monitor = self.sct.monitors[self.monitor_number]
        print(f"🖥️ Capturando monitor {self.monitor_number}: {self.monitor}")

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        t0 = time.time()
        try:
            img = np.array(self.sct.grab(self.monitor))
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
            if self.last_frame is not None:
                diff = cv2.absdiff(cv2.resize(img, (640, 360)),
                                   cv2.resize(self.last_frame, (640, 360)))
                change_ratio = np.mean(diff) / 255
                if change_ratio > 0.1:
                    img = cv2.resize(img, (1280, 720))
            else:
                img = cv2.resize(img, (1920, 1080))
            self.last_frame = img.copy()
            frame = VideoFrame.from_ndarray(img, format="bgr24")
        except Exception as e:
            print(f"⚠️ Falha na captura ({type(e).__name__}): {e}")
            frame = VideoFrame.from_ndarray(np.zeros((1080, 1920, 3), dtype=np.uint8), format="bgr24")

        frame.pts = pts
        frame.time_base = time_base

        dt = 1 / self.fps - (time.time() - t0)
        if dt > 0:
            await asyncio.sleep(dt)

        return frame

# ===============================================================
# 📡 Broadcaster
# ===============================================================
class Broadcaster:
    def __init__(self, signaling_url, broadcaster_name="Broadcast Padrão"):
        self.signaling_url = signaling_url
        self.broadcaster_name = broadcaster_name
        self.peers = {}
        self.should_reconnect = True
        self.h264_available = check_h264_support()
        self.ping_interval = 10        # segundos entre cada ping
        self.pong_timeout = 5          # segundos para considerar pong perdido
        self.last_pong = time.time()
        self.websocket = None


    async def connect(self):
        retry_delay = 5
        while self.should_reconnect:
            try:
                print(f"🔌 Conectando ao servidor de sinalização: {self.signaling_url}")
                async with websockets.connect(self.signaling_url, ping_interval=None) as socket:
                    self.websocket = socket
                    print("✅ Conectado ao servidor de sinalização.")
                    retry_delay = 5
                    self.last_pong = time.time()

                    # Envia informações do broadcaster
                    await socket.send(
                        json.dumps({
                            "type": "broadcaster",
                            "monitor_number": 1,
                            "broadcaster_name": self.broadcaster_name
                        })
                    )

                    # Inicia tarefa de ping/pong
                    asyncio.create_task(self._ping_loop())

                    # Escuta mensagens do servidor
                    async for msg in socket:
                        self.last_pong = time.time()  # atualiza pong recebido
                        data = json.loads(msg)
                        if data["type"] == "new-viewer":
                            await self._handle_new_viewer(socket, data)
                        elif data["type"] == "answer":
                            await self._handle_answer(data)
                        elif data["type"] == "candidate":
                            await self._handle_candidate(data)
                        elif data["type"] == "viewer-disconnected":
                            await self._handle_viewer_disconnected(data)

            except Exception as e:
                print(f"⚠️ Conexão perdida ({type(e).__name__}), reconectando em {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30)
    async def _ping_loop(self):
        while self.should_reconnect and self.websocket:
            try:
                await self.websocket.send(json.dumps({"type": "ping"}))
                await asyncio.sleep(self.ping_interval)

                # verifica se pong foi recebido recentemente
                if time.time() - self.last_pong > (self.ping_interval + self.pong_timeout):
                    print("⚠️ Pong não recebido, reconectando...")
                    await self.websocket.close()
                    break
            except Exception as e:
                print(f"⚠️ Erro no ping/pong ({type(e).__name__}): {e}")
                break
    async def _handle_new_viewer(self, socket, data):
        viewer_id = data["viewerId"]
        monitor_number = int(data.get("monitor_number", 1))
        print(f"👀 Novo viewer {viewer_id} solicitou monitor {monitor_number}")

        video_track = ScreenCaptureTrack(monitor_number=monitor_number)
        pc = RTCPeerConnection()
        pc.addTrack(video_track)

        if self.h264_available:
            h264_codecs = [c for c in RTCRtpSender.getCapabilities("video").codecs if c.mimeType == "video/H264"]
            if h264_codecs:
                for codec in h264_codecs:
                    codec.parameters["profile-level-id"] = "640033"
                pc.getTransceivers()[0].setCodecPreferences(h264_codecs)
                print(f"🎞️ Enviando vídeo em H.264 High Profile para {viewer_id}")

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

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            print(f"📶 Estado da conexão com {viewer_id}: {pc.connectionState}")
            if pc.connectionState in ["failed", "disconnected", "closed"]:
                await self._handle_viewer_disconnected({"viewerId": viewer_id})

        @pc.on("iceconnectionstatechange")
        def on_iceconnectionstatechange():
            print(f"❄️ ICE connection state com {viewer_id}: {pc.iceConnectionState}")

        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        for sender in pc.getSenders():
            if sender.track and sender.track.kind == "video" and hasattr(sender, "getParameters"):
                try:
                    params = sender.getParameters()
                    if not params.encodings:
                        params.encodings = [{}]
                    params.encodings[0].update({
                        "maxBitrate": 4_000_000,
                        "maxFramerate": 60,
                        "scaleResolutionDownBy": 1.0
                    })
                    await sender.setParameters(params)
                except Exception as e:
                    print(f"⚠️ Falha ao ajustar parâmetros ({type(e).__name__}): {e}")

        self.peers[viewer_id] = pc

        await socket.send(json.dumps({
            "type": "offer",
            "sdp": {"type": pc.localDescription.type, "sdp": pc.localDescription.sdp},
            "targetId": viewer_id
        }))
        print(f"📤 Offer enviado para {viewer_id} — {len(self.peers)} viewer(s) conectados.")

    async def _handle_answer(self, data):
        viewer_id = data["senderId"]
        pc = self.peers.get(viewer_id)
        if pc and pc.signalingState == "have-local-offer":
            await pc.setRemoteDescription(
                RTCSessionDescription(sdp=data["sdp"]["sdp"], type=data["sdp"]["type"])
            )
            print(f"✅ Answer recebida de {viewer_id}")

    async def _handle_candidate(self, data):
        viewer_id = data["senderId"]
        pc = self.peers.get(viewer_id)
        if pc:
            c = data["candidate"]
            cand = candidate_from_sdp(c["candidate"])
            cand.sdpMid = c["sdpMid"]
            cand.sdpMLineIndex = c["sdpMLineIndex"]
            await pc.addIceCandidate(cand)
            print(f"➕ Candidate adicionado de {viewer_id}")

    async def _handle_viewer_disconnected(self, data):
        viewer_id = data["viewerId"]
        pc = self.peers.pop(viewer_id, None)
        if pc:
            await pc.close()
            print(f"👋 Viewer {viewer_id} desconectado.")

    async def stop(self):
        self.should_reconnect = False
        for pc in self.peers.values():
            await pc.close()
        self.peers.clear()
        print("🧹 Broadcaster encerrado.")

# ===============================================================
# 🚀 Execução principal
# ===============================================================
if __name__ == "__main__":
    ensure_openh264_available()
    signaling_url = "ws://192.168.88.181:8080"
    broadcaster = Broadcaster(signaling_url, broadcaster_name="Gabriel")
    try:
        asyncio.run(broadcaster.connect())
    except KeyboardInterrupt:
        print("\n🛑 Encerrando transmissão...")
        asyncio.run(broadcaster.stop())
