const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/lib/app-search.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const clubsCode = ts.transpileModule(fs.readFileSync('src/lib/clubs.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(responses = {}, pro = async () => ({ players: [] })) {
  const calls = [], received = [], mod = { exports: {} };
  const supabase = { from(table) {
    const call = { table }; calls.push(call);
    const query = { select(columns) { call.columns = columns; return this; }, ilike(column, value) { call.search = [column,value]; return this; }, eq(column,value) { call.eq = [column,value]; return this; }, in(column,value) { call.in = [column,value]; return this; }, order() { return this; }, range(from,to) { call.range = [from,to]; return this; }, limit(n) { call.limit = n; return this; }, abortSignal(signal) { call.signal = signal; return this; }, then(ok,fail) { return Promise.resolve(responses[table] ?? { data: [] }).then(ok,fail); } };
    return query;
  } };
  const clubs = { exports: {} };
  vm.runInNewContext(clubsCode, { module: clubs, exports: clubs.exports, require: () => ({ supabase }), URL, Promise });
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: name => name === './clubs' ? clubs.exports : ({ supabase, searchProPlayers: pro }), URL, Promise });
  return { ...mod.exports, calls, received, receive: section => received.push(section) };
}
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
test('directory search is bounded and uses public profiles and published organisations/clubs only', async () => {
  const api = setup({ players_public: { data: [{ id: 404, name: 'Mikayla Plitt', home_club: 'Padel club', image_url: 'https://example.test/p.jpg', email: 'private@example.test' }] }, clubs: { data: [{ id: 'club-id', name: 'Club Test', slug: 'club/test', status: 'published', city: 'Durban' }] }, organisations: { data: [{ id: 'org-id', name: 'Org Test', slug: '4m', logo_url: 'javascript:alert(1)' }] } });
  await api.searchDirectory('test', false, new AbortController().signal, api.receive);
  assert.equal(api.calls.length, 4);
  for (const call of api.calls) { assert.ok(!call.columns.includes('*')); assert.ok(!call.columns.includes('email')); if (call.range) assert.deepEqual(Array.from(call.range), [0,249]); else assert.equal(call.limit, 20); }
  assert.equal(api.calls[0].table, 'players_public');
  assert.deepEqual(Array.from(api.calls[1].in[1]), ['published','4m_approved','4m_premium']);
  assert.deepEqual(Array.from(api.calls.find(call => call.table === 'organisations').eq), ['status','approved']);
  const items = api.received.flatMap(section => section.items);
  assert.equal(items.find(item => item.kind === 'players').path, '/players/404');
  assert.equal(items.find(item => item.kind === 'clubs').path, '/clubs/club%2Ftest');
  assert.notEqual(items.find(item => item.kind === 'clubs').website, true);
  assert.equal(items.find(item => item.kind === 'organisations').image, null);
  assert.ok(!JSON.stringify(items).includes('private@example.test'));
});
test('short input makes no requests and search wildcards stay literal', async () => {
  const api = setup();
  await api.searchDirectory(' x ', false, new AbortController().signal, api.receive);
  assert.equal(api.calls.length, 0);
  assert.equal(api.searchPattern(' a%_\\b '), '%a\\%\\_\\\\b%');
  assert.equal(api.searchTerm('   one   two  '), 'one two');
  assert.equal(api.searchTerm('x'.repeat(200)).length, 80);
});
test('one unavailable directory does not hide other public matches', async () => {
  const api = setup({ players_public: { error: new Error('offline') }, clubs: { data: [{ id: '1', name: 'Club', slug: 'club', status: 'published' }] } });
  await api.searchDirectory('club', false, new AbortController().signal, api.receive);
  assert.equal(api.received.find(section => section.kind === 'players').error, true);
  assert.equal(api.received.find(section => section.kind === 'clubs').items.length, 1);
});
test('directories publish independently and aborted old searches cannot publish late results', { timeout: 1000 }, async () => {
  const slow = deferred(), api = setup({ players_public: slow.promise, clubs: { data: [{ id: '1', name: 'Club', slug: 'club', status: 'published' }] } });
  const controller = new AbortController(), arrived = deferred();
  const request = api.searchDirectory('club', false, controller.signal, section => { api.receive(section); if (section.kind === 'clubs') arrived.resolve(); });
  await arrived.promise;
  assert.equal(api.received.some(section => section.kind === 'clubs'), true);
  controller.abort(); slow.resolve({ data: [{ id: 2, name: 'Old player' }] }); await request;
  assert.equal(api.received.some(section => section.kind === 'players'), false);
});
test('global search matches the same spaced group names and all six venues as Find clubs', async () => {
  const group = { id: 'netset', name: 'Net Set Padel', slug: 'net-set-padel', status: 'published' };
  const names = ['Net Set Nottingham Road', 'Net Set Padel Bloemfontein', 'Net Set Padel Ramblers Club', 'Net Set Padel Sandton City', 'Netset Padel Bruma', 'Netset Padel Marks Park'];
  const api = setup({ club_groups: { data: [group] }, clubs: { data: names.map((name,i) => ({ id: String(i), slug: `venue-${i}`, name, group_id: group.id, status: 'published', club_groups: group })) } });
  await api.searchDirectory('Netset', false, new AbortController().signal, api.receive);
  const result = api.received.find(section => section.kind === 'clubs');
  assert.equal(result.items.length, 7); assert.equal(result.items[0].path, '/club-groups/net-set-padel');
  assert.equal(result.items[0].detail, '6 venues'); assert.ok(result.items.every(item => !item.website));
});
test('international player identities use the FIP gateway and its cancellation signal', async () => {
  let args;
  const api = setup({}, async (...values) => { args = values; return { players: [{ id: 404, name: 'FIP Test', photoUrl: 'https://example.test/fip.jpg', nationality: 'ES' }] }; });
  const signal = new AbortController().signal;
  await api.searchDirectory('test', true, signal, api.receive);
  assert.equal(args[4], signal);
  assert.equal(api.calls.some(call => call.table === 'players_public'), false);
  assert.equal(api.received.find(section => section.kind === 'players').items[0].path, '/pro/player/404');
});
test('directory limits are explicit so a large match does not imply a complete result set', async () => {
  const api = setup({ players_public: { data: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Player ${i}` })) } });
  await api.searchDirectory('player', false, new AbortController().signal, api.receive);
  const section = api.received.find(section => section.kind === 'players');
  assert.equal(section.items.length, 20); assert.equal(section.limited, true);
});

test('event discovery leads with current and next events, while retaining past events', () => {
  const api = setup(), rows = [{ id: 1, start_date: '2026-10-01' }, { id: 2, start_date: '2026-11-20' }, { id: 3, start_date: '2026-11-08', end_date: '2026-11-10' }, { id: 4, start_date: '2026-11-13' }];
  assert.deepEqual(Array.from(api.sortSearchEvents(rows, '2026-11-09'), row => row.id), [3,4,2,1]);
  assert.equal(rows[0].id, 1);
});

test('Find tournaments excludes completed and undated events before a name, city or venue search', () => {
  const api = setup(), rows = [
    { id: 1, start_date: '2026-11-08', end_date: '2026-11-11' },
    { id: 2, start_date: '2026-11-10', end_date: '2026-11-12' },
    { id: 3, start_date: '2026-11-12', end_date: null },
    { id: 4, start_date: '2026-11-13', end_date: '2026-11-15' },
    { id: 5, start_date: null, end_date: null },
  ];
  assert.deepEqual(Array.from(api.sortSearchEvents(rows, '2026-11-12', true), row => row.id), [2,3,4]);
  assert.equal(api.isUpcomingSearchEvent('2026-11-11', '', '2026-11-12'), false);
  assert.equal(api.isUpcomingSearchEvent('2026-11-13T00:00:00Z', '2026-11-15T00:00:00Z', '2026-11-12'), true);
  assert.equal(api.isUpcomingSearchEvent('2026-11-13', '2026-11-15', '2026-11-16'), false);
});
