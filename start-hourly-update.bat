@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Phone Radar hourly updater is running.
echo Keep this window open if you want automatic updates.
echo Press Ctrl+C to stop.
:loop
call "%~dp0update-news.bat" /silent
echo Updated at %date% %time%. Next update in 60 minutes.
timeout /t 3600 /nobreak >nul
goto loop
