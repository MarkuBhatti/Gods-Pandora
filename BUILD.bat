@echo off
cd /d "%~dp0"
title God's Pandora - Build Installer
color 0B
set "LOG=%~dp0build-log.txt"
set CSC_IDENTITY_AUTO_DISCOVERY=false

:: Optional code signing: put your certificate settings in signing.env.bat (never committed).
:: See SIGNING.md. Without it the installer is built unsigned.
if exist "%~dp0signing.env.bat" (
    call "%~dp0signing.env.bat"
    echo   Code signing: ON
) else (
    echo   Code signing: OFF ^(create signing.env.bat - see SIGNING.md^)
)

echo.
echo  ======================================================
echo   GOD'S PANDORA  -  Building Windows Installer (.exe)
echo  ======================================================
echo   Full log: build-log.txt
echo.
echo God's Pandora build log > "%LOG%"

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Download it from https://nodejs.org
    pause
    exit /b 1
)

:: -- Close running copies so files are not locked --------------------------
echo  [0/4] Closing any running God's Pandora instances...
taskkill /F /IM "God's Pandora.exe"  >nul 2>&1
taskkill /F /IM "God's Eye.exe"   >nul 2>&1
taskkill /F /IM "electron.exe"   >nul 2>&1
timeout /t 2 /nobreak >nul
if exist "release\win-unpacked" rmdir /S /Q "release\win-unpacked" >nul 2>&1

echo  [1/4] Installing dependencies (npm install)...
call npm install >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo  [2/4] Building UI (Vite)...
call npm run build:ui >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

:: -- Fix for "Cannot create symbolic link: A required privilege is not held" --
:: electron-builder's winCodeSign archive contains macOS symlinks that Windows
:: cannot extract without admin/Developer Mode. Pre-extract it without them.
echo  [3/4] Preparing Windows build tools...
set "WCS_DIR=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
set "WCS=%WCS_DIR%\winCodeSign-2.6.0"
if not exist "%WCS%\rcedit-x64.exe" (
    if not exist "%WCS_DIR%" mkdir "%WCS_DIR%"
    curl.exe -L --fail --silent --show-error -o "%TEMP%\winCodeSign-2.6.0.7z" https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo  [WARN] Could not download winCodeSign - continuing anyway.
    ) else (
        "node_modules\7zip-bin\win\x64\7za.exe" x -y -bd "-xr!darwin" "-o%WCS%" "%TEMP%\winCodeSign-2.6.0.7z" >> "%LOG%" 2>&1
    )
)

echo  [4/4] Packaging installer (electron-builder) - this takes a few minutes...
call npx electron-builder --win --publish never >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo.
echo  ======================================================
echo   DONE!
echo   Installer:  release\Gods-Pandora-Setup-*.exe
echo   Double-click it to install on this PC.
echo  ======================================================
echo.
start "" "release"
pause
exit /b 0

:fail
echo.
echo  ======================================================
echo   [ERROR] Build failed. Last lines of build-log.txt:
echo  ======================================================
powershell -NoProfile -Command "Get-Content -Path $env:LOG -Tail 40"
echo.
echo  The full log is saved as build-log.txt in this folder.
echo  Tell Claude "check build-log.txt" and it can read it.
echo.
pause
exit /b 1
