import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LeaguePoller } from '../service/events/league.mjs';

// Fake Live Client API: 404s while loading, then serves the player name and events.
function fakeApi() {
  const api = { loading: true, events: [] };
  api.fetchJson = async (p) => {
    if (api.loading) throw new Error('HTTP 404');
    if (p === '/liveclientdata/activeplayername') return 'Nelson#NA1';
    return { Events: api.events };
  };
  return api;
}

test('kills, deaths and assists are marked once the game finishes loading', async () => {
  const api = fakeApi();
  const p = new LeaguePoller({ fetchJson: api.fetchJson });
  const got = []; p.on('event', (e) => got.push(e));
  await p.poll(); // loading screen: nothing, and no bogus name cached
  assert.equal(p.me, null);
  api.loading = false;
  api.events = [
    { EventID: 0, EventName: 'GameStart', EventTime: 0 },
    { EventID: 1, EventName: 'ChampionKill', EventTime: 200, KillerName: 'Nelson', VictimName: 'Foe', Assisters: [] },
    { EventID: 2, EventName: 'ChampionKill', EventTime: 300, KillerName: 'Foe', VictimName: 'nelson#NA1', Assisters: [] },
    { EventID: 3, EventName: 'ChampionKill', EventTime: 400, KillerName: 'Ally', VictimName: 'Foe2', Assisters: ['Nelson'] },
    { EventID: 4, EventName: 'ChampionKill', EventTime: 500, KillerName: 'Ally', VictimName: 'Foe3', Assisters: [] },
  ];
  await p.poll();
  assert.deepEqual(got.map((e) => e.type), ['game_start', 'kill', 'death', 'assist']);
  await p.poll();
  assert.equal(got.length, 4, 'events are not repeated');
});
