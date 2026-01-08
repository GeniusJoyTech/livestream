@echo off
chcp 65001 >nul
echo ========================================
echo SimplificaVideos Broadcaster - Instalacao
echo ========================================
echo.
echo Este programa instala os requisitos necessarios
echo para executar o Broadcaster.exe
echo.
echo Pressione qualquer tecla para continuar...
pause >nul

echo.
echo [1/2] Instalando Visual C++ Redistributable...
echo.

if exist "vc_redist.x64.exe" (
    echo Executando instalador do Visual C++...
    echo (Uma janela de instalacao pode aparecer)
    echo.
    vc_redist.x64.exe /install /quiet /norestart
    echo.
    echo Visual C++ instalado com sucesso!
) else (
    echo Arquivo vc_redist.x64.exe nao encontrado.
    echo Baixando da Microsoft...
    echo.
    powershell -Command "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile 'vc_redist.x64.exe'" 2>nul
    if exist "vc_redist.x64.exe" (
        echo Download concluido! Instalando...
        vc_redist.x64.exe /install /quiet /norestart
        echo Visual C++ instalado com sucesso!
    ) else (
        echo.
        echo AVISO: Nao foi possivel baixar automaticamente.
        echo Por favor, baixe e instale manualmente:
        echo https://aka.ms/vs/17/release/vc_redist.x64.exe
        echo.
    )
)

echo.
echo [2/2] Verificando configuracao...
echo.

set CONFIG_DIR=%USERPROFILE%\.simplificavideos
if not exist "%CONFIG_DIR%" (
    echo Criando pasta de configuracao...
    mkdir "%CONFIG_DIR%"
)

if exist "%CONFIG_DIR%\broadcaster_config.json" (
    echo Configuracao encontrada em:
    echo %CONFIG_DIR%\broadcaster_config.json
) else (
    echo.
    echo ATENCAO: Arquivo de configuracao nao encontrado!
    echo.
    echo Para configurar o Broadcaster:
    echo 1. Acesse o painel do SimplificaVideos
    echo 2. Va em Broadcasters e crie um novo
    echo 3. Clique em "Baixar broadcaster_config.json"
    echo 4. Copie o arquivo para:
    echo    %CONFIG_DIR%\broadcaster_config.json
)

echo.
echo ========================================
echo INSTALACAO CONCLUIDA!
echo ========================================
echo.
echo Agora voce pode executar o Broadcaster.exe
echo.
echo Se o video nao aparecer, verifique:
echo - Firewall do Windows (permita o Broadcaster)
echo - Antivirus (adicione excecao para o Broadcaster)
echo.
pause
