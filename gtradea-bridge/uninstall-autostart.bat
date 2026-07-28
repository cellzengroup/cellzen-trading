@echo off
REM Stops the gtradea bridge from auto-starting at login (removes the Startup shortcut).
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Cellzen gtradea Bridge.lnk" 2>nul
echo Removed the gtradea bridge from auto-start.
echo (It keeps running until you reboot or close it from Task Manager.)
echo.
pause
