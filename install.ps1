# One-click setup, run hidden by Install.cmd. Progress shows as tray notifications; details in logs\install.log.
# Installs Node.js, OBS Studio and ffmpeg (winget) if missing, sets up OBS, adds the Startup + Desktop
# shortcuts, starts the service and opens the library. Windows PowerShell 5.1 compatible.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force logs | Out-Null
Start-Transcript -Path (Join-Path $PSScriptRoot 'logs\install.log') -Append | Out-Null
Add-Type -AssemblyName System.Windows.Forms
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = New-Object System.Drawing.Icon (Join-Path $PSScriptRoot 'ui\icon.ico')
$tray.Visible = $true
function Say($msg, $icon = 'Info') { Write-Host "[install] $msg"; $tray.ShowBalloonTip(10000, 'Replay Capture setup', $msg, $icon) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Run($exe, $argv) { & $exe @argv 2>&1 | ForEach-Object { "$_" } | Out-Host; if ($LASTEXITCODE -ne 0) { throw "$exe failed (exit $LASTEXITCODE)" } }
try {
  Say 'Installing. This takes a few minutes. Say Yes if Windows asks for permission.'
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'winget is missing. Install "App Installer" from the Microsoft Store, then run Install again.' }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Say 'Installing Node.js'
    Run 'winget' @('install', '--id', 'OpenJS.NodeJS.LTS', '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements')
    Refresh-Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js did not install. Install it from https://nodejs.org and run Install again.' }
  }
  Say 'Setting up (OBS Studio and ffmpeg are installed if missing)'
  Run 'npm.cmd' @('install', '--omit=dev', '--no-fund', '--no-audit')
  Run 'node' @('setup.mjs')
  Refresh-Path
  & (Join-Path $PSScriptRoot 'install-shortcuts.ps1') | Out-Host
  & (Join-Path $PSScriptRoot 'open-library.ps1')
  Say 'Ready. Games record by themselves when League or TFT starts. The "Replay Capture" shortcut on your desktop opens your recordings.'
  Start-Sleep -Seconds 12
} catch {
  Write-Host "[install] FAILED: $($_.Exception.Message)"
  Say "Setup failed: $($_.Exception.Message)" 'Error'
  Start-Sleep -Seconds 4
  Start-Process notepad (Join-Path $PSScriptRoot 'logs\install.log')
} finally { $tray.Dispose(); Stop-Transcript | Out-Null }
