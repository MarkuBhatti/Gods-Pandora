@echo off
cd /d "%~dp0"
title God's Pandora - Set GitHub username
echo.
echo  This writes your GitHub username into package.json and README.md
echo  so the in-app updater knows where your releases live
echo  (https://github.com/USERNAME/gods-pandora/releases).
echo.
set /p GHUSER=Your GitHub username: 
if "%GHUSER%"=="" (
  echo  No username entered. Nothing changed.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$u='%GHUSER%'; foreach($f in 'package.json','README.md'){ $p=Join-Path (Get-Location).Path $f; $t=[IO.File]::ReadAllText($p); $t=$t.Replace('YOUR_GITHUB_USERNAME',$u); [IO.File]::WriteAllText($p,$t,(New-Object Text.UTF8Encoding $false)) }"
if errorlevel 1 (
  echo  [ERROR] Could not update the files.
  pause
  exit /b 1
)
echo.
echo  Done. Username set to %GHUSER%.
echo  Now run BUILD.bat to build the installer.
echo.
pause
