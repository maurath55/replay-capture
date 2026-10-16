// Game process watcher: polls the process list and emits start/stop for configured game exes.
import { EventEmitter } from 'node:events';
import { listProcessNames } from './obs.mjs';

export class GameWatcher extends EventEmitter {
  /** @param {Record<string,string>} games exe name -> display name */
  constructor(games, { intervalMs = 2000, graceMs = 5000 } = {}) {
    super();
    this.games = Object.fromEntries(Object.entries(games).map(([k, v]) => [k.toLowerCase(), v]));
    this.intervalMs = intervalMs;
    this.graceMs = graceMs;
    this.current = null; // { exe, name, since }
    this.missingSince = null;
    this.timer = null;
  }

  start() { this.timer = setInterval(() => this.tick().catch((e) => this.emit('error', e)), this.intervalMs); this.tick().catch(() => {}); }
  stop() { clearInterval(this.timer); }

  async tick() {
    const names = await listProcessNames();
    const found = Object.keys(this.games).find((exe) => names.has(exe));
    if (!this.current) {
      if (found) { this.current = { exe: found, name: this.games[found], since: new Date() }; this.missingSince = null; this.emit('start', this.current); }
      return;
    }
    if (names.has(this.current.exe)) { this.missingSince = null; return; }
    // Game process gone: wait a grace period (TFT reconnects relaunch the exe within seconds).
    this.missingSince ??= Date.now();
    if (Date.now() - this.missingSince >= this.graceMs) {
      const ended = this.current; this.current = null; this.missingSince = null; this.emit('stop', ended);
    }
  }
}
