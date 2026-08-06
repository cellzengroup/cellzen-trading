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
REM Exit code 3 = a copy was already running (usually the one that starts itself
REM at login). That is not a failure, so say so instead of "the bridge stopped".
if errorlevel 4 goto stopped
if errorlevel 3 goto already
goto stopped

:already
pause
exit /b 0

:stopped
echo.
echo   The print bridge stopped. See any message above.
pause
exit /b 1
