import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Library, probeDuration } from '../service/library.mjs';

// Needs ffmpeg on PATH (setup.mjs installs it). A 40 s synthetic game with a keyframe every second.
const dir = mkdtempSync(path.join(os.tmpdir(), 'rc-test-lib-'));
const video = path.join(dir, 'Game - 2026-01-01 00-00-00.mp4');
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
  '-t', '40', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-c:a', 'aac', '-shortest', video], { windowsHide: true });

test('highlights reel joins merged windows around the moments and replaces itself', async () => {
  const lib = new Library(dir, { log: { info() {}, warn() {} } }); await lib.init();
  const meta = { id: 'Game - 2026-01-01 00-00-00', file: path.basename(video), game: 'League of Legends', startedAt: '2026-01-01T00:00:00Z', durationSec: 40, favorite: false, clips: [], sizeBytes: 1,
    events: [{ t: 5, type: 'kill', label: 'Killed A' }, { t: 7, type: 'assist', label: 'Assist' }, { t: 30, type: 'death', label: 'Died' }, { t: 20, type: 'game_start', label: 'ignored' }] };
  await lib.save(meta);
  const clip = await lib.makeReel(meta.id);
  // windows: [0,12] (5 and 7 merge) and [20,35] -> about 27 s, give or take keyframe snapping
  assert.equal(clip.moments, 3);
  assert.ok(existsSync(path.join(dir, 'clips', clip.file)));
  const len = await probeDuration(path.join(dir, 'clips', clip.file));
  assert.ok(len > 23 && len < 31, `reel length ${len}`);
  const again = await lib.makeReel(meta.id);
  const saved = await lib.get(meta.id);
  assert.equal(saved.clips.filter((c) => c.auto).length, 1, 'remaking replaces the old reel');
  assert.equal(again.file, clip.file);
  assert.equal(await lib.makeReel(meta.id, { types: ['objective'] }), null, 'no moments -> no reel');
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
