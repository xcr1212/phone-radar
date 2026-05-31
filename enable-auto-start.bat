@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_FILE=%STARTUP_DIR%\Phone Radar Auto Start.vbs"

copy /Y "%~dp0startup-phone-radar.vbs" "%STARTUP_FILE%" >nul
if errorlevel 1 (
  echo Failed to enable auto start.
  echo Please send this window text to Codex.
  pause
  exit /b 1
)

call "%~dp0start-background.bat"
echo Phone Radar auto start is enabled.
echo You can now open http://127.0.0.1:8765/ in your browser.
pause
