@echo off
REM Stops the print bridge from auto-starting at login (removes the Startup shortcut).
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Cellzen Print Bridge.lnk" 2>nul
echo Removed the print bridge from auto-start.
echo (It keeps running until you reboot or close it from Task Manager.)
echo.
pause
