// Library: one sidecar JSON per recording, clips/ subfolder, thumbnails, storage quota.
import { execFile } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const run = (cmd, args) => exec(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
/** Marker types that make the auto highlights reel (League; TFT rounds are not moments). */
export const HIGHLIGHT_TYPES = ['kill', 'death', 'assist', 'multikill', 'objective'];
const safe = (s) => s.replace(/[<>:"/\\|?*]/g, '-');

export class Library {
  constructor(dir, { quotaGB = 150, log = console } = {}) { this.dir = dir; this.clipsDir = path.join(dir, 'clips'); this.quotaGB = quotaGB; this.log = log; }

  async init() { await fs.mkdir(this.clipsDir, { recursive: true }); }

  metaPath(id) { return path.join(this.dir, `${id}.json`); }

  /** Register a finished OBS recording: rename to "<game> - <stamp>.mp4", write sidecar, thumbnail. */
  async addRecording({ outputPath, game, startedAt, endedAt, events }) {
    const stamp = fmtStamp(startedAt);
    const id = safe(`${game} - ${stamp}`);
    const target = path.join(this.dir, `${id}.mp4`);
    if (path.resolve(outputPath) !== path.resolve(target)) await retry(() => fs.rename(outputPath, target));
    const duration = await probeDuration(target).catch(() => (endedAt - startedAt) / 1000);
    const meta = {
      id, file: `${id}.mp4`, game, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), durationSec: duration,
      events: events.map((e) => ({ t: Math.max(0, Math.round(((e.t instanceof Date ? e.t : new Date(e.t)) - startedAt) / 100) / 10), type: e.type, label: e.label })),
      favorite: false, clips: [], sizeBytes: (await fs.stat(target)).size,
    };
    await fs.writeFile(this.metaPath(id), JSON.stringify(meta, null, 2));
    this.thumbnail(target, path.join(this.dir, `${id}.jpg`), Math.min(30, duration / 2)).catch((e) => this.log.warn('[lib] thumbnail failed', e.message));
    this.enforceQuota().catch((e) => this.log.warn('[lib] quota failed', e.message));
    return meta;
  }

  async list() {
    const names = (await fs.readdir(this.dir)).filter((n) => n.endsWith('.json'));
    const items = [];
    for (const n of names) { try { items.push(JSON.parse(await fs.readFile(path.join(this.dir, n), 'utf8'))); } catch {} }
    return items.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }
  async get(id) { return JSON.parse(await fs.readFile(this.metaPath(id), 'utf8')); }
  async save(meta) { await fs.writeFile(this.metaPath(meta.id), JSON.stringify(meta, null, 2)); return meta; }

  async remove(id) {
    const meta = await this.get(id);
    for (const c of meta.clips) await fs.rm(path.join(this.clipsDir, c.file), { force: true });
    await fs.rm(path.join(this.dir, meta.file), { force: true });
    await fs.rm(path.join(this.dir, `${id}.jpg`), { force: true });
    await fs.rm(this.metaPath(id), { force: true });
  }

  async removeClip(id, clipFile) {
    const meta = await this.get(id);
    meta.clips = meta.clips.filter((c) => c.file !== clipFile);
    await fs.rm(path.join(this.clipsDir, clipFile), { force: true });
    return this.save(meta);
  }

  /** Cut [start,end] seconds. Fast mode copies streams (cuts snap to keyframes, ~2 s). Precise re-encodes with NVENC. */
  async makeClip(id, start, end, { precise = false, name } = {}) {
    const meta = await this.get(id);
    const src = path.join(this.dir, meta.file);
    const base = safe(name?.trim() || `${meta.id} clip ${fmtClock(start)}-${fmtClock(end)}`);
    let file = `${base}.mp4`, i = 2; while (existsSync(path.join(this.clipsDir, file))) file = `${base} (${i++}).mp4`;
    const out = path.join(this.clipsDir, file);
    const args = precise
      ? ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(start), '-to', String(end), '-i', src, '-c:v', 'hevc_nvenc', '-preset', 'p5', '-cq', '22', '-c:a', 'copy', '-movflags', '+faststart', out]
      : ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(start), '-to', String(end), '-i', src, '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', out];
    await run('ffmpeg', args);
    const clip = { file, start, end, createdAt: new Date().toISOString(), sizeBytes: (await fs.stat(out)).size, precise };
    meta.clips.push(clip);
    await this.save(meta);
    this.thumbnail(out, path.join(this.clipsDir, file.replace(/\.mp4$/, '.jpg')), 1).catch(() => {});
    return clip;
  }

  /** Remember where playback stopped, so the next visit resumes there (any device). */
  async setPosition(id, t) { const meta = await this.get(id); meta.position = Math.max(0, Number(t) || 0); return this.save(meta); }

  /**
   * Join every highlight moment into one reel: [t-before, t+after] windows, overlapping ones merged,
   * each cut by stream copy (snaps to keyframes) and concatenated. Replaces an earlier reel.
   * Returns the clip entry, or null when the recording has no highlight moments.
   */
  async makeReel(id, { before = 10, after = 5, types = HIGHLIGHT_TYPES } = {}) {
    const meta = await this.get(id);
    if (meta.deleted) throw new Error('video was deleted');
    const D = meta.durationSec || 0;
    const ts = meta.events.filter((e) => types.includes(e.type)).map((e) => e.t).sort((a, b) => a - b);
    const segs = [];
    for (const t of ts) {
      const s = Math.max(0, t - before), e = Math.min(D || t + after, t + after);
      if (segs.length && s <= segs[segs.length - 1].end + 1) segs[segs.length - 1].end = Math.max(segs[segs.length - 1].end, e);
      else segs.push({ start: s, end: e });
    }
    if (!segs.length) return null;
    const src = path.join(this.dir, meta.file);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-reel-'));
    try {
      const parts = [];
      for (const [i, s] of segs.entries()) {
        const part = path.join(tmp, `part${i}.mp4`);
        await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(s.start), '-to', String(s.end), '-i', src, '-c', 'copy', '-avoid_negative_ts', 'make_zero', part]);
        parts.push(part);
      }
      const list = path.join(tmp, 'list.txt');
      await fs.writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
      const old = meta.clips.find((c) => c.auto);
      if (old) { await fs.rm(path.join(this.clipsDir, old.file), { force: true }); await fs.rm(path.join(this.clipsDir, old.file.replace(/\.mp4$/, '.jpg')), { force: true }); meta.clips = meta.clips.filter((c) => !c.auto); }
      const file = `${meta.id} highlights.mp4`;
      const out = path.join(this.clipsDir, file);
      await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
      const length = await probeDuration(out).catch(() => segs.reduce((a, s) => a + s.end - s.start, 0));
      const clip = { file, name: 'Highlights', auto: true, moments: ts.length, start: segs[0].start, end: segs[segs.length - 1].end, lengthSec: length, createdAt: new Date().toISOString(), sizeBytes: (await fs.stat(out)).size, precise: false };
      meta.clips.unshift(clip);
      await this.save(meta);
      this.thumbnail(out, path.join(this.clipsDir, file.replace(/\.mp4$/, '.jpg')), Math.min(before, length / 2)).catch(() => {});
      return clip;
    } finally { await fs.rm(tmp, { recursive: true, force: true }); }
  }

  async thumbnail(video, jpg, atSec) {
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(atSec), '-i', video, '-frames:v', '1', '-vf', 'scale=640:-1', jpg]);
  }

  /** Delete oldest non-favourite recordings until under quota. Clips never count and are never deleted. */
  async enforceQuota() {
    const items = await this.list();
    let total = items.reduce((s, m) => s + (m.sizeBytes ?? 0), 0);
    const limit = this.quotaGB * 1e9;
    for (const m of [...items].reverse()) { // oldest first
      if (total <= limit) break;
      if (m.favorite) continue;
      this.log.info(`[lib] quota: deleting ${m.file}`);
      await fs.rm(path.join(this.dir, m.file), { force: true }); await fs.rm(path.join(this.dir, `${m.id}.jpg`), { force: true });
      m.deleted = true; m.sizeBytes = 0; await this.save(m); // keep the sidecar so clips stay listed
      total -= m.sizeBytes;
    }
  }
}

export async function probeDuration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(stdout.trim());
}
async function retry(fn, times = 10, ms = 500) { let err; for (let i = 0; i < times; i++) { try { return await fn(); } catch (e) { err = e; await new Promise((r) => setTimeout(r, ms)); } } throw err; }
const pad = (n) => String(n).padStart(2, '0');
export function fmtStamp(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`; }
export function fmtClock(s) { s = Math.floor(s); return `${pad(Math.floor(s / 60))}m${pad(s % 60)}s`; }
