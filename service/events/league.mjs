// League of Legends events from Riot's local Live Client Data API (https://127.0.0.1:2999).
// No injection: the game serves this itself. Self-signed cert, so TLS verification is off for localhost only.
import { EventEmitter } from 'node:events';
import https from 'node:https';

function getJson(pathname, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host: '127.0.0.1', port: 2999, path: pathname, rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
      let body = ''; res.on('data', (d) => { body += d; }); res.on('end', () => {
        // While the game is loading the API answers 404 with an error object; never treat that as data.
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
  });
}

/** "Name#TAG" or "Name" -> "name", so Riot IDs and bare names compare equal. */
const gameName = (n) => n.split('#')[0].trim().toLowerCase();

export class LeaguePoller extends EventEmitter {
  constructor({ intervalMs = 1000, fetchJson = getJson } = {}) { super(); this.intervalMs = intervalMs; this.fetchJson = fetchJson; this.seen = new Set(); this.me = null; this.timer = null; this.gameStartWall = null; this.gameTimeAtStart = null; }
  start() { this.timer = setInterval(() => this.poll().catch(() => {}), this.intervalMs); }
  stop() { clearInterval(this.timer); }
  async poll() {
    if (!this.me) {
      let name; try { name = await this.fetchJson('/liveclientdata/activeplayername'); } catch { return; }
      if (typeof name !== 'string' || !gameName(name)) return;
      this.me = gameName(name);
    }
    const data = await this.fetchJson('/liveclientdata/eventdata');
    for (const ev of data?.Events ?? []) {
      if (this.seen.has(ev.EventID)) continue; this.seen.add(ev.EventID);
      const t = new Date(); // events are polled within ~1 s of happening; EventTime is game clock, we anchor on wall clock
      const mine = (n) => typeof n === 'string' && gameName(n) === this.me;
      let e = null;
      switch (ev.EventName) {
        case 'GameStart': e = { type: 'game_start', label: 'Game start' }; break;
        case 'GameEnd': e = { type: 'game_end', label: `Game over: ${ev.Result ?? ''}`.trim() }; break;
        case 'ChampionKill':
          if (mine(ev.KillerName)) e = { type: 'kill', label: `Killed ${ev.VictimName}` };
          else if (mine(ev.VictimName)) e = { type: 'death', label: `Died to ${ev.KillerName}` };
          else if ((ev.Assisters ?? []).some(mine)) e = { type: 'assist', label: `Assist on ${ev.VictimName}` };
          break;
        case 'Multikill': if (mine(ev.KillerName)) e = { type: 'multikill', label: `Multikill x${ev.KillStreak}` }; break;
        case 'DragonKill': case 'BaronKill': case 'HeraldKill': case 'TurretKilled': case 'InhibKilled': case 'Ace':
          if (mine(ev.KillerName) || (ev.Assisters ?? []).some(mine) || ev.EventName === 'Ace') e = { type: 'objective', label: ev.EventName.replace(/Kill(ed)?$/, '') }; break;
      }
      if (e) this.emit('event', { t, gameTime: ev.EventTime, ...e });
    }
  }
}
