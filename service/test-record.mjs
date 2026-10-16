// Phase-1 check: launch OBS, enforce setup, record N seconds, stop, probe the file.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Obs } from './obs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const seconds = Number(process.argv[2] ?? 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const obs = new Obs(cfg);
const launched = await obs.launchIfNeeded();
if (launched) await sleep(4000);
await obs.connect();
await obs.ensureSetup();
console.log('[test] setup ok; recording', seconds, 's');
await obs.startRecord();
await sleep(seconds * 1000);
const file = await obs.stopRecord();
console.log('[test] stopped ->', file);
await sleep(1500);
const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,bit_rate', '-show_entries', 'format=duration,size', '-of', 'default=nw=1', file]).toString();
console.log(probe.trim());
await obs.disconnect();
