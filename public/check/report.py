import socket
import psutil
import pygetwindow as gw
import time
import json
import os
import ctypes
from screeninfo import get_monitors

SERVER_IP = "192.168.88.181"
SERVER_PORT = 8080
INTERVALO = 1
INATIVO_SEGUNDOS = 60
RECONNECT_DELAY = 5

estado_janelas = {}
estado_atividade = True
buffer_eventos = []

class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

def tempo_ultimo_input():
    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii))
    tick_atual = ctypes.windll.kernel32.GetTickCount()
    return (tick_atual - lii.dwTime) / 1000.0

def obter_monitor_janela(janela):
    """Determina em qual monitor a janela está."""
    x, y = janela.left, janela.top
    for idx, m in enumerate(get_monitors(), start=1):
        if m.x <= x < m.x + m.width and m.y <= y < m.y + m.height:
            return f"Monitor {idx}"
    return "Desconhecido"

def obter_janelas():
    janelas = {}
    for janela in gw.getWindowsWithTitle(''):
        if janela.title:
            monitor = obter_monitor_janela(janela)
            janelas[janela.title] = {
                'ativo': janela.isActive,
                'monitor': monitor,
                'posicao': {'left': janela.left, 'top': janela.top, 'width': janela.width, 'height': janela.height}
            }
    return janelas

def detectar_eventos_janelas(estado_atual, estado_anterior):
    eventos = []

    # Abertura de janelas
    for titulo in estado_atual:
        if titulo not in estado_anterior:
            eventos.append({'evento': 'aberta', 'titulo': titulo, **estado_atual[titulo]})

    # Fechamento de janelas
    for titulo in estado_anterior:
        if titulo not in estado_atual:
            eventos.append({'evento': 'fechada', 'titulo': titulo})

    # Mudança de foco ou monitor
    for titulo in estado_atual:
        if titulo in estado_anterior:
            antigo = estado_anterior[titulo]
            atual = estado_atual[titulo]
            if antigo['ativo'] != atual['ativo']:
                eventos.append({'evento': 'foco', 'titulo': titulo, **atual})
            elif antigo['monitor'] != atual['monitor']:
                eventos.append({'evento': 'mudanca_monitor', 'titulo': titulo, **atual})

    return eventos

def coletar_desempenho():
    return {
        'cpu': psutil.cpu_percent(interval=None),
        'ram': psutil.virtual_memory().percent,
        'disco': psutil.disk_usage('/').percent
    }

def conectar_servidor():
    while True:
        try:
            client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            client.connect((SERVER_IP, SERVER_PORT))
            print(f"Conectado ao servidor {SERVER_IP}:{SERVER_PORT}")
            return client
        except Exception as e:
            print(f"Falha na conexão: {e}. Tentando novamente em {RECONNECT_DELAY}s...")
            time.sleep(RECONNECT_DELAY)

def enviar_eventos(client):
    global buffer_eventos
    while buffer_eventos:
        try:
            evento = buffer_eventos.pop(0)
            client.send(json.dumps(evento).encode())
        except Exception:
            buffer_eventos.insert(0, evento)
            raise

def main():
    global estado_janelas, estado_atividade, buffer_eventos

    estado_janelas = obter_janelas()
    client = conectar_servidor()

    try:
        while True:
            eventos = []

            # Mudanças de janelas
            estado_atual = obter_janelas()
            eventos += detectar_eventos_janelas(estado_atual, estado_janelas)
            estado_janelas = estado_atual

            # Atividade do usuário
            if tempo_ultimo_input() >= INATIVO_SEGUNDOS:
                if estado_atividade:
                    eventos.append({'evento': 'inativo'})
                    estado_atividade = False
            else:
                if not estado_atividade:
                    eventos.append({'evento': 'ativo'})
                    estado_atividade = True

            # Prepara dados se houver eventos
            if eventos:
                dados = {
                    'timestamp': time.strftime("%Y-%m-%d %H:%M:%S"),
                    'host': os.environ.get('COMPUTERNAME', 'Desconhecido'),
                    'eventos': eventos,
                    'desempenho': coletar_desempenho()
                }
                buffer_eventos.append(dados)

            # Envia eventos do buffer
            try:
                enviar_eventos(client)
            except Exception:
                print("Conexão perdida. Reconectando...")
                client.close()
                client = conectar_servidor()

            time.sleep(INTERVALO)

    except KeyboardInterrupt:
        print("Cliente encerrado.")
        client.close()

if __name__ == "__main__":
    main()
