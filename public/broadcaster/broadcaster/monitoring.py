"""
SimplificaVideos Broadcaster - Módulo de Monitoramento
Coleta de apps, URLs, histórico do navegador e tempo ocioso
"""

import asyncio
import json
import os
import re
import shutil
import sqlite3
import tempfile
import time
import psutil
from datetime import datetime, timedelta

from .config import nome_computador, sistema_operacional


def get_browser_history(hours_back=24):
    """Lê o histórico de navegação dos navegadores instalados."""
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
                try:
                    parsed_time = datetime.strptime(visit_time, '%Y-%m-%d %H:%M:%S')
                    iso_timestamp = parsed_time.isoformat()
                except Exception:
                    iso_timestamp = datetime.now().isoformat()
                
                history_entries.append({
                    'browser': browser['name'],
                    'url': url,
                    'title': title or 'Sem título',
                    'timestamp': iso_timestamp
                })
            
            conn.close()
            os.remove(temp_file)
            
            print(f"✅ {len(rows)} entradas do histórico do {browser['name']}")
            
        except Exception as e:
            print(f"⚠️ Erro ao ler histórico do {browser['name']}: {e}")
            if temp_file and os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except:
                    pass
    
    history_entries.sort(key=lambda x: x['timestamp'], reverse=True)
    return history_entries


class MonitoringService:
    """Serviço de monitoramento de atividades do usuário"""
    
    def __init__(self):
        self.idle_threshold = 60
        self.history_counter = 0
        self.history_interval = 30
        self.browser_history_cache = []
        self.running = False
    
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
        """Coleta lista de janelas ativas e app em primeiro plano"""
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
                                _, pid = win32process.GetWindowThreadProcessId(hwnd)
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
                    apps = windows[:20]

                    fg_hwnd = win32gui.GetForegroundWindow()
                    if fg_hwnd:
                        fg_title = win32gui.GetWindowText(fg_hwnd)
                        _, fg_pid = win32process.GetWindowThreadProcessId(fg_hwnd)
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
                            if len(apps) >= 20:
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
                        if len(apps) >= 20:
                            break
                    except:
                        pass
        except Exception as e:
            print(f"❌ Erro ao coletar apps: {e}")

        return apps, foreground_app
    
    def collect_data(self):
        """Coleta todos os dados de monitoramento"""
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
        
        return {
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
    
    async def start(self, send_callback):
        """Inicia loop de envio de dados de monitoramento"""
        print("🔄 Iniciando envio de dados de monitoramento...")
        self.running = True
        
        while self.running:
            try:
                data = self.collect_data()
                
                print(
                    f"📤 Enviando dados: {len(data['apps'])} apps, "
                    f"idle: {data['idle_seconds']:.1f}s, "
                    f"URL: {data['active_url'] or 'N/A'}, "
                    f"História: {len(self.browser_history_cache)} URLs"
                )
                
                await send_callback(json.dumps(data))
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"❌ Erro ao enviar monitoramento: {e}")
                import traceback
                traceback.print_exc()
                break
    
    def stop(self):
        """Para o serviço de monitoramento"""
        self.running = False
