"""
SimplificaVideos Broadcaster - Cliente WebSocket
Coordena monitoramento e vídeo
"""

import asyncio
import json
import websockets
from datetime import datetime

from .config import save_broadcaster_config
from .monitoring import MonitoringService
from .video import VideoSessionManager


class BroadcasterClient:
    """Cliente principal do Broadcaster - coordena todos os serviços"""
    
    def __init__(self,
                 signaling_url,
                 broadcaster_name="Broadcast Padrão",
                 company_id="0",
                 broadcaster_token=None,
                 broadcaster_id=None,
                 is_installation=False,
                 token_expires_at=None):
        
        self.signaling_url = signaling_url
        self.broadcaster_name = broadcaster_name
        self.company_id = company_id
        self.broadcaster_token = broadcaster_token
        self.broadcaster_id = broadcaster_id
        self.is_installation = is_installation
        self.token_expires_at = token_expires_at
        
        self.should_reconnect = True
        self.socket = None
        self.monitoring_task = None
        self.token_renewal_checked = False
        
        self.monitoring_service = MonitoringService()
        self.video_manager = VideoSessionManager()
    
    async def check_and_renew_token(self, socket):
        """Verifica se o token está próximo de expirar e solicita renovação"""
        try:
            from dateutil import parser
            expiry_date = parser.parse(self.token_expires_at)
            days_until_expiry = (expiry_date - datetime.now()).days
            
            if days_until_expiry <= 7:
                print(f"⚠️ Token expira em {days_until_expiry} dias. Solicitando renovação automática...")
                await socket.send(json.dumps({"type": "renew-token"}))
            else:
                print(f"✅ Token válido por mais {days_until_expiry} dias")
        except Exception as e:
            print(f"⚠️ Erro ao verificar expiração do token: {e}")
    
    async def connect(self):
        """Loop principal de conexão"""
        retry_delay = 1
        
        while self.should_reconnect:
            try:
                print(f"🔌 Tentando conectar ao servidor de sinalização: {self.signaling_url}")
                
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
                        self.monitoring_service.start(socket.send))
                    
                    if not self.token_renewal_checked and self.broadcaster_id and self.token_expires_at:
                        await self.check_and_renew_token(socket)
                        self.token_renewal_checked = True
                    
                    async for msg in socket:
                        await self._handle_message(socket, msg)
                        
            except (websockets.exceptions.ConnectionClosedError, ConnectionRefusedError) as e:
                print(f"⚠️ Conexão perdida ({type(e).__name__}): tentando reconectar em {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30)
            except Exception as e:
                print(f"❌ Erro inesperado: {e}")
                await asyncio.sleep(5)
        
        print("🛑 Reconexão desativada, encerrando.")
    
    async def _handle_message(self, socket, msg):
        """Processa mensagens do servidor"""
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
                        token_expires_at,
                        self.signaling_url
                    )
                    self.broadcaster_token = permanent_token
                    self.token_expires_at = token_expires_at
                    print(f"✅ Configuração salva! Este computador está agora registrado permanentemente.")
                    print(f"🔑 Nas próximas execuções, não será necessário passar nenhum argumento.")
        
        elif data["type"] == "token-renewed":
            self.broadcaster_id = data["broadcaster_id"]
            new_token = data.get("token")
            token_expires_at = data.get("token_expires_at")
            
            if new_token:
                save_broadcaster_config(
                    self.broadcaster_id,
                    new_token,
                    token_expires_at,
                    self.signaling_url
                )
                self.broadcaster_token = new_token
                self.token_expires_at = token_expires_at
                print(f"🔄 Token renovado com sucesso! Válido até: {token_expires_at}")
        
        elif data["type"] == "new-viewer":
            await self.video_manager.handle_new_viewer(
                socket,
                data["viewerId"],
                int(data.get("monitor_number", 1))
            )
        
        elif data["type"] == "answer":
            await self.video_manager.handle_answer(
                data["senderId"],
                data["sdp"]
            )
        
        elif data["type"] == "candidate":
            await self.video_manager.handle_candidate(
                data["senderId"],
                data["candidate"]
            )
        
        elif data["type"] == "viewer-disconnected":
            await self.video_manager.handle_viewer_disconnected(data["viewerId"])
    
    async def stop(self):
        """Para todos os serviços"""
        self.should_reconnect = False
        self.monitoring_service.stop()
        
        if self.monitoring_task:
            self.monitoring_task.cancel()
        
        await self.video_manager.close_all()
        self.socket = None
        print("🧹 Broadcaster encerrado e conexões limpas.")
