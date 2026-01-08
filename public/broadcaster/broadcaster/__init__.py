"""
SimplificaVideos Broadcaster
Módulo principal para transmissão de vídeo e monitoramento
"""

from .config import load_broadcaster_config, save_broadcaster_config, CONFIG_FILE, nome_computador
from .monitoring import MonitoringService, get_browser_history
from .video import VideoSessionManager, ScreenCaptureTrack
from .client import BroadcasterClient

__all__ = [
    'load_broadcaster_config',
    'save_broadcaster_config',
    'CONFIG_FILE',
    'nome_computador',
    'MonitoringService',
    'get_browser_history',
    'VideoSessionManager',
    'ScreenCaptureTrack',
    'BroadcasterClient'
]
