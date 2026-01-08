@echo off
echo ========================================
echo SimplificaVideos Broadcaster - Instalacao
echo ========================================
echo.
echo Este programa instala os requisitos para
echo executar o Broadcaster.exe
echo.
pause

echo.
echo Instalando Visual C++ Redistributable...
if exist "vc_redist.x64.exe" (
    vc_redist.x64.exe /install /quiet /norestart
    echo Visual C++ instalado!
) else (
    echo Baixando Visual C++...
    powershell -Command "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile 'vc_redist.x64.exe'"
    if exist "vc_redist.x64.exe" (
        vc_redist.x64.exe /install /quiet /norestart
        echo Visual C++ instalado!
    ) else (
        echo Falha no download. Baixe manualmente:
        echo https://aka.ms/vs/17/release/vc_redist.x64.exe
    )
)

echo.
echo Verificando pasta de configuracao...
if not exist "%USERPROFILE%\.simplificavideos" (
    mkdir "%USERPROFILE%\.simplificavideos"
    echo Pasta criada: %USERPROFILE%\.simplificavideos
)

echo.
echo ========================================
echo INSTALACAO CONCLUIDA!
echo ========================================
echo.
echo Coloque o broadcaster_config.json em:
echo %USERPROFILE%\.simplificavideos\
echo.
echo Depois execute Broadcaster.exe
echo.
pause
