# Replay Capture — plan (2026-10-16)

Working name. A no-ads, no-injection, no-admin replacement for Insights Capture, built on OBS Studio.

## What it must do (Nelson's picks)
1. Auto full-match recording for TFT and League of Legends.
2. Kill/death (League) and round won/lost (TFT) highlight markers.
3. Clip trimming and a library to browse, favourite, delete.
Not needed: in-game overlay, uploads, ads, accounts.

## Settings (Nelson's picks)
- Library: `C:\Users\maura\Videos\Replay Capture` (existing Insights library untouched).
- Quality: native 5120x1440, 60 fps, HEVC NVENC, 15 Mbps (same as Insights).
- Container: OBS "hybrid MP4" (fragmented, survives crashes; important on this PC).

## Architecture
```
replay-capture/
  service/         Node 22, plain ESM JS, no build step
    index.mjs      starts everything
    obs.mjs        launches OBS minimized, connects obs-websocket, owns profile+scene
    watcher.mjs    polls process list every 2 s: TFTClient-Win64-Shipping.exe, League of Legends.exe
    events/
      league.mjs   polls https://127.0.0.1:2999/liveclientdata/eventdata (kills/deaths/assists)
      tft.mjs      tails %LOCALAPPDATA%\TFT\Saved\Logs\TFT.log: PlanningDeparture=combat start,
                   CombatDeparture=combat end, VO UnitCombatVictory=round won (else lost)
    library.mjs    sidecar JSON per recording (game, start, duration, events, favourite), clips/, quota
    server.mjs     http://localhost:5178 — library UI + API (list, player, trim, delete, favourite)
  ui/              vanilla HTML/JS: list → player with marker timeline → trim → clip
  tools/           ffmpeg (already on PATH via winget) for clip cuts (-c copy) and thumbnails
```
No database: one `.json` next to each `.mp4`. No Electron: the UI is a browser tab.

## How recording works
- Watcher sees the game process → OBS `StartRecord` (OBS already running minimized to tray at logon).
- Game process exits → 5 s grace → `StopRecord` → sidecar JSON finalized with events.
- Event timestamps are relative to OBS's record-start time (from `RecordStateChanged`).
- OBS profile `ReplayCapture` is created and enforced by the service on every start, so Nelson never configures OBS.
- Scene `Game`: Game Capture source, mode "capture any fullscreen application"; desktop audio + default mic.

## Phases and checks
| Phase | Deliverable | Check |
|---|---|---|
| 1 | OBS installed, websocket enabled, profile+scene created by the service, 10 s manual recording lands in the library folder | file exists, plays, is 5120x1440 60 fps HEVC (ffprobe) |
| 2 | Watcher auto start/stop on TFT and League | Nelson plays one game; one mp4 + json per game |
| 3 | Event markers | TFT: parser replayed against the 15.7 MB log from 10/16 gives the expected round list; League: a real game shows kills/deaths |
| 4 | Library UI + trim | open localhost:5178, cut a clip, clip plays |
| 5 | Autostart (Startup folder shortcut, user level), quota (default 150 GB, oldest unfavourited first) | reboot, service up, OBS in tray |

## Flaws of the original this avoids
- Ad stack (IAS, DoubleClick, Amazon APS, bidswitch, ~4 conns/s): none.
- Injection into the game + run-as-admin: none (process list + Riot's own local API + the game's own log file).
- 15 Electron processes / 2.5 GB RAM idle: one node process + OBS in tray.
- Mixpanel/Clarity telemetry: none.

## Open items (not blocking)
- Hotkey bookmark (for Battlefield etc.) — later.
- League live API in TFT: test during a real game; if it works, richer TFT events.
- Remove Insights Capture + Porofessor from Startup: Nelson's call once phase 2 is proven.
