#!/usr/bin/env python3
"""
SimplificaVideos Broadcaster - Ponto de Entrada Principal
Coordena monitoramento de atividades e transmissão de vídeo WebRTC
"""

import asyncio
from broadcaster import (
    load_broadcaster_config,
    CONFIG_FILE,
    nome_computador,
    BroadcasterClient
)


def main():
    """Função principal"""
    saved_config = load_broadcaster_config()
    
    if not saved_config:
        print("=" * 60)
        print("❌ ERRO: Arquivo de configuração não encontrado!")
        print("")
        print("📋 Como configurar:")
        print("   1. Acesse o painel do SimplificaVideos")
        print("   2. Crie um novo broadcaster")
        print("   3. Clique em '📥 Baixar broadcaster_config.json'")
        print(f"   4. Coloque o arquivo em: {CONFIG_FILE}")
        print("   5. Execute novamente: python main.py")
        print("=" * 60)
        return 1
    
    broadcaster_token = saved_config.get('token')
    broadcaster_id = saved_config.get('broadcaster_id')
    token_expires_at = saved_config.get('token_expires_at')
    signaling_url = saved_config.get('server_url')
    
    if not broadcaster_token:
        print("❌ Erro: Token não encontrado no arquivo de configuração")
        print("   Baixe um novo arquivo broadcaster_config.json do painel")
        return 1
    
    if not signaling_url:
        print("❌ Erro: URL do servidor não encontrada no arquivo de configuração")
        print("   Baixe um novo arquivo broadcaster_config.json do painel")
        return 1
    
    if not signaling_url.startswith('wss://') and not signaling_url.startswith('ws://'):
        print("❌ Erro: URL inválida no arquivo de configuração")
        print(f"   URL deve começar com wss:// ou ws://, encontrado: {signaling_url}")
        return 1
    
    is_installation_token = broadcaster_token.startswith('inst_')
    if is_installation_token:
        is_installation = True
        broadcaster_id = None
        token_expires_at = None
    else:
        is_installation = False
    
    print("=" * 60)
    print(f"🚀 SimplificaVideos Broadcaster v5.0 (Modular)")
    print(f"📡 Nome do computador: {nome_computador}")
    
    if is_installation_token:
        print(f"🔐 Modo: Primeira Instalação")
        print(f"🆔 Broadcaster ID será gerado pelo servidor")
    else:
        print(f"🆔 Broadcaster ID: {broadcaster_id}")
        print(f"🔒 Modo: Reconexão Automática")
    
    print(f"🌐 Servidor: {signaling_url.split('?')[0]}")
    print(f"💾 Config: {CONFIG_FILE}")
    print("=" * 60)
    
    if '?' not in signaling_url:
        signaling_url = f"{signaling_url}?role=broadcaster"
    elif 'role=' not in signaling_url:
        signaling_url = f"{signaling_url}&role=broadcaster"
    
    company_id = "1"
    
    client = BroadcasterClient(
        signaling_url,
        broadcaster_name=nome_computador,
        company_id=company_id,
        broadcaster_token=broadcaster_token,
        broadcaster_id=broadcaster_id,
        is_installation=is_installation,
        token_expires_at=token_expires_at
    )
    
    try:
        asyncio.run(client.connect())
    except KeyboardInterrupt:
        print("\n🛑 Encerrando transmissão...")
        asyncio.run(client.stop())
    
    return 0


if __name__ == "__main__":
    exit(main())
