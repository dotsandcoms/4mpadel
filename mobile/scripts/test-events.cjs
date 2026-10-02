const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(path) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require, Date, Intl, Number, Set, Error });
  return module.exports;
}
const { entryFee, isEarlyBirdActive, registrationState, filterEvents, plainText } = load('src/lib/event-rules.ts');
const { joinedOne } = load('src/lib/query-result.ts');
const now = new Date('2026-09-07T10:00:00+02:00');
const base = { id: 1, event_name: 'Cape Town Open', city: 'Cape Town', venue: 'City courts', start_date: '2026-09-09', end_date: '2026-09-11', entry_fee: 300 };
test('early bird boundary matches website and preserves zero fees', () => {
  const event = { ...base, early_bird_fee: 0, early_bird_ends_at: now.toISOString() };
  assert.equal(isEarlyBirdActive(event, now), false);
  assert.equal(entryFee(event, { entry_fee: 450 }, now), 450);
  assert.equal(entryFee({ ...event, early_bird_ends_at: '2026-09-08T10:00:00Z' }, { entry_fee: 450 }, now), 0);
  assert.equal(entryFee({ ...event, early_bird_fee: null }, { entry_fee: 0 }, now), 0);
});
test('registration respects event and division deadlines and cancellation', () => {
  assert.equal(registrationState(base, null, now), 'open');
  assert.equal(registrationState({ ...base, registration_opens_at: '2026-09-08' }, null, now), 'not-open');
  assert.equal(registrationState(base, { entries_close_at: '2026-09-06' }, now), 'closed');
  assert.equal(registrationState({ ...base, event_status: 'cancelled' }, null, now), 'cancelled');
  assert.equal(registrationState({ ...base, end_date: '2026-09-06' }, null, now), 'finished');
});
test('calendar includes multi-day ongoing events and filters combined fields', () => {
  const events = [{ ...base, start_date: '2026-09-06', end_date: '2026-09-08', sapa_status: 'Gold' }, { ...base, id: 2, end_date: '2026-09-06' }];
  assert.equal(filterEvents(events, { search: 'CITY COURTS', timing: 'upcoming', city: 'Cape Town', tier: 'Gold' }, [], now).length, 1);
  assert.equal(filterEvents(events, { search: '', timing: 'past', city: '', tier: '' }, [], now)[0].id, 2);
  assert.equal(filterEvents(events, { search: '', timing: 'saved', city: '', tier: '' }, [1], now)[0].id, 1);
  assert.equal(filterEvents([{ ...base, event_status: 'cancelled' }], { search: '', timing: 'saved', city: '', tier: '' }, [1], now).length, 0);
});
test('joins handle PostgREST object, array and missing results', () => {
  const row = { id: 7 };
  assert.equal(joinedOne(row), row);
  assert.equal(joinedOne([row]), row);
  assert.equal(joinedOne([]), null);
  assert.equal(joinedOne(null), null);
});
test('published text removes scripts and keeps paragraph breaks', () => {
  assert.equal(plainText('<p>Padel &amp; friends</p><script>bad()</script><p>Bring a racket.</p>'), 'Padel & friends\nBring a racket.');
});

const rankingResolver = load('src/lib/website/player-ranking-selection.js');
const teamCode = ts.transpileModule(fs.readFileSync('src/lib/event-teams.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const teamModule = { exports: {} };
vm.runInNewContext(teamCode, { module: teamModule, exports: teamModule.exports, require: () => rankingResolver, Map, Set });
const { buildEventTeams } = teamModule.exports;
test('teams combine mirrored entries, exclude withdrawn partners, and stay within their division', () => {
  const divisions = [{ id: 'open', name: 'Open' }, { id: '40', name: '40+' }];
  const entries = [
    { id: 'a', full_name: 'Martin', partner_name: 'James', email_hash: 'm', partner_email_hash: 'j', division_id: 'open' },
    { id: 'b', full_name: 'James', partner_name: 'Martin', email_hash: 'j', partner_email_hash: 'm', division_id: 'open' },
    { id: 'c', full_name: 'Solo', partner_name: 'Withdrawn', email_hash: 's', partner_email_hash: 'w', division_id: 'open' },
    { id: 'd', full_name: 'Withdrawn', status: 'withdrawn', email_hash: 'w', division_id: 'open' },
    { id: 'e', full_name: 'Martin', division_id: '40' },
  ];
  const result = buildEventTeams(divisions, entries, [{ name: 'Martin', points: 2692 }, { name: 'James', points: 2782 }]);
  assert.equal(result[0].teams.length, 2);
  assert.equal(result[0].teams[0].total, 5474);
  assert.equal(result[0].teams[0].seed, 1);
  assert.equal(result[0].teams[1].players.length, 1);
  assert.equal(result[1].teams.length, 1);
});
test('division-specific ranking source does not silently fall back to unrelated points', () => {
  const result = buildEventTeams([{ id: 'open', name: 'Open', seeding_ranking_source: 'category:Missing|Main|Men-Doubles' }], [{ id: 'a', division_id: 'open', full_name: 'Player' }], [{ name: 'Player', points: 999 }]);
  assert.equal(result[0].teams[0].total, 0);
  assert.equal(result[0].teams[0].seed, null);
});
test('event player rows link only an unambiguous public profile', () => {
  const division = { id: 'open', name: 'Open' };
  const entries = [{ id: 'a', division_id: 'open', full_name: 'Adam' }, { id: 'b', division_id: 'open', full_name: 'Sam' }];
  const profiles = [{ id: 12, name: 'Adam' }, { id: 13, name: 'Sam' }, { id: 14, name: 'Sam' }];
  const teams = buildEventTeams([division], entries, profiles)[0].teams;
  assert.equal(teams.find(team => team.players[0].name === 'Adam').players[0].id, '12');
  assert.equal(teams.find(team => team.players[0].name === 'Sam').players[0].id, null);
});
