# Adds (or removes with -Remove) a Startup-folder shortcut so Replay Capture starts at logon. No admin needed.
param([switch]$Remove)
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Replay Capture.lnk'
if ($Remove) { Remove-Item $lnk -ErrorAction SilentlyContinue; "removed $lnk"; exit }
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = 'powershell.exe'
$s.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'start-hidden.ps1') + '"'
$s.WorkingDirectory = $PSScriptRoot
$s.Description = 'Replay Capture: auto game recorder'
$s.Save()
"installed $lnk"
