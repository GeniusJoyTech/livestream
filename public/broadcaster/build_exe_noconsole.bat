@echo off
chcp 65001 >nul
echo ========================================
echo SimplificaVideos Broadcaster - Build EXE
echo         (SEM CONSOLE - Producao)
echo ========================================
echo.

REM Verifica se Python está instalado
echo [1/6] Verificando Python...
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
python --version

REM Verifica/baixa Visual C++ Redistributable
echo.
echo [2/6] Verificando Visual C++ Redistributable...
if not exist "vc_redist.x64.exe" (
    echo Baixando Visual C++ Redistributable...
    powershell -Command "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile 'vc_redist.x64.exe'" 2>nul
    if exist "vc_redist.x64.exe" (
        echo Download concluido: vc_redist.x64.exe
    ) else (
        echo AVISO: Falha no download. Baixe manualmente se necessario:
        echo https://aka.ms/vs/17/release/vc_redist.x64.exe
    )
) else (
    echo vc_redist.x64.exe ja existe.
)

REM Instala dependências Python necessárias
echo.
echo [3/6] Instalando dependencias Python...
echo.

echo Instalando PyInstaller...
pip install pyinstaller --quiet

echo Instalando mss (captura de tela)...
pip install mss --quiet

echo Instalando opencv-python (processamento de video)...
pip install opencv-python --quiet

echo Instalando numpy...
pip install numpy --quiet

echo Instalando websockets...
pip install websockets --quiet

echo Instalando aiortc (WebRTC)...
pip install aiortc --quiet

echo Instalando av (PyAV - codecs de video)...
pip install av --quiet

echo Instalando psutil (informacoes do sistema)...
pip install psutil --quiet

echo Instalando pywin32 (APIs do Windows)...
pip install pywin32 --quiet

echo Instalando Pillow (processamento de imagem)...
pip install Pillow --quiet

echo Instalando cryptography...
pip install cryptography --quiet

echo.
echo Dependencias instaladas com sucesso!

REM Verifica se o Broadcaster.py existe
echo.
echo [4/6] Verificando arquivos...
if not exist "Broadcaster.py" (
    echo ERRO: Broadcaster.py nao encontrado!
    echo Certifique-se de que este script esta na mesma pasta que Broadcaster.py
    pause
    exit /b 1
)

if not exist "Broadcaster_noconsole.spec" (
    echo ERRO: Broadcaster_noconsole.spec nao encontrado!
    echo Baixe o arquivo Broadcaster_noconsole.spec do servidor.
    pause
    exit /b 1
)

REM Limpa builds anteriores
echo.
echo [5/6] Limpando builds anteriores...
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist

REM Executa o build
echo.
echo [6/6] Iniciando build SEM console (producao)...
echo.
pyinstaller Broadcaster_noconsole.spec --clean

echo.
if exist "dist\Broadcaster.exe" (
    echo ========================================
    echo BUILD CONCLUIDO COM SUCESSO!
    echo ========================================
    echo.
    echo Arquivo gerado: dist\Broadcaster.exe
    echo.
    
    REM Copia o VC++ Redistributable para a pasta dist
    if exist "vc_redist.x64.exe" (
        copy "vc_redist.x64.exe" "dist\vc_redist.x64.exe" >nul
        echo Visual C++ Redistributable copiado para dist\
    )
    
    echo.
    echo ========================================
    echo ATENCAO - VERSAO SEM CONSOLE
    echo ========================================
    echo.
    echo Esta versao NAO mostra janela de console.
    echo O programa roda em segundo plano.
    echo.
    echo Para ver logs de debug, use: build_exe.bat
    echo.
    echo ========================================
    echo INSTRUCOES DE DISTRIBUICAO:
    echo ========================================
    echo.
    echo 1. Copie dist\Broadcaster.exe para o PC de destino
    echo.
    echo 2. Se o .exe nao executar, instale dist\vc_redist.x64.exe
    echo.
    echo 3. Baixe o broadcaster_config.json do painel e coloque em:
    echo    %%USERPROFILE%%\.simplificavideos\broadcaster_config.json
    echo.
    echo 4. Execute Broadcaster.exe
) else (
    echo ========================================
    echo ERRO NO BUILD!
    echo ========================================
    echo.
    echo Verifique os erros acima e tente novamente.
    echo.
    echo Possiveis solucoes:
    echo - Reinstale o Python com a opcao "Add to PATH"
    echo - Execute como Administrador
    echo - Verifique se ha espaco em disco suficiente
)

echo.
pause
