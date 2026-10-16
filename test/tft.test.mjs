import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTftLog, lineTime } from '../service/events/tft.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(here, 'fixtures/tft-2026-10-16-phases.log'), 'utf8');

test('lineTime parses UTC timestamps', () => {
  assert.equal(lineTime('[2026.10.16-07.02.37:945][678]x').toISOString(), '2026-10-16T07:02:37.945Z');
  assert.equal(lineTime('no timestamp'), null);
});

test('real TFT game yields alternating fight / result markers in time order', () => {
  const ev = parseTftLog(fixture);
  assert.ok(ev.length > 10, 'should find events');
  const fights = ev.filter((e) => e.type === 'combat_start');
  const results = ev.filter((e) => e.type === 'round_won' || e.type === 'round_lost');
  assert.ok(fights.length >= 15, `fights=${fights.length}`);
  assert.ok(Math.abs(fights.length - results.length) <= 1, 'every fight gets a result');
  assert.ok(ev.filter((e) => e.type === 'round_won').length >= 5, 'this game had wins');
  assert.ok(ev.filter((e) => e.type === 'round_lost').length >= 1, 'and losses');
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'monotonic');
  // a fight is always followed by its result before the next fight
  let open = false;
  for (const e of ev) { if (e.type === 'combat_start') { assert.equal(open, false); open = true; } if (e.type.startsWith('round_')) { assert.equal(open, true); open = false; } }
});

test('victory VO only counts once per round and ignores spam lines', () => {
  const log = ['[2026.10.16-07.00.00:000][1]Phase[ETFTPhaseType::PlanningDeparture]', '[2026.10.16-07.00.05:000][1]NiagaraStaticMeshDataInterface UnitCombatVictory should be ignored',
    '[2026.10.16-07.00.10:000][1]Trigger[Audio.Event.VO.Army.Round.UnitCombatVictory]', '[2026.10.16-07.00.11:000][1]Trigger[Audio.Event.VO.Army.Round.UnitCombatVictory]', '[2026.10.16-07.00.20:000][1]Phase[ETFTPhaseType::CombatDeparture]'].join('\n');
  assert.deepEqual(parseTftLog(log).map((e) => e.type), ['combat_start', 'victory', 'round_won']);
});
