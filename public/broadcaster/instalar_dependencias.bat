@echo off
echo ========================================
echo SimplificaVideos - Instalar Dependencias
echo ========================================
echo.

echo Verificando Python...
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
echo Instalando dependencias...
pip install -r requirements.txt

echo.
echo ========================================
echo INSTALACAO CONCLUIDA!
echo ========================================
echo.
echo Agora voce pode:
echo 1. Executar: python Broadcaster.py
echo 2. Criar exe: build_exe.bat
echo.
pause
