import asyncio
import json
import mss
import cv2
import numpy as np
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.sdp import candidate_from_sdp
from av import VideoFrame
import platform
import psutil
import time
from datetime import datetime, timedelta
import sqlite3
import os
import shutil
import tempfile
from pathlib import Path

nome_computador = platform.node()
sistema_operacional = platform.system()

CONFIG_FILE = Path.home() / '.simplificavideos' / 'broadcaster_config.json'


def load_broadcaster_config():
    """Carrega configuração salva do broadcaster (ID e token permanente)"""
    if not CONFIG_FILE.exists():
        return None
    
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            print(f"✅ Configuração encontrada: Broadcaster ID {config.get('broadcaster_id')}")
            return config
    except Exception as e:
        print(f"⚠️ Erro ao ler configuração: {e}")
        return None


def save_broadcaster_config(broadcaster_id, token, token_expires_at):
    """Salva configuração do broadcaster localmente para reconexões automáticas"""
    try:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        
        config = {
            'broadcaster_id': broadcaster_id,
            'token': token,
            'token_expires_at': token_expires_at,
            'computer_name': nome_computador,
            'saved_at': datetime.now().isoformat()
        }
        
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        
        print(f"✅ Configuração salva em: {CONFIG_FILE}")
        print(f"🆔 Broadcaster ID: {broadcaster_id}")
        print(f"📅 Token expira em: {token_expires_at}")
        return True
    except Exception as e:
        print(f"❌ Erro ao salvar configuração: {e}")
        return False


def get_browser_history(hours_back=24):
    """
    Lê o histórico de navegação dos navegadores instalados.
    Retorna lista de URLs visitadas nas últimas 'hours_back' horas.
    """
    history_entries = []
    cutoff_time = datetime.now() - timedelta(hours=hours_back)
    
    browser_paths = []
    if sistema_operacional == "Windows":
        user_home = os.path.expanduser("~")
        browser_paths = [
            {
                'name': 'Chrome',
                'path': os.path.join(user_home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'History')
            },
            {
                'name': 'Edge',
                'path': os.path.join(user_home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'History')
            },
            {
                'name': 'Opera',
                'path': os.path.join(user_home, 'AppData', 'Roaming', 'Opera Software', 'Opera Stable', 'History')
            },
            {
                'name': 'Brave',
                'path': os.path.join(user_home, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'History')
            }
        ]
        
        firefox_profile_path = os.path.join(user_home, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')
        if os.path.exists(firefox_profile_path):
            for profile_dir in os.listdir(firefox_profile_path):
                if 'default' in profile_dir.lower():
                    firefox_history = os.path.join(firefox_profile_path, profile_dir, 'places.sqlite')
                    if os.path.exists(firefox_history):
                        browser_paths.append({
                            'name': 'Firefox',
                            'path': firefox_history
                        })
                        break
    
    for browser in browser_paths:
        temp_file = None
        try:
            if not os.path.exists(browser['path']):
                continue
            
            temp_file = tempfile.mktemp(suffix='.db')
            shutil.copy2(browser['path'], temp_file)
            
            conn = sqlite3.connect(temp_file)
            cursor = conn.cursor()
            
            if browser['name'] == 'Firefox':
                query = """
                    SELECT url, title, datetime(visit_date/1000000, 'unixepoch', 'localtime') as visit_time
                    FROM moz_places 
                    JOIN moz_historyvisits ON moz_places.id = moz_historyvisits.place_id
                    WHERE visit_date/1000000 > ?
                    ORDER BY visit_date DESC
                    LIMIT 1000
                """
                cursor.execute(query, (int(cutoff_time.timestamp()),))
            else:
                query = """
                    SELECT url, title, datetime(last_visit_time/1000000-11644473600, 'unixepoch', 'localtime') as visit_time
                    FROM urls 
                    WHERE last_visit_time/1000000-11644473600 > ?
                    ORDER BY last_visit_time DESC
                    LIMIT 1000
                """
                cursor.execute(query, (int(cutoff_time.timestamp()),))
            
            rows = cursor.fetchall()
            for row in rows:
                url, title, visit_time = row
                history_entries.append({
                    'browser': browser['name'],
                    'url': url,
                    'title': title or 'Sem título',
                    'visit_time': visit_time
                })
            
            conn.close()
            os.remove(temp_file)
            
            print(f"✅ {len(rows)} entradas do histórico do {browser['name']}")
            
        except Exception as e:
            print(f"⚠️ Erro ao ler histórico do {browser['name']}: {e}")
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except:
                    pass
    
    history_entries.sort(key=lambda x: x['visit_time'], reverse=True)
    return history_entries


class ScreenCaptureTrack(VideoStreamTrack):

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


class Broadcaster:

    def __init__(self,
                 signaling_url,
                 broadcaster_name="Broadcast Padrão",
                 company_id="0",
                 broadcaster_token=None,
                 broadcaster_id=None,
                 is_installation=False):
        """
        Inicializa o Broadcaster.
        
        Args:
            signaling_url: URL do servidor WebSocket (ex: wss://seu-dominio.replit.dev)
            broadcaster_name: Nome do broadcaster (nome do computador)
            company_id: ID da empresa (legado, pode ser "0")
            broadcaster_token: Token permanente OU installation_token
            broadcaster_id: ID único do broadcaster (salvo após primeira instalação)
            is_installation: True se for primeira instalação com installation_token
        """
        self.signaling_url = signaling_url
        self.broadcaster_name = broadcaster_name
        self.company_id = company_id
        self.broadcaster_token = broadcaster_token
        self.broadcaster_id = broadcaster_id
        self.is_installation = is_installation
        self.peers = {}
        self.should_reconnect = True
        self.socket = None
        self.monitoring_task = None
        self.last_input_time = time.time()
        self.last_mouse_pos = None
        self.idle_threshold = 60
        self.history_counter = 0
        self.history_interval = 30
        self.browser_history_cache = []

    def check_idle_time(self):
        """Detecta tempo de ociosidade do usuário"""
        try:
            if sistema_operacional == "Windows":
                try:
                    import ctypes

                    class LASTINPUTINFO(ctypes.Structure):
                        _fields_ = [('cbSize', ctypes.c_uint),
                                    ('dwTime', ctypes.c_uint)]

                    lii = LASTINPUTINFO()
                    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
                    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii))
                    millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
                    return millis / 1000.0
                except:
                    pass
            return 0
        except Exception as e:
            print(f"❌ Erro ao verificar ociosidade: {e}")
            return 0

    def extract_url_from_title(self, title, app_name):
        """Extrai URL do título da janela de navegadores"""
        browsers = [
            'chrome.exe', 'firefox.exe', 'msedge.exe', 'brave.exe',
            'opera.exe', 'safari'
        ]
        if app_name.lower() not in browsers:
            return None

        import re
        url_pattern = r'https?://[^\s]+'
        match = re.search(url_pattern, title)
        if match:
            return match.group(0)

        title_parts = title.split(' - ')
        for part in title_parts:
            if '.' in part and ' ' not in part:
                if not part.startswith('http'):
                    return f'https://{part}'
                return part

        return None

    def get_active_windows(self):
        apps = []
        foreground_app = None

        try:
            if sistema_operacional == "Windows":
                try:
                    import win32gui
                    import win32process

                    def callback(hwnd, windows):
                        if win32gui.IsWindowVisible(hwnd):
                            title = win32gui.GetWindowText(hwnd)
                            if title:
                                _, pid = win32process.GetWindowThreadProcessId(
                                    hwnd)
                                try:
                                    process = psutil.Process(pid)
                                    windows.append({
                                        "title": title,
                                        "app": process.name(),
                                        "pid": pid
                                    })
                                except:
                                    pass

                    windows = []
                    win32gui.EnumWindows(callback, windows)
                    apps = windows[:10]

                    fg_hwnd = win32gui.GetForegroundWindow()
                    if fg_hwnd:
                        fg_title = win32gui.GetWindowText(fg_hwnd)
                        _, fg_pid = win32process.GetWindowThreadProcessId(
                            fg_hwnd)
                        try:
                            fg_process = psutil.Process(fg_pid)
                            foreground_app = {
                                "title": fg_title,
                                "app": fg_process.name(),
                                "pid": fg_pid
                            }
                        except:
                            pass
                except ImportError:
                    print("⚠️ win32gui não disponível, usando apenas psutil")
                    for proc in psutil.process_iter(['name', 'pid']):
                        try:
                            apps.append({
                                "title": proc.info['name'],
                                "app": proc.info['name'],
                                "pid": proc.info['pid']
                            })
                            if len(apps) >= 10:
                                break
                        except:
                            pass
            else:
                for proc in psutil.process_iter(['name', 'pid']):
                    try:
                        apps.append({
                            "title": proc.info['name'],
                            "app": proc.info['name'],
                            "pid": proc.info['pid']
                        })
                        if len(apps) >= 10:
                            break
                    except:
                        pass
        except Exception as e:
            print(f"❌ Erro ao coletar apps: {e}")

        return apps, foreground_app

    async def send_monitoring_data(self, socket):
        print("🔄 Iniciando envio de dados de monitoramento...")
        while self.should_reconnect:
            try:
                apps, foreground = self.get_active_windows()

                idle_seconds = self.check_idle_time()

                active_url = None
                if foreground and foreground.get('app'):
                    active_url = self.extract_url_from_title(
                        foreground.get('title', ''), foreground.get('app', ''))

                self.history_counter += 1
                if self.history_counter >= self.history_interval:
                    print("🔍 Lendo histórico de navegação...")
                    self.browser_history_cache = get_browser_history(hours_back=24)
                    self.history_counter = 0
                    print(f"📚 {len(self.browser_history_cache)} entradas de histórico coletadas")

                monitoring_data = {
                    "type": "monitoring",
                    "timestamp": datetime.now().isoformat(),
                    "host": nome_computador,
                    "apps": apps,
                    "foreground": foreground,
                    "system": sistema_operacional,
                    "idle_seconds": round(idle_seconds, 1),
                    "active_url": active_url,
                    "is_idle": idle_seconds > self.idle_threshold,
                    "browser_history": self.browser_history_cache if self.history_counter == 0 else []
                }

                print(
                    f"📤 Enviando dados: {len(apps)} apps, idle: {idle_seconds:.1f}s, URL: {active_url or 'N/A'}, História: {len(self.browser_history_cache)} URLs"
                )
                await socket.send(json.dumps(monitoring_data))

                await asyncio.sleep(2)
            except Exception as e:
                print(f"❌ Erro ao enviar monitoramento: {e}")
                import traceback
                traceback.print_exc()
                break

    async def connect(self):
        retry_delay = 1
        while self.should_reconnect:
            try:
                print(
                    f"🔌 Tentando conectar ao servidor de sinalização: {self.signaling_url}"
                )
                async with websockets.connect(self.signaling_url) as socket:
                    self.socket = socket
                    print("✅ Conectado ao servidor de sinalização.")
                    retry_delay = 1

                    registration_data = {
                        "type": "broadcaster",
                        "monitor_number": 1,
                        "broadcaster_name": self.broadcaster_name,
                        "company_id": self.company_id
                    }
                    
                    if self.broadcaster_token:
                        registration_data["broadcaster_token"] = self.broadcaster_token
                        if self.broadcaster_id:
                            registration_data["broadcaster_id"] = self.broadcaster_id
                            print(f"🔐 Reconectando com Broadcaster ID: {self.broadcaster_id}")
                        else:
                            print(f"🔐 Primeira instalação - usando installation_token...")
                    else:
                        print(f"⚠️ AVISO: Modo legado (sem token). Recomenda-se obter um token JWT para segurança.")
                    
                    await socket.send(json.dumps(registration_data))
                    print(f"📡 Registrado como: {self.broadcaster_name}")

                    self.monitoring_task = asyncio.create_task(
                        self.send_monitoring_data(socket))

                    async for msg in socket:
                        data = json.loads(msg)
                        
                        if data["type"] == "auth-success":
                            if not self.broadcaster_id and data.get("broadcaster_id"):
                                self.broadcaster_id = data["broadcaster_id"]
                                permanent_token = data.get("token")
                                token_expires_at = data.get("token_expires_at")
                                
                                if permanent_token:
                                    save_broadcaster_config(
                                        self.broadcaster_id,
                                        permanent_token,
                                        token_expires_at
                                    )
                                    self.broadcaster_token = permanent_token
                                    print(f"✅ Configuração salva! Este computador está agora registrado permanentemente.")
                                    print(f"🔑 Nas próximas execuções, não será necessário passar o token.")
                        
                        elif data["type"] == "new-viewer":
                            await self._handle_new_viewer(socket, data)
                        elif data["type"] == "answer":
                            await self._handle_answer(data)
                        elif data["type"] == "candidate":
                            await self._handle_candidate(data)
                        elif data["type"] == "viewer-disconnected":
                            await self._handle_viewer_disconnected(data)

            except (websockets.exceptions.ConnectionClosedError,
                    ConnectionRefusedError) as e:
                print(
                    f"⚠️ Conexão perdida ({type(e).__name__}): tentando reconectar em {retry_delay}s..."
                )
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30)
            except Exception as e:
                print(f"❌ Erro inesperado: {e}")
                await asyncio.sleep(5)
        print("🛑 Reconexão desativada, encerrando.")

    async def _handle_new_viewer(self, socket, data):
        viewer_id = data["viewerId"]
        monitor_number = int(data.get("monitor_number", 1))
        print(f"👀 Novo viewer {viewer_id} solicitou monitor {monitor_number}")

        # Cria uma nova conexão para cada viewer
        video_track = ScreenCaptureTrack(monitor_number=monitor_number)
        pc = RTCPeerConnection()
        pc.addTrack(video_track)

        @pc.on("icecandidate")
        async def on_icecandidate(event):
            if event.candidate:
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

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            print(f"📶 Estado da conexão com {viewer_id}: {pc.connectionState}")
            if pc.connectionState in ["failed", "disconnected", "closed"]:
                await self._handle_viewer_disconnected({"viewerId": viewer_id})

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
        print(
            f"📤 Offer enviado para {viewer_id} — {len(self.peers)} viewer(s) conectados."
        )

    async def _handle_answer(self, data):
        viewer_id = data["senderId"]
        pc = self.peers.get(viewer_id)
        if not pc:
            return

        # Evita erro "Cannot handle answer in signaling state 'stable'"
        if pc.signalingState != "have-local-offer":
            print(
                f"⚠️ Ignorando answer de {viewer_id} — estado: {pc.signalingState}"
            )
            return

        await pc.setRemoteDescription(
            RTCSessionDescription(sdp=data["sdp"]["sdp"],
                                  type=data["sdp"]["type"]))
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
        if not self.peers:
            print("🛑 Nenhum viewer ativo — transmissão encerrada.")

    async def stop(self):
        self.should_reconnect = False
        if self.monitoring_task:
            self.monitoring_task.cancel()
        for pc in self.peers.values():
            await pc.close()
        self.peers.clear()
        self.socket = None
        print("🧹 Broadcaster encerrado e conexões limpas.")


if __name__ == "__main__":
    import argparse
    
    saved_config = load_broadcaster_config()
    
    parser = argparse.ArgumentParser(
        description='SimplificaVideos Broadcaster - Transmita sua tela com segurança',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos de uso:

  Primeira instalação (com token de instalação):
    python Broadcaster.py --token inst_abc123xyz --url wss://seu-dominio.replit.dev
  
  Execuções subsequentes (usa configuração salva):
    python Broadcaster.py
  
Obtenha o token de instalação no painel do SimplificaVideos ao criar um novo broadcaster.
Após a primeira instalação, a configuração é salva automaticamente.
        """
    )
    
    parser.add_argument(
        '--token', '-t',
        required=False if saved_config else True,
        help='Token de instalação (obrigatório apenas na primeira vez)'
    )
    
    parser.add_argument(
        '--url', '-u',
        required=False if saved_config else True,
        help='URL do servidor WebSocket (obrigatório apenas na primeira vez)'
    )
    
    args = parser.parse_args()
    
    if saved_config:
        broadcaster_token = saved_config.get('token')
        broadcaster_id = saved_config.get('broadcaster_id')
        signaling_url = args.url or f"wss://{input('Digite a URL do servidor (ex: wss://seu-dominio.replit.dev): ')}"
        is_installation = False
        
        print("=" * 60)
        print(f"🚀 SimplificaVideos Broadcaster v4.0")
        print(f"📡 Nome do computador: {nome_computador}")
        print(f"🆔 Broadcaster ID: {broadcaster_id}")
        print(f"🔒 Modo: Reconexão Automática")
        print(f"💾 Config salva em: {CONFIG_FILE}")
        print("=" * 60)
    else:
        if not args.token or not args.url:
            print("❌ Erro: Para primeira instalação, --token e --url são obrigatórios")
            exit(1)
        
        broadcaster_token = args.token
        signaling_url = args.url
        broadcaster_id = None
        is_installation = True
        
        print("=" * 60)
        print(f"🚀 SimplificaVideos Broadcaster v4.0")
        print(f"📡 Nome do computador: {nome_computador}")
        print(f"🔐 Modo: Primeira Instalação")
        print(f"🌐 Servidor: {signaling_url.split('?')[0]}")
        print("=" * 60)
    
    if not signaling_url.startswith('wss://') and not signaling_url.startswith('ws://'):
        print("❌ Erro: URL deve começar com wss:// ou ws://")
        exit(1)
    
    if '?' not in signaling_url:
        signaling_url = f"{signaling_url}?role=broadcaster"
    elif 'role=' not in signaling_url:
        signaling_url = f"{signaling_url}&role=broadcaster"
    
    company_id = "1"
    
    broadcaster = Broadcaster(
        signaling_url,
        broadcaster_name=nome_computador,
        company_id=company_id,
        broadcaster_token=broadcaster_token,
        broadcaster_id=broadcaster_id,
        is_installation=is_installation
    )
    
    try:
        asyncio.run(broadcaster.connect())
    except KeyboardInterrupt:
        print("\n🛑 Encerrando transmissão...")
        asyncio.run(broadcaster.stop())
