const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, Date, Map, Promise, Intl, require: () => ({}) });
  return mod.exports;
}
const { createHomeFeedCache } = load('src/lib/home-feed-cache.ts');
const { homeEventState, homeFeedSource, homeTourEvents, tourPath, tourSource, tourLevelLabel, spotlightCountdown, homeFollowingTeam, homeOfficialFipEvents } = load('src/lib/home-feed.ts');
const { resultHighlight, resultPortraits } = load('src/lib/home-results.ts');
const { createHomePortraitCache } = load('src/lib/home-pro-portraits.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

for (const [source, expected] of [
  ['4m', ['/search?category=events', '/rankings?view=Discover&source=4m', '/rankings?view=Rankings&source=4m', '/license', '/clubs']],
  ['international', ['/calendar?circuit=pro', '/pro/live', '/rankings?view=Rankings&source=pro', '/rankings?view=Discover&source=pro', '/rankings?view=Following&source=pro']],
]) test(`${source} Home shortcut presses open the appropriate source and screen`, () => {
  const mod = { exports: {} }, opened = [];
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/home-shortcuts.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, require: id => id === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), Fragment: 'Fragment' } : { HomeAction: 'HomeAction' } });
  const tree = mod.exports.HomeShortcuts({ source, onOpen: path => opened.push(path) });
  assert.equal(tree.props.children.length, 5);
  for (const action of tree.props.children) action.props.onPress();
  assert.deepEqual(opened, expected);
});

test('bundled event defaults follow the website tier and name rules', () => {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/home.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: id => id.startsWith('@/assets/') ? id : {}, Date, Map, Set });
  const website = load('../src/utils/imageUtils.js');
  for (const event of [
    { sapa_status: 'Major', event_name: 'SA Grand Open' },
    { sapa_status: 'Super Gold', event_name: 'Open' },
    { sapa_status: 'S Gold', event_name: 'Open' },
    { sapa_status: 'Gold', event_name: 'Open' },
    { sapa_status: 'Silver', event_name: 'Open' },
    { sapa_status: 'Bronze', event_name: 'Open' },
    { sapa_status: 'FIP Event', event_name: 'Open' },
    { sapa_status: null, event_name: 'Padel Major' },
    { sapa_status: null, event_name: 'Social day' },
    { sapa_status: null, event_name: 'Unknown event' },
  ]) {
    const expected = website.getDefaultEventBackground(event).split('/').pop().split('?')[0];
    assert.ok(mod.exports.featuredBackgroundSource(event).endsWith(`/${expected}`), JSON.stringify(event));
  }
});

test('international portraits share a public snapshot and reuse ID-based matches', async () => {
  let snapshots = 0, lookups = 0;
  const cache = createHomePortraitCache(async () => { snapshots++; return [{ id: 70, photoUrl: 'https://example.test/70.jpg', nationality: 'ES' }]; }, async () => { lookups++; return null; });
  await Promise.all([cache.seed(), cache.seed()]);
  assert.equal(snapshots, 1);
  assert.equal((await cache.load(70)).nationality, 'ES');
  assert.equal(lookups, 0);
  await cache.seed(); assert.equal(snapshots, 1);
});
test('missing portrait lookups deduplicate, reject another ID and discard extra profile data', async () => {
  const work = deferred(); let requests = 0;
  const cache = createHomePortraitCache(async () => [], async () => { requests++; return work.promise; });
  const a = cache.load(74), b = cache.load(74);
  assert.equal(requests, 1);
  work.resolve({ id: 74, photoUrl: 'https://example.test/74.jpg', nationality: 'AR', name: 'Player', birthdate: '1990-01-01' });
  await Promise.all([a, b]);
  assert.deepEqual(Object.keys(cache.read(74)).sort(), ['id', 'nationality', 'photoUrl']);
  const wrong = createHomePortraitCache(async () => [], async () => ({ id: 1, photoUrl: 'https://example.test/1.jpg', nationality: 'ES' }));
  assert.equal(await wrong.load(2), null); assert.equal(wrong.read(1), null);
});
test('portrait cache expires and unsafe image or country values remain absent', async () => {
  let time = 0, requests = 0;
  const cache = createHomePortraitCache(async () => [], async id => { requests++; return { id, photoUrl: 'http://example.test/a.jpg', nationality: 'unknown' }; }, () => time);
  assert.equal((await cache.load(7)).photoUrl, null);
  assert.equal(cache.read(7).nationality, null);
  time = 3600001; assert.equal(cache.read(7), null);
  await cache.load(7); assert.equal(requests, 2);
});

test('published result highlights identify the actual division and winning pair', () => {
  const result = resultHighlight(JSON.stringify([
    { CategoryName: 'Ladies Open', Winner: { Name: 'Ava Jones & Mia Smith' } },
    { CategoryName: "Men's Open", Winner: { Name: 'Juan-Louis Van Antwerpen & Joshua Heath' }, RunnerUp: { Name: 'Adam & Jason' } },
    { CategoryName: "Men's Advanced", winners: 'One & Two' },
    { CategoryName: "Men's Advanced", winners: 'Three & Four' },
  ]));
  assert.equal(result.division, "Men's Open");
  assert.deepEqual(Array.from(result.winners, player => player.name), ['Juan-Louis Van Antwerpen', 'Joshua Heath']);
  assert.equal(result.divisionCount, 3);
  assert.equal(result.runnerUp, 'Adam & Jason');
});
test('results without Men’s Open keep their real division and missing winners stay absent', () => {
  assert.equal(resultHighlight([{ className: 'Mens 40+', winners: 'Hanns & Paul' }]).division, 'Mens 40+');
  for (const raw of [null, '{', {}, [], [{ CategoryName: "Men's Open", winners: 'TBD & Player' }]]) assert.equal(resultHighlight(raw), null);
});
test('winner portraits only use unambiguous exact public identities', () => {
  const result = resultHighlight([{ className: "Men's Open", winners: 'Juan & Joshua' }]);
  const rows = [{ id: 1, name: 'Juan', image_url: 'juan.jpg' }, { id: 2, name: 'Joshua', image_url: 'joshua.jpg' }, { id: 3, name: 'Joshua', image_url: 'other-joshua.jpg' }];
  const decorated = resultPortraits(result, rows);
  assert.equal(decorated.winners[0].photo, 'juan.jpg');
  assert.equal(decorated.winners[1].photo, null);
  assert.equal(result.winners[0].photo, null);
});

test('returning to Home within TTL reuses data; expiry and pull-to-refresh request new data', async () => {
  let time = 0, requests = 0;
  const cache = createHomeFeedCache(() => time); cache.setOwner('a');
  const fetcher = async () => ++requests;
  assert.equal(await cache.load('a', 'spotlight', 90, fetcher), 1);
  time = 89;
  assert.equal(await cache.load('a', 'spotlight', 90, fetcher), 1);
  time = 90;
  assert.equal(await cache.load('a', 'spotlight', 90, fetcher), 2);
  assert.equal(await cache.load('a', 'spotlight', 90, fetcher, true), 3);
});
test('rapid focus and refresh share an in-flight request', async () => {
  const cache = createHomeFeedCache(); cache.setOwner('a');
  const work = deferred(); let requests = 0;
  const fetcher = () => { requests++; return work.promise; };
  const focus = cache.load('a', 'live', 60, fetcher);
  const refresh = cache.load('a', 'live', 60, fetcher, true);
  await Promise.resolve(); assert.equal(requests, 1);
  work.resolve(['live']);
  assert.equal(await focus, await refresh);
});
test('slow payments do not block independently loaded spotlight content', async () => {
  const cache = createHomeFeedCache(); cache.setOwner('a');
  const payments = deferred();
  const slow = cache.load('a', 'payments', 60, () => payments.promise);
  assert.equal(await cache.load('a', 'spotlight', 60, async () => 'visible'), 'visible');
  assert.equal(cache.read('a', 'spotlight'), 'visible');
  assert.equal(cache.read('a', 'payments'), undefined);
  payments.resolve([]); await slow;
});
test('account switch hides previous values and discards pending private responses', async () => {
  const cache = createHomeFeedCache(); cache.setOwner('a');
  await cache.load('a', 'profile', 60, async () => 'Alice');
  const work = deferred(), previous = cache.load('a', 'following', 60, () => work.promise);
  cache.setOwner('b');
  assert.equal(cache.read('a', 'profile'), undefined);
  assert.equal(cache.read('b', 'profile'), undefined);
  await cache.load('b', 'following', 60, async () => 'Bob updates');
  work.resolve('Alice updates');
  assert.equal(await previous, undefined);
  assert.equal(cache.read('b', 'following'), 'Bob updates');
});
test('logout and login to the same account cannot revive a response from the old session', async () => {
  const cache = createHomeFeedCache(); cache.setOwner('a');
  const work = deferred(), old = cache.load('a', 'schedule', 60, () => work.promise);
  cache.setOwner('guest'); cache.setOwner('a');
  await cache.load('a', 'schedule', 60, async () => 'new session');
  work.resolve('old session');
  assert.equal(await old, undefined);
  assert.equal(cache.read('a', 'schedule'), 'new session');
});
test('failed resource retries without clearing other sections or replacing usable cached data', async () => {
  const cache = createHomeFeedCache(); cache.setOwner('a');
  await cache.load('a', 'results', 60, async () => 'last results');
  await assert.rejects(cache.load('a', 'results', 60, async () => { throw Error('Offline'); }, true), /Offline/);
  assert.equal(cache.read('a', 'results'), 'last results');
  assert.equal(await cache.load('a', 'results', 60, async () => 'new results', true), 'new results');
});
test('unknown registration never offers a payment or invents registration', () => {
  const event = { id: 1, event_name: 'Cup' };
  const unknown = homeEventState(event, undefined, undefined);
  assert.equal(unknown.registrationKnown, false);
  assert.equal(unknown.isRegistered, false);
  assert.equal(unknown.isPaid, false);
});
test('balances belong to their event and override paid flags without mutating cached calendar rows', () => {
  const event = { id: 1 };
  const registrations = new Map([[1, { isRegistered: true, isPaid: true, hasOutstandingPayment: false }]]);
  const state = homeEventState(event, registrations, [{ eventId: 1, balanceDue: .5 }]);
  assert.equal(state.isPaid, false); assert.equal(state.hasEntryBalance, true);
  assert.equal(event.isPaid, undefined);
  assert.equal(homeEventState(event, registrations, [{ eventId: 2, balanceDue: 99 }]).isPaid, true);
});
test('following source separates native 4M results from international player and match updates', () => {
  for (const path of ['/players/553', '/events/cup', '/match-result']) assert.equal(homeFeedSource({ path }), '4m');
  for (const path of ['/pro/player/1', '/pro/match/2']) assert.equal(homeFeedSource({ path }), 'international');
});
test('tour cards omit finished events, deduplicate and route official FIP events separately', () => {
  const event = (id, startDate, endDate = startDate) => ({ id, name: 'Cup', startDate, endDate });
  const events = homeTourEvents([event(1, '2026-11-01'), event(2, '2026-11-03', '2026-11-08'), event(3, '2026-11-10'), event(3, '2026-11-10')], Date.parse('2026-11-06T12:00:00Z'));
  assert.deepEqual(Array.from(events, row => row.id), [2, 3]);
  assert.equal(tourPath({ id: -1 }), '/pro/fip/-1');
  assert.equal(tourPath({ id: 1 }), '/pro/tournament/1');
  assert.equal(tourSource({ id: -1 }), 'FIP');
  assert.equal(tourSource({ id: 1, level: 'p1' }), 'Premier Padel');
  assert.equal(tourSource({ id: 1, name: 'Unknown' }), 'International');
});
test('provider enums stay out of product copy and tour dates follow SAST at midnight', () => {
  assert.equal(tourLevelLabel('FIP_OTHER'), null);
  assert.equal(tourLevelLabel('FIP_SILVER'), 'Silver');
  assert.equal(tourLevelLabel('p1'), 'P1');
  assert.equal(homeTourEvents([{ id: 1, startDate: '2026-11-01', endDate: '2026-11-05' }], Date.parse('2026-11-05T22:30:00Z')).length, 0);
});
test('spotlight countdown switches from entry opening to closing, event start and in-progress', () => {
  const event = { registration_opens_at: '2026-11-01T10:00:00+02:00', registration_closes_at: '2026-11-10T17:00:00+02:00', start_date: '2026-11-20', end_date: '2026-11-22' };
  const timer = at => spotlightCountdown(event, Date.parse(at));
  assert.equal(timer('2026-10-31T00:00:00Z').label, 'Entries open in');
  assert.equal(timer('2026-11-06T00:00:00Z').label, 'Entries close in');
  assert.equal(timer('2026-11-11T00:00:00Z').label, 'Event starts in');
  assert.equal(timer('2026-11-20T00:00:00Z').label, 'Event in progress');
  assert.equal(timer('2026-11-23T00:00:00Z').target, null);
});
test('countdowns do not invent deadlines and offset-free times use SAST', () => {
  const event = { registration_opens_at: null, registration_closes_at: null, start_date: '2026-11-20', end_date: null };
  assert.equal(spotlightCountdown(event, Date.parse('2026-11-19T00:00:00Z')).target, Date.parse('2026-11-19T22:00:00Z'));
  assert.equal(spotlightCountdown({ ...event, start_date: null }, Date.now()).target, null);
});
test('following shows the winning pair with individual photos and preserves initials fallbacks', () => {
  const first = { name: 'First', photo: 'https://example.com/first.jpg' }, second = { name: 'Second', photo: null };
  const selected = homeFollowingTeam([{ name: 'Other' }], [[{ name: 'Losing' }], [first, second]], 1);
  assert.equal(selected.length, 2); assert.equal(selected[0], first); assert.equal(selected[1], second);
  assert.equal(homeFollowingTeam([first, second], [], null).length, 2);
});
test('the official rail includes current Bronze and Promises events without duplicating the provider tour', () => {
  const row = (id, level, endDate = '2026-11-08') => ({ id, level, startDate: '2026-11-05', endDate });
  const events = homeOfficialFipEvents([row(-1, 'fip_bronze'), row(-2, 'fip_promises'), row(3, 'fip_bronze'), row(-4, 'fip_gold'), row(-5, 'fip_bronze', '2026-11-01')], Date.parse('2026-11-06T12:00:00Z'));
  assert.deepEqual(Array.from(events, event => event.id), [-1, -2]);
});

// Exercise the hook's lifecycle without a device or a second React renderer.
// Deferred API responses make ownership and independent loading races deterministic.
function homeHarness() {
  const slots = [], effects = [], calls = [], timers = new Set();
  let cursor = 0, source = '4m', active = true, auth;
  const payments = deferred(), cache = createHomeFeedCache();
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const response = (name, value) => (...args) => { calls.push([name, ...args]); return Promise.resolve(value); };
  const mod = { exports: {} };
  const modules = {
    react,
    '@/lib/home-feed-cache': { homeFeedCache: cache },
    '@/lib/home-feed': { homeTourEvents },
    '@/lib/home-tour-presentation': { fetchHomeTourPresentation: response('tour-presentation', {}) },
    '@/lib/supabase': { supabase: { auth: {
      onAuthStateChange(fn) { auth = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: { user: { id: 'a', email: 'a@example.com' } } } }),
    } } },
    './use-screen-active': { useScreenActive: () => active },
    '@/lib/home': {
      fetchPlayer: response('profile', { name: 'Alice', rankedin_id: null }),
      fetchSchedule: response('schedule', { upcoming: [], registrationByEvent: new Map() }),
      fetchPendingPayments: response('payments', payments.promise),
      fetchFeatured: response('spotlight', [{ id: 1 }]), fetchHappeningNow: response('happening', []), fetchRecentResults: response('results', []),
    },
    '@/lib/following-feed': { fetchFollowingFeed: response('following', { items: [] }) },
    '@/lib/media': { fetchMediaAlbums: response('media', []) },
    '@/lib/pro-padel': { fetchProSnapshot: response('snapshot', { matches: [], tournaments: [], tournament: null }) },
    '@/lib/pro-padel-live': { fetchLiveTournaments: response('live', []) },
    '@/lib/matches': { fetchPlayerMatches: response('matches', { upcoming: [] }) },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/use-home-feed.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: name => modules[name], Date, Promise,
      setInterval(fn) { const timer = { fn }; timers.add(timer); return timer; }, clearInterval(timer) { timers.delete(timer); } });
  const render = () => { cursor = 0; return mod.exports.useHomeFeed(source); };
  const flush = async () => { for (let i = 0; i < 16; i++) { render(); while (effects.length) effects.shift()(); await Promise.resolve(); } return render(); };
  return { calls, timers, payments, render, flush, setSource: value => { source = value; }, setActive: value => { active = value; }, account: id => auth('SIGNED_IN', { user: { id, email: `${id}@example.com` } }) };
}
test('Home mounts safely before auth is ready and displays spotlight before a slow private request completes', async () => {
  const app = homeHarness();
  assert.doesNotThrow(app.render);
  const state = await app.flush();
  assert.equal(state.spotlight.data[0].id, 1);
  assert.equal(state.payments.loading, true);
  assert.equal(app.calls.some(([name]) => name === 'snapshot' || name === 'live'), false);
  assert.equal(app.timers.size, 0);
  app.payments.resolve([]); await app.flush();
});
test('switching source loads international resources once and stops its live timer when blurred', async () => {
  const app = homeHarness(); await app.flush();
  app.setSource('international'); await app.flush();
  assert.deepEqual(app.calls.filter(([name]) => name === 'snapshot').map(([, kind]) => kind).sort(), ['fip-calendar', 'fixtures', 'tour']);
  assert.equal(app.timers.size, 1);
  app.setActive(false); await app.flush(); assert.equal(app.timers.size, 0);
  const count = app.calls.length;
  app.setActive(true); await app.flush();
  assert.equal(app.calls.length, count); // Fresh resources are reused on focus.
  app.setSource('4m'); await app.flush(); assert.equal(app.timers.size, 0);
  app.payments.resolve([]); await app.flush();
});
test('the first render after an auth change masks all old-account resource state', async () => {
  const app = homeHarness(); const previous = await app.flush(); assert.equal(previous.profile.data.name, 'Alice');
  app.account('b');
  const next = app.render();
  assert.equal(next.profile.data, undefined); assert.equal(next.following.data, undefined); assert.equal(next.spotlight.data, undefined);
  app.payments.resolve([]); await app.flush();
});
