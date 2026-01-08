"""
SimplificaVideos Broadcaster - Módulo de Configuração
Gerencia carregamento e salvamento de configurações
"""

import json
import sys
import os
import platform
from pathlib import Path
from datetime import datetime

nome_computador = platform.node()
sistema_operacional = platform.system()

def get_exe_dir():
    """Retorna o diretório do executável ou script"""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).parent.parent

def get_config_file():
    """Retorna o caminho do arquivo de configuração.
    Prioridade: 1) pasta do exe, 2) pasta do usuário
    """
    exe_dir = get_exe_dir()
    local_config = exe_dir / 'broadcaster_config.json'
    
    if local_config.exists():
        return local_config
    
    return Path.home() / '.simplificavideos' / 'broadcaster_config.json'

CONFIG_FILE = get_config_file()


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


def save_broadcaster_config(broadcaster_id, token, token_expires_at, server_url=None):
    """Salva configuração do broadcaster localmente para reconexões automáticas"""
    try:
        if not broadcaster_id or not token:
            print(f"⚠️ Aviso: broadcaster_id ou token inválidos. Configuração não será salva.")
            return False
        
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        
        existing_config = {}
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r') as f:
                    existing_config = json.load(f)
            except:
                pass
        
        config = {
            'broadcaster_id': broadcaster_id,
            'token': token,
            'token_expires_at': token_expires_at,
            'computer_name': nome_computador,
            'saved_at': datetime.now().isoformat()
        }
        
        if server_url:
            config['server_url'] = server_url
        elif existing_config.get('server_url'):
            config['server_url'] = existing_config['server_url']
        
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        
        print(f"✅ Configuração salva em: {CONFIG_FILE}")
        print(f"🆔 Broadcaster ID: {broadcaster_id}")
        print(f"📅 Token expira em: {token_expires_at}")
        return True
    except Exception as e:
        print(f"❌ Erro ao salvar configuração: {e}")
        return False
