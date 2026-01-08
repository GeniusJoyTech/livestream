@echo off
echo ========================================
echo SimplificaVideos Broadcaster - Build EXE
echo ========================================
echo.

REM Verifica se PyInstaller está instalado
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Instalando PyInstaller...
    pip install pyinstaller
)

echo.
echo Iniciando build...
echo.

REM Usa o arquivo .spec para build
pyinstaller Broadcaster.spec --clean

echo.
if exist "dist\Broadcaster.exe" (
    echo ========================================
    echo BUILD CONCLUIDO COM SUCESSO!
    echo ========================================
    echo.
    echo O arquivo foi criado em: dist\Broadcaster.exe
    echo.
    echo IMPORTANTE: Copie tambem o arquivo broadcaster_config.json
    echo para a pasta ~/.simplificavideos/ no computador de destino.
) else (
    echo ========================================
    echo ERRO NO BUILD!
    echo ========================================
    echo.
    echo Verifique os erros acima e tente novamente.
)

echo.
pause
