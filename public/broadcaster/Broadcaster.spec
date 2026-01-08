# -*- mode: python ; coding: utf-8 -*-
# SimplificaVideos Broadcaster - PyInstaller Spec File (COM CONSOLE)
# Uso: pyinstaller Broadcaster.spec --clean

from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_dynamic_libs

block_cipher = None

hidden_imports = [
    'mss', 'mss.windows', 'mss.linux', 'mss.darwin',
    'aiortc', 'aiortc.codecs', 'aiortc.codecs.h264', 'aiortc.codecs.vpx',
    'aiortc.codecs.opus', 'aiortc.codecs.g711', 'aiortc.rtcrtpparameters',
    'aiortc.mediastreams', 'aiortc.contrib', 'aiortc.contrib.media',
    'aiortc.contrib.signaling', 'aioice', 'aioice.stun', 'aioice.turn',
    'av', 'av.audio', 'av.audio.frame', 'av.audio.codeccontext',
    'av.codec', 'av.codec.codec', 'av.codec.context',
    'av.container', 'av.container.core', 'av.container.input', 'av.container.output',
    'av.video', 'av.video.frame', 'av.video.codeccontext', 'av.filter', 'av.format', 'av.stream',
    'websockets', 'websockets.client', 'websockets.server',
    'cv2', 'numpy', 'psutil', 'cryptography', 'OpenSSL', 'PIL', 'PIL.Image',
    'dns', 'dns.resolver', 'dateutil', 'dateutil.parser',
    'broadcaster', 'broadcaster.config', 'broadcaster.monitoring',
    'broadcaster.video', 'broadcaster.client',
]

hidden_imports += collect_submodules('av')
hidden_imports += collect_submodules('aiortc')
hidden_imports += collect_submodules('aioice')
hidden_imports += collect_submodules('mss')
hidden_imports += collect_submodules('websockets')

binaries = []
binaries += collect_dynamic_libs('av')
binaries += collect_dynamic_libs('aiortc')
binaries += collect_dynamic_libs('cryptography')
binaries += collect_dynamic_libs('cv2')

datas = []
datas += collect_data_files('av')
datas += collect_data_files('aiortc')
datas += collect_data_files('certifi')

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
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
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
