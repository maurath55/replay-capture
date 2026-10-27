# Creates (or removes with -Remove) two shortcuts, no admin needed:
#   Startup folder  -> Replay Capture starts hidden at logon
#   Desktop         -> "Replay Capture" opens the library in its own window
param([switch]$Remove)
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Replay Capture.lnk'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Replay Capture.lnk'
if ($Remove) { Remove-Item $startup, $desktop -ErrorAction SilentlyContinue; "removed shortcuts"; exit }
$ws = New-Object -ComObject WScript.Shell
function Make-Shortcut($path, $script, $desc) {
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = 'powershell.exe'
  $s.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot $script) + '"'
  $s.WorkingDirectory = $PSScriptRoot
  $s.WindowStyle = 7   # minimized: no console flash
  $s.IconLocation = (Join-Path $PSScriptRoot 'ui\icon.ico') + ',0'
  $s.Description = $desc
  $s.Save()
  "installed $path"
}
Make-Shortcut $startup 'start-hidden.ps1' 'Replay Capture: auto game recorder (starts at logon)'
Make-Shortcut $desktop 'open-library.ps1' 'Replay Capture: your recordings'
