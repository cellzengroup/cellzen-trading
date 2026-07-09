@echo off
REM ==== Double-click ONCE to make the print bridge start automatically. ====
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. Install the LTS version from https://nodejs.org
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
echo   You can close this window. The bridge now runs in the background,
echo   and will start on its own every time you log in.
echo.
pause
