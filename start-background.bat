@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8765/ -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
if not errorlevel 1 exit /b 0

start "Phone Radar Server" /min "%NODE_EXE%" ".\scripts\server.mjs"
exit /b 0
