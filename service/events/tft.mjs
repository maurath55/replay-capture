// TFT events from the game's own log (no injection). Log lines look like:
//   [2026.10.16-07.02.37:945][678]TFT: [Client] ...Phase[ETFTPhaseType::PlanningDeparture]
//   ...TFTAudioEventSubsystem: Trigger[Audio.Event.VO.Army.Round.UnitCombatVictory]...
// Timestamps are UTC. PlanningDeparture = combat starts, CombatDeparture = combat ends,
// UnitCombatVictory VO = your board won the round.
import { EventEmitter } from 'node:events';
import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TFT_LOG = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData/Local'), 'TFT/Saved/Logs/TFT.log');

const TS = /^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]/;
export function lineTime(line) {
  const m = TS.exec(line); if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]));
}

/** Stateful line reducer: feed lines in order, get events out. */
export class TftParser {
  constructor() { this.inCombat = false; this.wonThisRound = false; this.round = 0; }
  feed(line) {
    const out = [];
    if (line.includes('NiagaraStaticMeshDataInterface')) return out; // the 1100-lines/min spam
    const t = lineTime(line); if (!t) return out;
    if (line.includes('ETFTPhaseType::PlanningDeparture')) {
      if (!this.inCombat) { this.inCombat = true; this.wonThisRound = false; this.round += 1; out.push({ t, type: 'combat_start', label: `Round ${this.round} fight` }); }
    } else if (line.includes('ETFTPhaseType::CombatDeparture')) {
      if (this.inCombat) { this.inCombat = false; out.push({ t, type: this.wonThisRound ? 'round_won' : 'round_lost', label: `Round ${this.round} ${this.wonThisRound ? 'won' : 'lost'}` }); }
    } else if (line.includes('Audio.Event.VO.Army.Round.UnitCombatVictory')) {
      if (this.inCombat && !this.wonThisRound) { this.wonThisRound = true; out.push({ t, type: 'victory', label: `Round ${this.round} victory` }); }
    } else if (line.includes('TFTTopCeremonySubsystem') && line.includes('Cleanup top ceremony')) {
      out.push({ t, type: 'game_end', label: 'Game over' });
    }
    return out;
  }
}

export function parseTftLog(text) { const p = new TftParser(); const ev = []; for (const l of text.split(/\r?\n/)) ev.push(...p.feed(l)); return ev; }

/** Tails TFT.log from its current end; emits 'event' with {t, type, label}. */
export class TftTailer extends EventEmitter {
  constructor(file = TFT_LOG, { intervalMs = 1000 } = {}) { super(); this.file = file; this.intervalMs = intervalMs; this.pos = 0; this.rest = ''; this.parser = new TftParser(); this.timer = null; }
  start() {
    this.pos = existsSync(this.file) ? statSync(this.file).size : 0; // only new lines from now on
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }
  stop() { clearInterval(this.timer); this.poll(); }
  poll() {
    if (!existsSync(this.file)) return;
    const size = statSync(this.file).size;
    if (size < this.pos) { this.pos = 0; this.rest = ''; this.parser = new TftParser(); } // new game: log rotated
    if (size === this.pos) return;
    const fd = openSync(this.file, 'r');
    try {
      const buf = Buffer.alloc(size - this.pos); readSync(fd, buf, 0, buf.length, this.pos); this.pos = size;
      const chunk = this.rest + buf.toString('utf8');
      const lines = chunk.split(/\r?\n/); this.rest = lines.pop() ?? '';
      for (const l of lines) for (const e of this.parser.feed(l)) this.emit('event', e);
    } finally { closeSync(fd); }
  }
}
