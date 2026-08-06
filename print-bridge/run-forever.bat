@echo off
REM Keeps the Cellzen print bridge running; if it ever stops, it restarts after 3s.
REM Exit code 3 means another copy is already serving the port, so restarting
REM would only clash with it again every 3 seconds - stop quietly instead.
cd /d "%~dp0"
:loop
node bridge.js
if errorlevel 4 goto restart
if errorlevel 3 exit /b 3
:restart
timeout /t 3 /nobreak >nul
goto loop
