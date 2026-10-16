# Replay Capture

Auto-records TFT and League of Legends matches with OBS Studio, marks highlights, and gives you a local
library to trim clips. No ads, no game injection, no admin rights, no accounts, nothing leaves your PC.

## Install (Windows, NVIDIA GPU)
1. Install Node.js 22+ (https://nodejs.org) if `node --version` doesn't work.
2. Copy this folder anywhere, open a terminal in it and run:
   ```
   npm install
   node setup.mjs
   ```
   `setup.mjs` installs OBS Studio and ffmpeg via winget if missing, detects your game monitor's
   resolution, writes `config.json`, and seeds OBS with a `ReplayCapture` profile and `Game` scene.
3. Start it: `npm start` (or double-click `start.cmd`). Open http://localhost:5178.
4. Optional, start at logon: `powershell -ExecutionPolicy Bypass -File install-autostart.ps1`

## How it works
- A tiny Node service keeps OBS minimized in the tray and watches the process list every 2 s.
- Game launches → OBS starts recording (HEVC NVENC, 60 fps, native resolution, 15 Mbps, crash-safe hybrid MP4).
- Game exits → recording stops, file is renamed `<Game> - <date time>.mp4`, a `.json` sidecar stores the markers.
- Markers: League from Riot's local Live Client API (kills, deaths, assists, objectives);
  TFT from the game's own log file (each fight, round won/lost, game over).
- Library UI: pick a recording, click markers to jump, press `i`/`o` to set in/out, Make clip.
  Fast clips copy the stream (cut snaps to a keyframe, ≤2 s). "Frame-precise" re-encodes with NVENC.
- Quota: oldest non-favourite recordings are deleted past `quotaGB` (default 150). Clips are never deleted.

## Settings
Edit `config.json` (resolution, fps, bitrate, library folder, quota, port, watched games) and restart.
To add a game without an event source, add its exe to `games`; you get the recording, no markers.

## Files
- `service/` the service (`index.mjs` entry, `obs.mjs`, `watcher.mjs`, `library.mjs`, `server.mjs`, `events/`)
- `ui/index.html` the library page
- `test/` parser tests: `npm test`
