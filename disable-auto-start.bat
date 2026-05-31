@echo off
chcp 65001 >nul
set "STARTUP_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Phone Radar Auto Start.vbs"
if exist "%STARTUP_FILE%" del "%STARTUP_FILE%"
echo Phone Radar auto start is disabled.
pause
