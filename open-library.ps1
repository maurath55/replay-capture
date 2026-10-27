# Opens the library as its own window (Chrome app mode, Edge as fallback, else the default browser).
# Starts the service first if it isn't running. Runs hidden; used by the desktop shortcut.
Set-Location $PSScriptRoot
& "$PSScriptRoot\start-hidden.ps1"
$port = 5178
try { $p = (Get-Content "$PSScriptRoot\config.json" -Raw | ConvertFrom-Json).port; if ($p) { $port = $p } } catch {}
$url = "http://localhost:$port/"
# 127.0.0.1, not localhost: Windows PowerShell tries IPv6 first and the service only listens on IPv4.
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-RestMethod "http://127.0.0.1:$port/api/status" -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
}
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$exe = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) { Start-Process $exe "--app=$url" } else { Start-Process $url }
