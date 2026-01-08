@echo off
echo ========================================
echo SimplificaVideos Broadcaster - Build EXE
echo ========================================
echo.

echo [1/6] Verificando Python...
python --version
if %errorlevel% neq 0 (
    echo.
    echo ERRO: Python nao encontrado!
    echo Instale Python 3.10+ em: https://www.python.org/downloads/
    echo IMPORTANTE: Marque Add Python to PATH durante instalacao!
    pause
    exit /b 1
)

echo.
echo [2/6] Baixando Visual C++ Redistributable...
if not exist "vc_redist.x64.exe" (
    powershell -Command "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile 'vc_redist.x64.exe'"
)
if exist "vc_redist.x64.exe" echo OK: vc_redist.x64.exe

echo.
echo [3/6] Instalando dependencias Python...
pip install pyinstaller mss opencv-python numpy websockets aiortc av psutil pywin32 Pillow cryptography aioice --quiet

echo.
echo [4/6] Verificando arquivos...
if not exist "Broadcaster.py" (
    echo ERRO: Broadcaster.py nao encontrado!
    pause
    exit /b 1
)
if not exist "Broadcaster.spec" (
    echo ERRO: Broadcaster.spec nao encontrado!
    pause
    exit /b 1
)

echo.
echo [5/6] Limpando builds anteriores...
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist

echo.
echo [6/6] Criando executavel...
pyinstaller Broadcaster.spec --clean

echo.
if exist "dist\Broadcaster.exe" (
    echo ========================================
    echo BUILD CONCLUIDO COM SUCESSO!
    echo ========================================
    echo Arquivo: dist\Broadcaster.exe
    if exist "vc_redist.x64.exe" copy "vc_redist.x64.exe" "dist\" >nul
) else (
    echo ERRO NO BUILD! Verifique os erros acima.
)

echo.
pause
