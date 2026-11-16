const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, modules = {}, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: name => modules[name] || {}, Date, Intl, setTimeout, clearTimeout, AbortController, ...globals });
  return mod.exports;
}
const sapa = load('src/lib/sapa-main-ranking.ts');
const now = new Date('2026-11-16T08:00:00Z');
const event = { id: 1, event_name: 'SAPA Cup', is_manual: true, sapa_status: 'Gold', start_date: '2026-11-13', end_date: '2026-11-15', registration_closes_at: '2026-11-16T07:00:00Z' };
const ranking = (rank, points) => [{ ranking_id: 15809, age_group_id: 82, age_group: 'Men-Main', ranking_type: 3, match_type: 'Men-Doubles', rank, points }];
function setup({ row = event, profiles = [], divisions = [], entries = [], provider = {}, rpcData = null, rpcError = null } = {}) {
  const calls = [];
  const draws = load('src/lib/event-draws.ts');
  const teams = load('src/lib/event-teams.ts', { './sapa-main-ranking': sapa, './website/player-ranking-selection': {} });
  const api = load('src/lib/event-documents.ts', {
    './supabase': { supabase: { rpc: async (name, args) => { calls.push([name, args]); return { data: rpcData, error: rpcError }; } } },
    './events': { fetchEvent: async () => row, fetchEventPlayerRankings: async () => { calls.push('profiles'); return profiles; }, fetchDivisions: async () => divisions, fetchPublicEntries: async () => entries },
    './event-teams': teams, './event-draws': draws, './sapa-main-ranking': sapa,
  }, { fetch: async url => { calls.push(url); const match = Object.entries(provider).find(([key]) => url.includes(key)); if (!match) throw Error('Unexpected URL: ' + url); return { ok: true, json: async () => match[1] }; } });
  return { ...api, calls };
}
test('player-list availability requires a SAPA tier, a verified elapsed deadline and a non-cancelled event', () => {
  const api = setup();
  assert.equal(api.canDownloadPlayerList(event, now), true);
  assert.equal(api.canDownloadPlayerList({ ...event, registration_closes_at: now.toISOString() }, now), true);
  for (const row of [{ ...event, sapa_status: 'None' }, { ...event, sapa_status: null }, { ...event, event_status: 'cancelled' }, { ...event, registration_closes_at: 'invalid' }, { ...event, registration_closes_at: null }, { ...event, registration_closes_at: '2026-11-17T08:00:00Z' }, { ...event, registration_opens_at: '2026-11-18T08:00:00Z' }]) assert.equal(api.canDownloadPlayerList(row, now), false);
});
test('generation rechecks reopened registration before reading players or producing a PDF', async () => {
  const api = setup({ row: { ...event, registration_closes_at: '2026-11-20T10:00:00Z' } });
  await assert.rejects(api.fetchEventEntrySheet(1, now), /after registrations close/);
  assert.equal(api.calls.length, 0);
});
test('manual sheets deduplicate mirrored partners by division and never include withdrawn entries or private fields', async () => {
  const api = setup({ divisions: [{ id: 'd1', name: 'Men Open' }],
    profiles: [{ id: 1, name: 'A & B', gender: 'male', rankings: ranking(1, 1000), email: 'private@test.invalid' }, { id: 2, name: 'Second Player', gender: 'male', rankings: ranking(3, 700) }],
    entries: [{ id: 'e1', division_id: 'd1', full_name: 'A & B', partner_name: 'Second Player', email_hash: 'one', partner_email_hash: 'two' }, { id: 'e2', division_id: 'd1', full_name: 'Second Player', partner_name: 'A & B', email_hash: 'two', partner_email_hash: 'one' }, { id: 'e3', division_id: 'd1', full_name: 'Withdrawn', status: 'withdrawn' }],
  });
  const sheet = await api.fetchEventEntrySheet(1, now);
  assert.equal(sheet.divisions[0].teams.length, 1); assert.equal(sheet.divisions[0].teams[0].total, 1700);
  assert.equal(sheet.divisions[0].teams[0].players[0].rank, 1);
  assert.ok(!JSON.stringify(sheet).includes('private@test.invalid')); assert.ok(!JSON.stringify(sheet).includes('email_hash'));
});
test('entry sheets never borrow SAPA points from duplicate names or a mismatched provider ID', () => {
  const api = setup(), profiles = [{ id: 1, name: 'Same', rankedin_id: 'R1', rankings: ranking(1, 1000) }, { id: 2, name: 'Same', rankedin_id: 'R2', rankings: ranking(2, 900) }];
  assert.equal(api.sheetPlayer('Same', profiles).points, null);
  assert.equal(api.sheetPlayer('Same', profiles, { rankedinId: 'R3' }).points, null);
  assert.equal(api.sheetPlayer('Same', profiles, { rankedinId: 'R2' }).points, 900);
  const rows = api.rankedinEntryTeams({ Participants: [{ Participant: { FirstPlayer: { Name: 'Same', RankedinId: 'R1' }, SecondPlayer: { Name: 'Unknown', RankedinId: 'R4' } } }, { Participant: { HasCancelation: true, FirstPlayer: { Name: 'Cancelled' } } }] }, profiles);
  assert.equal(rows.length, 1); assert.equal(rows[0].total, null);
});
test('external points must be explicitly published, active SAPA awards, and retain true zero points', () => {
  const api = setup();
  const row = { Player1Name: 'One', Player2Name: 'Two', Standing: 3, StandingRangeTo: 4, RankingPoint: { RankingId: 15809, IsActive: true, Points: 936 } };
  const rows = api.rankedinPointsRows({ Data: [row, { ...row, RankingPoint: { ...row.RankingPoint, Points: 0 } }, { ...row, RankingPoint: { ...row.RankingPoint, RankingId: 16482 } }, { ...row, RankingPoint: { ...row.RankingPoint, IsActive: false } }, { ...row, RankingPoint: null }] }, 15809);
  assert.equal(rows.length, 2); assert.equal(rows[0].points, 936); assert.equal(rows[0].position, '3-4'); assert.equal(rows[1].points, 0);
});
test('unfinished RankedIn tournaments never expose a points-updated sheet', async () => {
  const api = setup({ provider: { GetStandingsAsync: { IsFinished: false, Classes: [{ Id: 4, Name: 'Open' }], Rankings: [{ Id: 15809 }] } } });
  assert.equal(await api.fetchEventPointsSheet({ ...event, rankedin_id: '76235' }), null);
  assert.equal(api.calls.length, 1);
});
test('completed RankedIn tournaments use the SAPA ranking ID and report points per player', async () => {
  const api = setup({ provider: { GetStandingsAsync: { IsFinished: true, Classes: [{ Id: 4, Name: 'Open' }], Rankings: [{ Id: 16482 }, { Id: 15809 }] }, GetResultsAsync: { Data: [{ Player1Name: 'One', Player2Name: 'Two', Standing: 1, RankingPoint: { RankingId: 15809, IsActive: true, Points: 2600 } }] } } });
  const sheet = await api.fetchEventPointsSheet({ ...event, rankedin_id: '76235' });
  assert.equal(sheet.divisions[0].rows[0].points, 2600); assert.equal(sheet.divisions[0].rows[0].players.length, 2);
  assert.ok(api.calls[1].includes('rankingId=15809'));
});
test('native points use the public final-awards projection and reject failed loads', async () => {
  const api = setup({ rpcData: { updatedAt: now.toISOString(), divisions: [{ name: 'Open', rows: [{ position: 'Winner', players: ['One'], points: 1000 }] }] } });
  assert.equal((await api.fetchEventPointsSheet(event)).divisions[0].rows[0].points, 1000);
  assert.equal(api.calls[0][0], 'get_event_points_sheet');
  await assert.rejects(setup({ rpcError: Error('Unavailable') }).fetchEventPointsSheet(event), /could not load/);
});
test('Player-list PDF escapes names and uses repeated table headers', () => {
  const pdf = load('src/lib/event-pdf-html.ts');
  const html = pdf.entrySheetHtml({ eventName: '<script>unsafe</script>', generatedAt: now.toISOString(), dates: 'Nov 2026', divisions: [{ name: 'Men & Women', teams: [{ position: 1, players: [{ name: 'Player <One>', rank: 3, points: 0, country: 'ZA' }], total: null }] }] });
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('Men &amp; Women')); assert.ok(html.includes('Player &lt;One&gt;'));
  assert.ok(html.includes('<thead>')); assert.ok(html.includes('page-break-inside:avoid')); assert.ok(html.includes('0 points'));
});
