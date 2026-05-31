@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%NODE_EXE%" ".\scripts\fetch-news.mjs"
if /i "%~1"=="/silent" exit /b
echo.
echo Done. Refresh index.html to see the latest daily report.
pause
