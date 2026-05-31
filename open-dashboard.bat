@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  echo Cannot find Node.js runtime:
  echo %NODE_EXE%
  pause
  exit /b 1
)

start "Phone Radar Server" /min "%NODE_EXE%" ".\scripts\server.mjs"

for /l %%i in (1,1,20) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8765/ -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)

echo Phone Radar local server did not start.
echo Please send this window text to Codex if it keeps happening.
pause
exit /b 1

:ready
start "" "http://127.0.0.1:8765/"
