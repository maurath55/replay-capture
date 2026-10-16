# Starts the Replay Capture service with no console window. Used by the Startup shortcut.
Set-Location $PSScriptRoot
if (-not (Test-Path logs)) { New-Item -ItemType Directory logs | Out-Null }
$running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'replay-capture.service.index\.mjs' }
if ($running) { exit 0 }
Start-Process node -ArgumentList 'service\index.mjs' -WindowStyle Hidden -WorkingDirectory $PSScriptRoot -RedirectStandardOutput 'logs\service.log' -RedirectStandardError 'logs\service.err'
