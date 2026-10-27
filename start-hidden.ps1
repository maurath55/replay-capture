# Starts the Replay Capture service with no console window. Used by the Startup shortcut and open-library.ps1.
# Does nothing if it is already running. (Uses `return`, not `exit`, so callers that dot-source it keep going.)
Set-Location $PSScriptRoot
if (-not (Test-Path logs)) { New-Item -ItemType Directory logs | Out-Null }
$running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'replay-capture.service.index\.mjs' }
if ($running) { return }
Start-Process node -ArgumentList 'service\index.mjs' -WindowStyle Hidden -WorkingDirectory $PSScriptRoot -RedirectStandardOutput 'logs\service.log' -RedirectStandardError 'logs\service.err'
