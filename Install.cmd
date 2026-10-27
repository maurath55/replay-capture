@echo off
rem Double-click to install Replay Capture. Runs hidden; watch for the tray notifications.
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0install.ps1"
