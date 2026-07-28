@echo off
REM Double-click to start the Cellzen gtradea 1688 bridge.
cd /d "%~dp0"
title Cellzen gtradea 1688 Bridge
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
echo   The gtradea bridge stopped. See any message above.
pause
