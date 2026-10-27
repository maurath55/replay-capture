# Replay Capture

Records your League of Legends and TFT games by itself (OBS Studio underneath), marks the moments
(kills, deaths, assists, objectives; TFT rounds won/lost), builds a highlights reel per game, and gives
you a library to watch, trim and share clips, on your PC or your phone. No ads, no game injection, no
admin rights, no accounts; nothing leaves your PC.

## Install (Windows 11, NVIDIA GPU)
1. Download the zip: https://github.com/maurath55/replay-capture/archive/refs/heads/main.zip
2. Unzip it somewhere permanent (for example `Documents\replay-capture`).
3. Double-click **Install.cmd**. Nothing stays open: progress shows as notifications by the clock.
   Say **Yes** if Windows asks for permission (Node.js, OBS Studio and ffmpeg are installed if missing).
4. After a few minutes the library opens and a **Replay Capture** shortcut is on your desktop. Done.

From then on it starts with Windows (hidden; OBS sits in the tray) and records every League or TFT game.
Open the recordings any time with the desktop shortcut.

To update: download the zip again, unzip over the old folder, double-click Install.cmd again.
To remove: `powershell -ExecutionPolicy Bypass -File install-shortcuts.ps1 -Remove`, then delete the folder.
Your recordings stay in `Videos\Replay Capture`.

## Using it
- **Recordings** list: kills / deaths / assists and Win/Loss per game (TFT: rounds won/lost).
- **Player**: tap to play/pause, double-tap left/right to skip 10 s, pinch (or mouse wheel) to zoom,
  drag to look around, ⏮ ⏭ jump between markers, speed 0.25×–3×. Markers sit on the seek bar.
  Playback resumes where you left off, on any device.
- **Highlights reel**: made for you after every League game (about 10 s before and 5 s after each
  kill, death, assist and objective, joined into one video). "Remake" rebuilds it.
- **Clips**: press `[ In` and `Out ]` (keys `i` / `o`), then **Clip**. Fast clips copy the stream
  (cut snaps to a keyframe, up to 2 s); "frame-precise" re-encodes with NVENC. Clips are never auto-deleted.
- **Keys** (PC): space play/pause, ← → 5 s, ↑ ↓ speed, `n` / `p` next/previous marker.
- **Phone**: open `http://<your-pc-name>:5178` on the same Wi-Fi, or over Tailscale with
  `tailscale serve --bg --http 8652 http://127.0.0.1:5178` on the PC.
- **If a game could not be recorded** you get a Windows notification and a red banner in the library.
- **Storage**: past `quotaGB` (default 150) the oldest non-favourite recordings are deleted.

## Settings
`config.json` (written by setup): resolution/fps/bitrate, library folder, quota, port, watched games.
Setup picks your largest monitor for the recording size. Restart after editing (close from Task
Manager or sign out/in, or just run the desktop shortcut after a reboot).
To add a game without an event source, add its exe to `games`; you get the recording, no markers.

## How it works
- One small Node service keeps OBS minimized in the tray and watches the process list every 2 s.
- Game launches → OBS records (HEVC NVENC, 60 fps, native resolution, 15 Mbps, crash-safe hybrid MP4).
- Game exits → recording stops, file is renamed `<Game> - <date time>.mp4`, a `.json` sidecar stores the markers.
- Markers: League from Riot's local Live Client API; TFT from the game's own log file.
- OBS 32 sometimes leaves crash markers that block its start with a hidden dialog; the service clears them.

## Files
- `Install.cmd` / `install.ps1` one-click setup (hidden; log in `logs\install.log`)
- `setup.mjs` machine setup: installs OBS + ffmpeg via winget if missing, detects the monitor, seeds OBS
- `install-shortcuts.ps1` Startup + Desktop shortcuts (`-Remove` to undo)
- `start-hidden.ps1` starts the service with no window; `open-library.ps1` opens the library as an app window
- `service/` the service (`index.mjs`, `obs.mjs`, `watcher.mjs`, `library.mjs`, `server.mjs`, `notify.mjs`, `events/`)
- `ui/` the library page and icon
- `test/` parser and reel tests: `npm test`
