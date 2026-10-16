@echo off
rem Replay Capture service (hidden window). Logs to logs\service.log
cd /d "%~dp0"
if not exist logs mkdir logs
node service\index.mjs >> logs\service.log 2>&1
