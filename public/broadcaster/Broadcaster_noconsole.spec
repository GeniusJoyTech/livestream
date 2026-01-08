# -*- mode: python ; coding: utf-8 -*-
# SimplificaVideos Broadcaster - PyInstaller Spec File (SEM CONSOLE)
# Uso: pyinstaller Broadcaster_noconsole.spec

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# Coleta todos os submódulos necessários
hidden_imports = [
    # MSS - Captura de tela
    'mss',
    'mss.windows',
    'mss.linux', 
    'mss.darwin',
    
    # aiortc - WebRTC
    'aiortc',
    'aiortc.codecs',
    'aiortc.rtcrtpparameters',
    'aiortc.mediastreams',
    'aiortc.contrib',
    'aiortc.contrib.media',
    
    # PyAV - Codecs de vídeo
    'av',
    'av.audio',
    'av.codec',
    'av.container',
    'av.video',
    'av.filter',
    
    # Outras dependências
    'websockets',
    'cv2',
    'numpy',
    'psutil',
    'cryptography',
    'OpenSSL',
    'PIL',
    'PIL.Image',
]

# Adiciona todos os submódulos de av e aiortc
hidden_imports += collect_submodules('av')
hidden_imports += collect_submodules('aiortc')
hidden_imports += collect_submodules('mss')

a = Analysis(
    ['Broadcaster.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='Broadcaster',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # <<< SEM CONSOLE - Janela oculta
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
