@echo off
REM Keeps the Cellzen gtradea bridge running; if it ever stops, it restarts after 3s.
cd /d "%~dp0"
:loop
node bridge.js
timeout /t 3 /nobreak >nul
goto loop
