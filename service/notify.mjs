// Windows notification (tray balloon) without any visible window. Used when a game could not be recorded.
import { spawn } from 'node:child_process';

export function notify(title, body, { log = console } = {}) {
  if (process.platform !== 'win32') return;
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Warning
$n.Visible = $true
$n.BalloonTipTitle = ${psString(title)}
$n.BalloonTipText = ${psString(body)}
$n.BalloonTipIcon = 'Warning'
$n.ShowBalloonTip(15000)
Start-Sleep -Seconds 16
$n.Dispose()`;
  try {
    // Not detached: a detached PowerShell gets no console and exits at once without showing anything.
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')],
      { stdio: 'ignore', windowsHide: true });
    child.on('error', (e) => log.warn('[notify] failed:', e.message));
    child.unref();
  } catch (e) { log.warn('[notify] failed:', e.message); }
}

const psString = (s) => `'${String(s).replace(/'/g, "''")}'`;
