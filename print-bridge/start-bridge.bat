@echo off
REM Double-click to start the Cellzen thermal print bridge for the Deli 720C.
cd /d "%~dp0"
title Cellzen Print Bridge (Deli 720C)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. Install the LTS version from https://nodejs.org
  echo   then double-click this file again.
  echo.
  pause
  exit /b 1
)
node bridge.js
echo.
echo   The print bridge stopped. See any message above.
pause
