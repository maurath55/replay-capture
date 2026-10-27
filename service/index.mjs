// Replay Capture service: OBS in the tray, auto-record on game launch, event markers, local library UI.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Obs } from './obs.mjs';
import { GameWatcher } from './watcher.mjs';
import { Library } from './library.mjs';
import { startServer } from './server.mjs';
import { TftTailer } from './events/tft.mjs';
import { LeaguePoller } from './events/league.mjs';
import { notify } from './notify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(process.env.REPLAY_CONFIG ?? path.join(root, 'config.json'), 'utf8'));
const log = { info: (...a) => console.log(new Date().toISOString(), ...a), warn: (...a) => console.warn(new Date().toISOString(), ...a) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const library = new Library(cfg.libraryDir, { quotaGB: cfg.quotaGB, log });
await library.init();
const obs = new Obs(cfg, log);

let session = null; // { game, exe, startedAt, events: [], collector }
let obsReady = false;
const failures = []; // recent "a game was not recorded" problems, shown on the library page
function fail(game, reason) {
  log.warn(`[svc] NOT RECORDED: ${game}: ${reason}`);
  failures.unshift({ at: new Date().toISOString(), game, reason }); failures.length = Math.min(failures.length, 20);
  notify('Replay Capture: not recording', `${game}: ${reason}`, { log });
}
obs.onClosed = () => { if (session && !session.obsLost) { session.obsLost = true; fail(session.game, 'OBS disconnected during the game; the recording may be lost'); } };

async function ensureObs() {
  if (obsReady && obs.connected) return;
  try {
    const launched = await obs.launchIfNeeded();
    if (launched) await sleep(4000);
    if (!obs.connected) await obs.connect(90000);
    await obs.ensureSetup();
    obsReady = true;
    log.info('[svc] OBS ready');
  } catch (e) { obsReady = false; log.warn('[svc] OBS not ready:', e.message); }
}

function collectorFor(game) {
  if (game === 'Teamfight Tactics') return new TftTailer();
  if (game === 'League of Legends') return new LeaguePoller();
  return null;
}

const watcher = new GameWatcher(cfg.games, { intervalMs: 2000, graceMs: 15000 });
watcher.on('start', async (g) => {
  log.info(`[svc] game started: ${g.name}`);
  await ensureObs();
  if (!obsReady) return fail(g.name, 'OBS is not available');
  try {
    await obs.startRecord();
    session = { game: g.name, exe: g.exe, startedAt: obs.recordStartedAt ?? new Date(), events: [], collector: collectorFor(g.name) };
    session.collector?.on('event', (e) => { session.events.push(e); log.info(`[ev] ${e.type} ${e.label ?? ''}`); });
    session.collector?.start();
    log.info('[svc] recording');
  } catch (e) { fail(g.name, `recording could not start (${e.message})`); }
});
watcher.on('stop', async (g) => {
  log.info(`[svc] game exited: ${g.name}`);
  const s = session; session = null;
  try {
    s?.collector?.stop();
    const outputPath = await obs.stopRecord();
    if (!s) return;
    if (!outputPath) return fail(s.game, 'OBS produced no file');
    await sleep(2000); // let OBS finalize the hybrid mp4
    const meta = await library.addRecording({ outputPath, game: s.game, startedAt: s.startedAt, endedAt: new Date(), events: s.events });
    log.info(`[svc] saved ${meta.file} (${Math.round(meta.durationSec)} s, ${meta.events.length} markers)`);
    library.makeReel(meta.id).then((c) => { if (c) log.info(`[svc] highlights reel: ${c.moments} moments, ${Math.round(c.lengthSec)} s`); }).catch((e) => log.warn('[svc] reel failed:', e.message));
  } catch (e) { fail(s.game, `the recording could not be saved (${e.message})`); }
});
watcher.on('error', (e) => log.warn('[watcher]', e.message));

startServer({
  port: cfg.port, uiDir: path.join(root, 'ui'), library,
  status: () => ({ obs: obs.connected, recording: !!session, game: session?.game ?? null, since: session?.startedAt ?? null, events: session?.events.length ?? 0, video: cfg.video, failures }),
});
log.info(`[svc] library UI: http://localhost:${cfg.port}`);

await ensureObs();
watcher.start();
setInterval(() => { if (!session) ensureObs(); }, 15000); // reconnect watchdog (never while recording)

process.on('SIGINT', async () => { log.info('[svc] shutting down'); watcher.stop(); if (session) await obs.stopRecord().catch(() => {}); await obs.disconnect(); process.exit(0); });
