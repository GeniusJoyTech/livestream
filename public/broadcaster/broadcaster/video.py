"""
SimplificaVideos Broadcaster - Módulo de Vídeo/WebRTC
Captura de tela e gerenciamento de conexões peer-to-peer
"""

import asyncio
import json
import mss
import cv2
import numpy as np
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, RTCConfiguration, RTCIceServer
from aiortc.sdp import candidate_from_sdp
from av import VideoFrame


class ScreenCaptureTrack(VideoStreamTrack):
    """Track de captura de tela para streaming WebRTC"""

    def __init__(self, monitor_number=1, fps=30):
        super().__init__()
        self.sct = mss.mss()
        self.monitor_number = int(monitor_number)
        self.fps = fps
        self.update_monitor()

    def update_monitor(self):
        total_monitors = len(self.sct.monitors) - 1
        if self.monitor_number <= 0 or self.monitor_number > total_monitors:
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


class VideoSessionManager:
    """Gerencia sessões de vídeo WebRTC com viewers"""
    
    def __init__(self):
        self.peers = {}
        self.ice_config = RTCConfiguration(
            iceServers=[
                RTCIceServer(urls=["stun:stun.l.google.com:19302"]),
                RTCIceServer(urls=["stun:stun1.l.google.com:19302"]),
                RTCIceServer(urls=["stun:stun2.l.google.com:19302"]),
                RTCIceServer(urls=["stun:stun.relay.metered.ca:80"]),
                RTCIceServer(
                    urls=["turn:global.relay.metered.ca:80"],
                    username="e8dd65b92aad6dce5c349164",
                    credential="uWdWNmkhvyqTEj3B"
                ),
                RTCIceServer(
                    urls=["turn:global.relay.metered.ca:443"],
                    username="e8dd65b92aad6dce5c349164",
                    credential="uWdWNmkhvyqTEj3B"
                ),
                RTCIceServer(
                    urls=["turn:global.relay.metered.ca:443?transport=tcp"],
                    username="e8dd65b92aad6dce5c349164",
                    credential="uWdWNmkhvyqTEj3B"
                )
            ]
        )
    
    async def handle_new_viewer(self, socket, viewer_id, monitor_number=1):
        """Cria nova conexão WebRTC para um viewer"""
        print(f"👀 Novo viewer {viewer_id} solicitou monitor {monitor_number}")
        
        video_track = ScreenCaptureTrack(monitor_number=monitor_number)
        pc = RTCPeerConnection(configuration=self.ice_config)
        pc.addTrack(video_track)
        
        @pc.on("icecandidate")
        async def on_icecandidate(event):
            if event.candidate:
                candidate_str = event.candidate.candidate
                if "typ host" in candidate_str:
                    print(f"🧊 ICE Candidato HOST para {viewer_id}: {candidate_str[:80]}...")
                elif "typ srflx" in candidate_str:
                    print(f"🧊 ICE Candidato SRFLX (STUN) para {viewer_id}: {candidate_str[:80]}...")
                elif "typ relay" in candidate_str:
                    print(f"🧊 ICE Candidato RELAY (TURN) para {viewer_id}: {candidate_str[:80]}...")
                else:
                    print(f"🧊 ICE Candidato para {viewer_id}: {candidate_str[:80]}...")
                    
                await socket.send(
                    json.dumps({
                        "type": "candidate",
                        "candidate": {
                            "candidate": event.candidate.candidate,
                            "sdpMid": event.candidate.sdpMid,
                            "sdpMLineIndex": event.candidate.sdpMLineIndex
                        },
                        "targetId": viewer_id
                    }))
            else:
                print(f"🧊 ICE Gathering completo para {viewer_id}")

        @pc.on("icegatheringstatechange")
        async def on_icegatheringstatechange():
            print(f"🔍 ICE Gathering State [{viewer_id}]: {pc.iceGatheringState}")

        @pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            state = pc.iceConnectionState
            if state == "checking":
                print(f"🔄 ICE [{viewer_id}]: Verificando conectividade...")
            elif state == "connected":
                print(f"✅ ICE [{viewer_id}]: Conectado! Vídeo deve estar fluindo.")
            elif state == "completed":
                print(f"✅ ICE [{viewer_id}]: Conexão completa e estável.")
            elif state == "failed":
                print(f"❌ ICE [{viewer_id}]: FALHOU - Não foi possível estabelecer conexão de vídeo")
            elif state == "disconnected":
                print(f"⚠️ ICE [{viewer_id}]: Desconectado temporariamente...")
            elif state == "closed":
                print(f"🔒 ICE [{viewer_id}]: Conexão fechada")
            else:
                print(f"🧊 ICE [{viewer_id}]: Estado = {state}")

        @pc.on("signalingstatechange")
        async def on_signalingstatechange():
            print(f"📡 Signaling State [{viewer_id}]: {pc.signalingState}")

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            state = pc.connectionState
            if state == "connecting":
                print(f"📶 Conexão [{viewer_id}]: Conectando...")
            elif state == "connected":
                print(f"📶 Conexão [{viewer_id}]: ✅ CONECTADO - Vídeo ativo!")
            elif state == "failed":
                print(f"📶 Conexão [{viewer_id}]: ❌ FALHOU")
            elif state == "disconnected":
                print(f"📶 Conexão [{viewer_id}]: ⚠️ Desconectado")
            elif state == "closed":
                print(f"📶 Conexão [{viewer_id}]: Fechada")
            else:
                print(f"📶 Conexão [{viewer_id}]: {state}")
                
            if pc.connectionState in ["failed", "disconnected", "closed"]:
                await self.handle_viewer_disconnected(viewer_id)

        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        self.peers[viewer_id] = pc
        
        await socket.send(
            json.dumps({
                "type": "offer",
                "sdp": {
                    "type": pc.localDescription.type,
                    "sdp": pc.localDescription.sdp
                },
                "targetId": viewer_id
            }))
        print(f"📤 Offer enviado para {viewer_id} — {len(self.peers)} viewer(s) conectados.")
    
    async def handle_answer(self, viewer_id, sdp_data):
        """Processa answer SDP de um viewer"""
        pc = self.peers.get(viewer_id)
        if not pc:
            return

        if pc.signalingState != "have-local-offer":
            print(f"⚠️ Ignorando answer de {viewer_id} — estado: {pc.signalingState}")
            return

        await pc.setRemoteDescription(
            RTCSessionDescription(sdp=sdp_data["sdp"], type=sdp_data["type"]))
        print(f"✅ Answer recebida de {viewer_id}")
    
    async def handle_candidate(self, viewer_id, candidate_data):
        """Adiciona candidato ICE de um viewer"""
        pc = self.peers.get(viewer_id)
        if pc:
            cand = candidate_from_sdp(candidate_data["candidate"])
            cand.sdpMid = candidate_data["sdpMid"]
            cand.sdpMLineIndex = candidate_data["sdpMLineIndex"]
            await pc.addIceCandidate(cand)
            print(f"➕ Candidate adicionado de {viewer_id}")
    
    async def handle_viewer_disconnected(self, viewer_id):
        """Remove viewer desconectado"""
        pc = self.peers.pop(viewer_id, None)
        if pc:
            await pc.close()
            print(f"👋 Viewer {viewer_id} desconectado.")
        if not self.peers:
            print("🛑 Nenhum viewer ativo — transmissão encerrada.")
    
    async def close_all(self):
        """Fecha todas as conexões"""
        for pc in self.peers.values():
            await pc.close()
        self.peers.clear()
        print("🧹 Todas as conexões de vídeo encerradas.")
