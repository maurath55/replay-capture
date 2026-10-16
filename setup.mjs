// One-time machine setup. Run:  node setup.mjs   (re-runnable; keeps an existing password/config values)
// - detects the game monitor (largest display) for the recording resolution
// - writes config.json
// - seeds OBS: ReplayCapture profile, Game scene, websocket enabled, first-run wizard skipped
// - installs OBS Studio + ffmpeg via winget if missing
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = path.join(root, 'config.json');
const prev = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const home = os.homedir().replace(/\\/g, '/');
const appdata = (process.env.APPDATA ?? path.join(os.homedir(), 'AppData/Roaming')).replace(/\\/g, '/');
const obsExe = prev.obsExe ?? 'C:/Program Files/obs-studio/bin/64bit/obs64.exe';

function winget(id) {
  console.log(`[setup] installing ${id} via winget (this downloads from the vendor)`);
  const r = spawnSync('winget', ['install', '--id', id, '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`winget install ${id} failed (${r.status})`);
}
if (!existsSync(obsExe)) winget('OBSProject.OBSStudio');
if (spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status !== 0) winget('Gyan.FFmpeg');

// Game monitor = the largest attached display. Fallback 1920x1080.
let width = 1920, height = 1080;
try {
  const ps = 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { "$($_.Bounds.Width)x$($_.Bounds.Height) $($_.Primary) $($_.DeviceName)" }';
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps]).toString().trim().split(/\r?\n/);
  console.log('[setup] displays:', out.join(' | '));
  const best = out.map((l) => l.match(/^(\d+)x(\d+)/)).filter(Boolean).map((m) => [Number(m[1]), Number(m[2])]).sort((a, b) => b[0] * b[1] - a[0] * a[1])[0];
  if (best) [width, height] = best;
} catch (e) { console.warn('[setup] display detection failed, using 1080p:', e.message); }
// Windows reports logical pixels when DPI scaling is on; OBS wants physical. Round up common cases.
const fix = { '3840x2160': [3840, 2160], '2560x1440': [2560, 1440], '5120x1440': [5120, 1440], '3440x1440': [3440, 1440] };
const key = `${width}x${height}`; if (fix[key]) [width, height] = fix[key];

const password = prev.obsWs?.password ?? randomBytes(18).toString('base64url');
const cfg = {
  libraryDir: prev.libraryDir ?? `${home}/Videos/Replay Capture`,
  obsExe,
  obsWs: { url: 'ws://127.0.0.1:4455', password },
  port: prev.port ?? 5178,
  quotaGB: prev.quotaGB ?? 150,
  video: prev.video ?? { width, height, fps: 60, bitrateKbps: 15000, encoder: 'obs_nvenc_hevc_tex' },
  games: prev.games ?? { 'TFTClient-Win64-Shipping.exe': 'Teamfight Tactics', 'League of Legends.exe': 'League of Legends' },
};
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
mkdirSync(path.join(cfg.libraryDir, 'clips'), { recursive: true });
console.log(`[setup] config.json written: ${cfg.video.width}x${cfg.video.height}@${cfg.video.fps}, library ${cfg.libraryDir}`);

// ---- seed OBS config (only files we own; OBS fills in the rest on first start) ----
const O = `${appdata}/obs-studio`;
for (const d of ['plugin_config/obs-websocket', 'basic/profiles/ReplayCapture', 'basic/scenes', 'logs']) mkdirSync(`${O}/${d}`, { recursive: true });
writeFileSync(`${O}/plugin_config/obs-websocket/config.json`, JSON.stringify({ alerts_enabled: false, auth_required: true, first_load: false, server_enabled: true, server_password: password, server_port: 4455 }, null, 2));
const general = `[General]\nFirstRun=true\nPre19Defaults=false\nPre21Defaults=false\nPre23Defaults=false\nPre24.1Defaults=false\nPre31Migrated=true\nConfirmOnExit=false\nEnableAutoUpdates=false\n\n[Basic]\nProfile=ReplayCapture\nProfileDir=ReplayCapture\nSceneCollection=Game\nSceneCollectionFile=Game\n`;
for (const f of ['global.ini', 'user.ini']) if (!existsSync(`${O}/${f}`)) writeFileSync(`${O}/${f}`, general);
const v = cfg.video;
const winLib = cfg.libraryDir.replace(/\//g, '\\');
writeFileSync(`${O}/basic/profiles/ReplayCapture/basic.ini`, `[General]\nName=ReplayCapture\n\n[Output]\nMode=Advanced\nFilenameFormatting=%CCYY-%MM-%DD %hh-%mm-%ss\n\n[AdvOut]\nRecType=Standard\nRecFilePath=${winLib}\nRecFormat2=hybrid_mp4\nRecEncoder=${v.encoder}\nRecTracks=1\nRecUseRescale=false\n\n[Video]\nBaseCX=${v.width}\nBaseCY=${v.height}\nOutputCX=${v.width}\nOutputCY=${v.height}\nFPSType=0\nFPSCommon=${v.fps}\n\n[Audio]\nSampleRate=48000\nChannelSetup=Stereo\n`);
writeFileSync(`${O}/basic/profiles/ReplayCapture/recordEncoder.json`, JSON.stringify({ bitrate: v.bitrateKbps, rate_control: 'CBR', preset2: 'p5', tune: 'hq', profile: 'main', lookahead: false, psycho_aq: true, bf: 2, keyint_sec: 2 }));
if (!existsSync(`${O}/basic/scenes/Game.json`)) {
  const scene = { name: 'Game', current_scene: 'Game', current_program_scene: 'Game', scene_order: [{ name: 'Game' }], sources: [
    { name: 'Game', id: 'scene', versioned_id: 'scene', settings: { id_counter: 1, custom_size: false, items: [{ name: 'Game Capture', id: 1, visible: true, locked: false, pos: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, bounds_type: 2, bounds: { x: v.width, y: v.height }, bounds_alignment: 0, align: 5 }] }, enabled: true, muted: false, volume: 1 },
    { name: 'Game Capture', id: 'game_capture', versioned_id: 'game_capture', settings: { capture_mode: 'any_fullscreen', capture_cursor: true, allow_transparency: false, hook_rate: 1 }, enabled: true, muted: false, volume: 1 },
    { name: 'Desktop Audio', id: 'wasapi_output_capture', versioned_id: 'wasapi_output_capture', settings: { device_id: 'default' }, enabled: true, muted: false, volume: 1, flags: 0 },
    { name: 'Mic/Aux', id: 'wasapi_input_capture', versioned_id: 'wasapi_input_capture', settings: { device_id: 'default' }, enabled: true, muted: false, volume: 1, flags: 0 },
  ] };
  writeFileSync(`${O}/basic/scenes/Game.json`, JSON.stringify(scene));
}
console.log('[setup] OBS seeded. Next:  npm start   (then open http://localhost:' + cfg.port + ')');
