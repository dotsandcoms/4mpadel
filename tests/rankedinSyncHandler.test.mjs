import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { transform } from 'esbuild';

const functionUrl = new URL('../supabase/functions/sync-to-rankedin/index.ts', import.meta.url);
const rankingUrl = new URL('../supabase/functions/sync-to-rankedin/ranking-sync.mjs', import.meta.url).href;
const original = await fs.readFile(functionUrl, 'utf8');
const source = original
  .replace(/import \{ serve \} from '[^']+';/, 'const serve = globalThis.__rankedinTestServe;')
  .replace(/import \{ createClient, type SupabaseClient \} from '[^']+';/, 'const createClient = globalThis.__rankedinTestCreateClient;')
  .replace("'./ranking-sync.mjs'", JSON.stringify(rankingUrl));
const { code } = await transform(source, { loader: 'ts', format: 'esm' });

async function runSync(body = {}, {
  invalidRankings = false, unauthorized = false, userEmail = 'brad@dotsandcoms.co.za',
  canManageEvent = true, permissionError = null,
} = {}) {
  const previous = { fetch: globalThis.fetch, Deno: globalThis.Deno, log: console.log, warn: console.warn, error: console.error };
  const posts = []; const requests = []; const permissionCalls = []; const databaseCalls = [];
  let handler; let savedSettings;
  let rankings = { selectedRankings: [{ id: 7 }], seedRankingId: 7 };
  const rows = [
    { Id: 101, IsDrawCreated: false, IsAnyMatchGenerated: false, Paid: false, Participant: { TournamentPlayerId: 101, Seed: '', FirstPlayer: { Id: 1, RankedinId: 'R1' }, SecondPlayer: { Id: 2, RankedinId: 'R2' } } },
    { Id: 102, IsDrawCreated: false, IsAnyMatchGenerated: false, Paid: true, Participant: { TournamentPlayerId: 102, Seed: '', FirstPlayer: { Id: 3, RankedinId: 'R3' }, SecondPlayer: { Id: 4, RankedinId: 'R4' } } },
  ];
  const settings = { Id: 75314, SelectedTournamentClass: 178290, EventState: 5, IsAdmin: true, Participants: rows };
  const players = [1, 2, 3, 4].map((id) => ({ rankedin_id: `R${id}`, rankings: [{ org: 'SAPA ranking', age_group: 'Men-Main', match_type: 'Men-Doubles', points: id * 100 }] }));
  const tables = {
    calendar: { id: 479, event_name: 'Test Open', is_manual: true, rankedin_id: '75314', federation_id: 'sapa', federation_sanction_status: 'approved' },
    federations: { rankedin_rankings_org_id: '15809' },
    tournament_divisions: [{ id: 'elite', name: "Men's Elite (indicative 5+)", is_active: true, rankedin_class_id: '178290', seeding_ranking_source: 'active' }],
    event_registrations: [], players_public: players,
  };
  const userClient = {
    auth: { getUser: async () => ({ data: { user: unauthorized ? null : { id: 'test-user', email: userEmail } } }) },
    async rpc(name, args) {
      permissionCalls.push({ name, args });
      return { data: canManageEvent, error: permissionError };
    },
  };
  const adminClient = {
    from(table) {
      databaseCalls.push(table);
      let writing = false;
      const query = { select() { return this; }, eq() { return this; }, ilike() { return this; }, order() { return this; }, in() { return this; },
        update() { writing = true; return this; }, maybeSingle() { return this; },
        then(resolve) { resolve({ data: writing ? null : tables[table], error: null }); } };
      return query;
    } };
  globalThis.__rankedinTestServe = (callback) => { handler = callback; };
  globalThis.__rankedinTestCreateClient = (_url, key, options) => {
    if (key === 'test-anon-key') {
      assert.equal(options.global.headers.Authorization, 'Bearer test');
      return userClient;
    }
    assert.equal(key, 'test-service-key');
    return adminClient;
  };
  globalThis.Deno = { env: { get: (name) => ({
    SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  }[name] || 'test-value') } };
  console.log = console.warn = console.error = () => {};
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname.replace(/\/$/, ''); requests.push(path);
    const reply = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
    if (options.method === 'POST') posts.push({ path, body: JSON.parse(options.body) });
    if (path.endsWith('/LogInAsync')) return reply(true, 200, { 'Set-Cookie': 'rin-auth=test-session; Path=/' });
    if (path.endsWith('/GetInfoAsync')) return reply({ TournamentSidebarModel: { Name: 'Test Open' } });
    if (path.endsWith('/GetClassesAndDrawNamesAsync')) return reply([{ Id: 178290, Name: "Men's Elite (indicative 5+)" }]);
    if (path.endsWith('/GetEditModelAsync')) return reply({ Id: 75314, TournamentName: 'Test Open', SeedRankingId: 7, UtcoffsetInMinutes: 120, Location: {} });
    if (path.endsWith('/GetSelectedRankingsForEventAsync')) return invalidRankings ? reply({}, 503) : reply(rankings);
    if (path.endsWith('/editasync')) { rankings = { selectedRankings: JSON.parse(options.body).SelectedRankings, seedRankingId: JSON.parse(options.body).SeedRankingId }; return reply(true); }
    if (path.endsWith('/PlayerSettingsAsync')) return reply(savedSettings || settings);
    if (path.endsWith('/UpdatePlayerSettingsAsync')) { savedSettings = JSON.parse(options.body); return reply(true); }
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    await import(`data:text/javascript;base64,${Buffer.from(code + `\n// ${Math.random()}`).toString('base64')}`);
    const response = await handler(new Request('https://example.test/sync', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: 479, ...body }) }));
    return { status: response.status, result: await response.json(), posts, requests, settings, permissionCalls, databaseCalls };
  } finally {
    globalThis.fetch = previous.fetch; globalThis.Deno = previous.Deno;
    console.log = previous.log; console.warn = previous.warn; console.error = previous.error;
    delete globalThis.__rankedinTestServe; delete globalThis.__rankedinTestCreateClient;
  }
}

test('default sync saves seeds even when there are no new paid entries', async () => {
  const { result, posts } = await runSync();
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.writePush.pushed, 0);
  assert.equal(result.seedsPush.updated, 2); assert.equal(result.phase, 4);
  const edit = posts.find((p) => p.path.endsWith('/editasync')).body;
  assert.deepEqual(edit.SelectedRankings, [{ id: 7 }, { id: 15809 }]); assert.equal(edit.SeedRankingId, 7);
  const saved = posts.find((p) => p.path.endsWith('/UpdatePlayerSettingsAsync')).body;
  assert.deepEqual(saved.Participants.map((p) => p.Participant.Seed), ['2', '1']);
  assert.deepEqual(saved.Participants.map((p) => p.Paid), [false, true]);
});
test('mapping-only and pushSeeds=false requests perform no seeding writes', async () => {
  for (const body of [{ pushEntries: false, pushDetails: false }, { pushSeeds: false }]) {
    const { result, posts, requests } = await runSync(body);
    assert.equal(result.seedsPush.status, 'skipped_by_request');
    assert.equal(posts.some((p) => p.path.endsWith('/UpdatePlayerSettingsAsync')), false);
    assert.equal(requests.some((p) => p.endsWith('/PlayerSettingsAsync')), false);
  }
});
test('seed-only sync does not change event details or add registrations', async () => {
  const { result, posts } = await runSync({ pushEntries: false, pushDetails: false, pushSeeds: true });
  assert.equal(result.seedsPush.updated, 2);
  assert.deepEqual(posts.map((p) => p.path.split('/').pop()), ['LogInAsync', 'UpdatePlayerSettingsAsync']);
});
test('failed ranking lookup prevents the tournament details POST', async () => {
  const { result, posts } = await runSync({}, { invalidRankings: true });
  assert.equal(result.detailsPush.status, 'error');
  assert.equal(posts.some((p) => p.path.endsWith('/editasync')), false);
});
test('unauthorized users cannot access any RankedIn write phase', async () => {
  const { status, posts, requests, permissionCalls, databaseCalls } = await runSync({}, { unauthorized: true });
  assert.equal(status, 401); assert.deepEqual(posts, []); assert.deepEqual(requests, []);
  assert.deepEqual(permissionCalls, []); assert.deepEqual(databaseCalls, []);
});

test('event organisers without sidebar permissions can sync their managed event', async () => {
  const { status, result, permissionCalls } = await runSync({}, { userEmail: 'organiser@example.com' });
  assert.equal(status, 200, JSON.stringify(result));
  assert.equal(result.ok, true);
  assert.equal(result.seedsPush.updated, 2);
  assert.deepEqual(permissionCalls, [{ name: 'can_manage_event', args: { p_event_id: 479 } }]);
});

test('event permission is checked for the requested event using the caller session', async () => {
  const { status, result, permissionCalls } = await runSync({ eventId: '480' }, { userEmail: 'manager@example.com' });
  assert.equal(status, 200, JSON.stringify(result));
  assert.deepEqual(permissionCalls, [{ name: 'can_manage_event', args: { p_event_id: 480 } }]);
});

test('denied event permissions stop all database access and RankedIn requests, including for legacy admins', async () => {
  for (const userEmail of ['manager@example.com', 'brad@dotsandcoms.co.za']) {
    const { status, result, permissionCalls, databaseCalls, requests } = await runSync({}, { userEmail, canManageEvent: false });
    assert.equal(status, 403, JSON.stringify(result));
    assert.deepEqual(permissionCalls, [{ name: 'can_manage_event', args: { p_event_id: 479 } }]);
    assert.deepEqual(databaseCalls, []); assert.deepEqual(requests, []);
  }
});

test('permission lookup errors fail closed before database or RankedIn access', async () => {
  const { status, result, databaseCalls, requests } = await runSync({}, { permissionError: { message: 'database unavailable' } });
  assert.equal(status, 500, JSON.stringify(result));
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Could not verify event management permissions');
  assert.deepEqual(databaseCalls, []); assert.deepEqual(requests, []);
});

test('a missing permission result cannot authorise a sync', async () => {
  const { status, databaseCalls, requests } = await runSync({}, { canManageEvent: null });
  assert.equal(status, 403);
  assert.deepEqual(databaseCalls, []); assert.deepEqual(requests, []);
});

test('invalid event IDs are rejected before permission checks or side effects', async () => {
  for (const eventId of [null, '', 0, -1, 1.5, 'invalid', Number.MAX_SAFE_INTEGER + 1]) {
    const { status, permissionCalls, databaseCalls, requests } = await runSync({ eventId });
    assert.equal(status, 400, `eventId=${eventId}`);
    assert.deepEqual(permissionCalls, []); assert.deepEqual(databaseCalls, []); assert.deepEqual(requests, []);
  }
});
