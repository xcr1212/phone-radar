@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
  set /p TARGET_URL=Paste phone specs URL: 
) else (
  set "TARGET_URL=%~1"
)

if "%TARGET_URL%"=="" (
  echo No URL provided.
  pause
  exit /b 1
)

call npm.cmd run grab -- "%TARGET_URL%"
if errorlevel 1 (
  echo.
  echo Grab failed.
  pause
  exit /b 1
)

echo.
echo Done. Opening output folder...
start "" "%~dp0grabbed-specs"
pause
