@echo off
chcp 65001 >nul
echo ========================================
echo SimplificaVideos - Instalar Dependencias
echo ========================================
echo.

REM Verifica se Python está instalado
echo Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERRO: Python nao encontrado!
    echo.
    echo Instale o Python 3.10+ em: https://www.python.org/downloads/
    echo IMPORTANTE: Marque "Add Python to PATH" durante a instalacao!
    echo.
    pause
    exit /b 1
)
echo Python encontrado:
python --version

echo.
echo ========================================
echo Instalando todas as dependencias...
echo ========================================
echo.

pip install -r requirements.txt

echo.
if errorlevel 0 (
    echo ========================================
    echo INSTALACAO CONCLUIDA!
    echo ========================================
    echo.
    echo Agora voce pode:
    echo.
    echo 1. Executar diretamente: python Broadcaster.py
    echo.
    echo 2. Criar o .exe: build_exe.bat (com console)
    echo                  build_exe_noconsole.bat (sem console)
    echo.
) else (
    echo ========================================
    echo ERRO NA INSTALACAO!
    echo ========================================
    echo.
    echo Tente executar como Administrador.
)

pause
