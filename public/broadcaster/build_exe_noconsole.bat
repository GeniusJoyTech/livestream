@echo off
echo ========================================
echo SimplificaVideos Broadcaster - Build EXE
echo         (SEM CONSOLE - Producao)
echo ========================================
echo.

REM Verifica se Visual C++ Redistributable existe
echo [1/4] Verificando Visual C++ Redistributable...
if not exist "vc_redist.x64.exe" (
    echo.
    echo AVISO: Visual C++ Redistributable nao encontrado!
    echo Baixando automaticamente...
    echo.
    powershell -Command "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile 'vc_redist.x64.exe'"
    if exist "vc_redist.x64.exe" (
        echo Download concluido: vc_redist.x64.exe
    ) else (
        echo ERRO: Falha no download. Baixe manualmente de:
        echo https://aka.ms/vs/17/release/vc_redist.x64.exe
    )
)

REM Verifica se PyInstaller está instalado
echo.
echo [2/4] Verificando PyInstaller...
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Instalando PyInstaller...
    pip install pyinstaller
) else (
    echo PyInstaller ja instalado.
)

echo.
echo [3/4] Iniciando build SEM console (producao)...
echo.

REM Build sem console (para producao)
pyinstaller Broadcaster_noconsole.spec --clean

echo.
if exist "dist\Broadcaster.exe" (
    echo ========================================
    echo BUILD SEM CONSOLE - CONCLUIDO!
    echo ========================================
    echo Arquivo: dist\Broadcaster.exe
    echo.
    
    REM Copia o VC++ Redistributable para a pasta dist
    if exist "vc_redist.x64.exe" (
        copy "vc_redist.x64.exe" "dist\vc_redist.x64.exe" >nul
        echo Visual C++ Redistributable copiado para dist\
    )
    
    echo.
    echo ATENCAO: Esta versao NAO mostra janela de console.
    echo Para debug, use a versao COM console (build_exe.bat)
) else (
    echo ========================================
    echo ERRO NO BUILD!
    echo ========================================
    echo Verifique os erros acima.
)

echo.
echo ========================================
echo INSTRUCOES DE DISTRIBUICAO:
echo ========================================
echo.
echo 1. Copie dist\Broadcaster.exe para o PC de destino
echo 2. Se o .exe nao executar, instale o vc_redist.x64.exe
echo 3. Coloque broadcaster_config.json em:
echo    %%USERPROFILE%%\.simplificavideos\broadcaster_config.json
echo.
pause
