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
const { resultHighlight, resultHighlights, resultPortraits, resultHighlightKey } = load('src/lib/home-results.ts');
const { createHomePortraitCache } = load('src/lib/home-pro-portraits.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('Home offers Following in the native picker while the event calendar keeps its two circuits', () => {
  const mod = { exports: {} }, selected = [];
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/home-source-picker.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, require: id => id === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }) } : id === 'react-native' ? { useWindowDimensions: () => ({ width: 393, fontScale: 1 }) } : { NativeSegmentedControl: 'NativeSegmentedControl' } });
  const home = mod.exports.HomeSourcePicker({ following: true, value: 'following', onChange: value => selected.push(value) });
  assert.equal(home.type, 'NativeSegmentedControl');
  assert.equal(home.props.value, 'following');
  assert.deepEqual(Array.from(home.props.options, option => option.label), ['4M', 'Premier & FIP', 'Following']);
  for (const option of home.props.options) home.props.onChange(option.value);
  assert.deepEqual(selected, ['4m', 'international', 'following']);
  const calendar = mod.exports.HomeSourcePicker({ value: '4m', onChange: value => selected.push(value) });
  assert.equal(calendar.props.options.length, 2);
  calendar.props.onChange('following');
  assert.equal(selected.length, 3);
});

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

test('FIP Home shortcuts select the native calendar and Players tabs with their destination filters', () => {
  const mod = { exports: {} }, navigated = [], pushed = [];
  const empty = { data: null, loading: false, error: false };
  const feed = Object.fromEntries(['profile', 'following', 'payments', 'schedule', 'matches', 'spotlight', 'happening', 'results', 'media', 'tour', 'fixtures', 'live', 'fip'].map(name => [name, empty]));
  let stateIndex = 0;
  const modules = {
    react: { useState: value => [stateIndex++ === 0 ? 'international' : value, () => {}], useMemo: fn => fn(), useRef: current => ({ current }), useEffect() {} },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: styles => styles }, View: 'View', FlatList: 'FlatList', RefreshControl: 'RefreshControl' },
    'expo-router': { useRouter: () => ({ push: path => pushed.push(path) }), useNavigation: () => ({ navigate: (name, params) => navigated.push({ name, params }) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '@/hooks/use-tab-scene-padding': { useTabScenePadding: () => 0 },
    '@/hooks/use-home-feed': { useHomeFeed: () => feed },
    '@/lib/home': { profileGaps: () => [] },
    '@/lib/home-feed': { homeTourEvents: () => [], homeOfficialFipEvents: () => [] },
    '@/lib/home-tour-presentation': { upcomingTourEvents: () => [] },
    '@/lib/pro-padel': { selectProMatches: () => [] },
    '@/theme/tokens': { lightBrand: {} },
  };
  const runtime = modules['react/jsx-runtime'];
  const shortcuts = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/home-shortcuts.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: shortcuts, exports: shortcuts.exports, require: id => id === 'react/jsx-runtime' ? runtime : { HomeAction: 'HomeAction' } });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/(tabs)/index.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, URLSearchParams, require: id => modules[id] || new Proxy({}, { get: (_, key) => key }) });
  const list = mod.exports.default().props.children.find(child => child?.type === 'FlatList');
  const shortcutProps = list.props.renderItem({ item: 'shortcuts' }).props.children.props;
  assert.equal(shortcutProps.source, 'international');
  const actions = shortcuts.exports.HomeShortcuts(shortcutProps).props.children;
  actions[0].props.onPress();
  actions[3].props.onPress();
  assert.deepEqual(JSON.parse(JSON.stringify(navigated)), [
    { name: '(calendar)', params: { screen: 'calendar', params: { circuit: 'pro', timing: 'upcoming' } } },
    { name: 'rankings', params: { view: 'Discover', source: 'pro', query: '', gender: 'all' } },
  ]);
  assert.equal(pushed.length, 0);
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

test('published results retain every winning pair and keep source order without preferring Men’s Open', () => {
  const raw = JSON.stringify([
    { CategoryName: 'Ladies Open', Winner: { Name: 'Ava Jones & Mia Smith' } },
    { CategoryName: "Men's Open", Winner: { Name: 'Juan-Louis Van Antwerpen & Joshua Heath' }, RunnerUp: { Name: 'Adam & Jason' } },
    { CategoryName: "Men's Advanced", winners: 'One & Two' },
    { CategoryName: "Men's Advanced", winners: 'Three & Four' },
  ]);
  const results = resultHighlights(raw), result = results[1];
  assert.equal(results.length, 4);
  assert.equal(results[0].division, 'Ladies Open');
  assert.equal(resultHighlight(raw).division, 'Ladies Open');
  assert.equal(result.division, "Men's Open");
  assert.deepEqual(Array.from(result.winners, player => player.name), ['Juan-Louis Van Antwerpen', 'Joshua Heath']);
  assert.equal(result.divisionCount, 3);
  assert.equal(result.runnerUp, 'Adam & Jason');
});

test('women, mixed, junior, age-group and men’s winners are equally available; only exact repeats are removed', () => {
  const divisions = ['Women’s Open', 'Mixed Open', 'Girls U18', 'Men 40+', 'Men’s Open'];
  const rows = divisions.map((division, index) => ({ CategoryName: division, Winner: { Name: `Player ${index} & Partner ${index}` } }));
  const results = resultHighlights([...rows, rows[0], { CategoryName: 'Unfinished', Winner: { Name: 'TBD & Pending' } }]);
  assert.deepEqual(Array.from(results, result => result.division), divisions);
  assert.ok(results.every(result => result.divisionCount === 5));
  assert.equal(new Set(results.map(resultHighlightKey)).size, 5);
  assert.deepEqual(Array.from(resultHighlights('{')), []);
});

test('every division receives exact public portraits and keeps ambiguous identities as initials', () => {
  const results = resultHighlights([{ className: 'Women', winners: 'Ava & Mia' }, { className: 'Mixed', winners: 'Sam & Jo' }]);
  const profiles = [{ id: 1, name: 'Ava', image_url: 'ava.jpg' }, { id: 2, name: 'Mia', image_url: 'mia.jpg' },
    { id: 3, name: 'Sam', image_url: 'sam.jpg' }, { id: 4, name: 'Jo', image_url: 'jo-one.jpg' }, { id: 5, name: 'Jo', image_url: 'jo-two.jpg' }];
  const decorated = results.map(result => resultPortraits(result, profiles));
  assert.deepEqual(Array.from(decorated[0].winners, player => player.photo), ['ava.jpg', 'mia.jpg']);
  assert.deepEqual(Array.from(decorated[1].winners, player => player.photo), ['sam.jpg', null]);
  assert.equal(results[0].winners[0].photo, null);
});

test('Home fetches and decorates every published division using only the required public portraits', async () => {
  const mod = { exports: {} }, queried = [];
  const winners = ['Women’s Open', 'Mixed Open', 'Juniors', 'Men 40+', 'Men’s Open'].map((division, i) => ({ className: division, winners: `Winner ${i} & Partner ${i}` }));
  const people = winners.flatMap((_, i) => [{ id: i * 2, name: `Winner ${i}`, image_url: `winner-${i}.jpg` }, { id: i * 2 + 1, name: `Partner ${i}`, image_url: `partner-${i}.jpg` }]);
  const api = { from(table) {
    let fields, names;
    const query = { select(value) { fields = value; return query; }, or() { return query; }, neq() { return query; }, order() { return query; }, limit() { return query; }, eq() { return query; }, in(field, values) { if (field === 'name') names = values; return query; },
      then(resolve, reject) {
        if (table === 'players_public') queried.push({ fields, names });
        return Promise.resolve({ data: table === 'calendar' ? [{ id: 1, event_name: 'Inclusive Cup', start_date: '2026-11-06', end_date: '2026-11-08' }]
          : table === 'rankedin_results_cache' ? [{ event_id: 1, winners }] : people, error: null }).then(resolve, reject);
      } };
    return query;
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/home.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, Date, Map, Set, require: id => id === '@/lib/supabase' ? { supabase: api } : id === './home-results' ? { resultHighlights, resultPortraits } : {} });
  const events = await mod.exports.fetchRecentResults(true);
  assert.equal(events.length, 1);
  assert.equal(events[0].resultDivisions.length, 5);
  assert.equal(events[0].resultHighlight.division, 'Women’s Open');
  assert.equal(events[0].resultDivisions[4].winners[1].photo, 'partner-4.jpg');
  assert.equal(queried.length, 1);
  assert.equal(queried[0].fields, 'id, name, image_url');
  assert.equal(queried[0].names.length, 10);
});

test('a reopened winners sheet scopes its reads to one visible event and surfaces result errors', async () => {
  const mod = { exports: {} }, calls = []; let denied = false, unavailable = false;
  const api = { from(table) {
    const query = { select(fields) { calls.push([table, 'select', fields]); return query; }, eq(field, value) { calls.push([table, 'eq', field, value]); return query; },
      or(value) { calls.push([table, 'or', value]); return query; }, neq(field, value) { calls.push([table, 'neq', field, value]); return query; },
      in(field, values) { calls.push([table, 'in', field, Array.from(values)]); return query; }, maybeSingle() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: table === 'calendar' ? unavailable ? null : { id: 7 } : [{ event_id: 7, winners: [{ className: 'Mixed', winners: 'Ava & Sam' }] }],
        error: denied && table === 'rankedin_results_cache' ? new Error('Unavailable') : null }).then(resolve, reject); } };
    return query;
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/home.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: id => id === '@/lib/supabase' ? { supabase: api } : id === './home-results' ? { resultHighlights, resultPortraits } : {} });
  assert.equal(await mod.exports.fetchEventWinners(-1), null);
  assert.equal(calls.length, 0);
  assert.equal((await mod.exports.fetchEventWinners(7)).resultDivisions[0].division, 'Mixed');
  assert.ok(calls.some(row => row[0] === 'calendar' && row[1] === 'eq' && row[2] === 'id' && row[3] === 7));
  assert.ok(calls.some(row => row[0] === 'calendar' && row[1] === 'neq' && row[2] === 'is_visible' && row[3] === false));
  assert.ok(calls.some(row => row[0] === 'rankedin_results_cache' && row[1] === 'in' && row[3].length === 1 && row[3][0] === 7));
  denied = true;
  await assert.rejects(mod.exports.fetchEventWinners(7), /Unavailable/);
  unavailable = true; calls.length = 0;
  assert.equal(await mod.exports.fetchEventWinners(7), null);
  assert.ok(calls.every(row => row[0] === 'calendar'));
});

test('compact result cards open the all-winners sheet and keep full-results navigation separate', () => {
  const mod = { exports: {} }; let opened = 0, shown = 0;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/home-feed.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, require: id => id === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      : id === 'react-native' ? { StyleSheet: { create: x => x }, View: 'View', Text: 'Text', Pressable: 'Pressable' }
      : id === '@/theme/tokens' ? { lightBrand: {} }
      : id === '@/lib/home' ? { formatEventRange: () => '6–8 NOV' } : { SwipeCards: 'SwipeCards', HomeAction: 'HomeAction', SymbolView: 'SymbolView' } });
  const results = resultHighlights(['Women', 'Mixed', 'Juniors', 'Men'].map(division => ({ className: division, winners: `${division} One & ${division} Two` })));
  const event = { id: 7, event_name: 'Inclusive Cup', resultDivisions: results };
  const rail = mod.exports.LocalResults({ events: [event], onOpen: () => { opened++; }, onWinners: selected => { assert.equal(selected.id, 7); shown++; } });
  const card = rail.props.renderCard(event);
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];
  const nodes = flatten(card.type(card.props));
  const seeWinners = nodes.find(node => node.props?.label === 'See winners');
  assert.match(seeWinners.props.accessibilityLabel, /all 4 divisions/);
  seeWinners.props.onPress();
  assert.equal(shown, 1);
  assert.equal(opened, 0);
  nodes.find(node => node.type === 'Pressable').props.onPress();
  assert.equal(opened, 1);
  event.resultDivisions = [];
  const fallback = flatten(card.type(card.props)).find(node => node.props?.label === 'View results');
  fallback.props.onPress();
  assert.equal(opened, 2);
  assert.equal(shown, 1);
});

test('all-winners sheets reuse only the current account’s Home data and discard stale responses', async () => {
  const mod = { exports: {} }, effects = [], cached = { id: 7, resultDivisions: [{ division: 'Women' }, { division: 'Mixed' }] };
  const reads = [], pending = deferred(); let state, receive, requests = 0, unsubscribe = 0, hooks = 0;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/hooks/use-event-winners.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: id => id === 'react' ? { useEffect: callback => effects.push(callback), useState: initial => ++hooks === 1 ? [0, () => {}] : [initial, next => { state = next; }] }
      : id === '@/lib/supabase' ? { supabase: { auth: { onAuthStateChange: callback => { receive = callback; return { data: { subscription: { unsubscribe: () => { unsubscribe++; } } } }; }, getSession: () => new Promise(() => {}) } } }
      : id === '@/lib/home-feed-cache' ? { homeFeedCache: { setOwner: () => {}, load: (_owner, _key, _ttl, fetcher) => fetcher(), read: (owner, key) => { reads.push([owner, key]); return owner === 'a:a@example.com' ? [cached] : undefined; } } }
      : id === '@/lib/event-winner-details' ? { fetchEventWinnerDetails: async () => ({ results: cached.resultDivisions, warning: false }) }
      : id === '@/lib/home-results' ? { resultHighlightKey: result => result.division }
      : { fetchEventWinners: () => { requests++; return pending.promise; } } });
  mod.exports.useEventWinners(7);
  const cleanup = effects[0]();
  receive('SIGNED_IN', { user: { id: 'a', email: ' A@EXAMPLE.COM ' } });
  assert.equal(state.event, cached);
  assert.equal(state.loading, false);
  assert.equal(requests, 0);
  receive('SIGNED_IN', { user: { id: 'b', email: 'b@example.com' } });
  assert.equal(state.event, undefined);
  await Promise.resolve();
  assert.equal(requests, 1);
  receive('SIGNED_IN', { user: { id: 'a', email: 'a@example.com' } });
  pending.resolve({ id: 7, event_name: 'Stale response' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.event.id, cached.id);
  assert.equal(state.event.resultDivisions, cached.resultDivisions);
  assert.ok(reads.every(([, key]) => key === 'results:all-divisions'));
  cleanup();
  assert.equal(unsubscribe, 1);
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
  let cursor = 0, source = '4m', active = true, enabled = true, auth;
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
  const render = () => { cursor = 0; return mod.exports.useHomeFeed(source, enabled); };
  const flush = async () => { for (let i = 0; i < 16; i++) { render(); while (effects.length) effects.shift()(); await Promise.resolve(); } return render(); };
  return { calls, timers, payments, render, flush, setSource: value => { source = value; }, setActive: value => { active = value; }, setEnabled: value => { enabled = value; }, account: id => auth('SIGNED_IN', { user: { id, email: `${id}@example.com` } }) };
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

test('Following pauses other Home requests and international polling while retaining the personal header', async () => {
  const app = homeHarness(); await app.flush();
  app.setSource('international'); await app.flush();
  assert.equal(app.timers.size, 1);
  const count = app.calls.length;
  app.setEnabled(false); app.setSource('4m');
  const following = await app.flush();
  assert.equal(app.timers.size, 0);
  assert.equal(app.calls.length, count);
  assert.equal(following.profile.data.name, 'Alice');
  app.setSource('international'); app.setEnabled(true); await app.flush();
  assert.equal(app.timers.size, 1);
  assert.equal(app.calls.length, count);
  app.payments.resolve([]); await app.flush();
});

function winnerDetailsModule(overrides = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/event-winner-details.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: id => id === './supabase' ? { supabase: overrides.api }
      : id === './sapa-main-ranking' ? load('src/lib/sapa-main-ranking.ts')
      : id === './event-draws' ? load('src/lib/event-draws.ts')
      : overrides.draws ?? {} });
  return mod.exports;
}
const scoreFixture = (division = 'Women') => {
  const result = { division, winners: [{ name: 'Ava', photo: null }, { name: 'Mia', photo: null }], runnerUp: 'Sam & Jo', divisionCount: 1 };
  const team = names => ({ players: names.map(name => ({ name })), placeholder: null, seed: null });
  const match = { id: 'final-1', one: team(['Sam', 'Jo']), two: team(['Mia', 'Ava']), completed: true, winner: 2,
    scores: [[5, 7], [3, 6]], summary: false, court: 'Court 1', status: 'Final score' };
  const sections = [{ name: 'Main draw', kind: 'knockout', rounds: [{ name: 'Final', matches: [match] }] }];
  const choice = { id: 'class:draw', classId: 'class', name: division, strength: 0, stage: 0 };
  return { result, match, sections, choice };
};

test('division finals orient every set to the published winners, even when they are the second team', () => {
  const { winnerFinal } = winnerDetailsModule(), f = scoreFixture();
  const final = winnerFinal(f.result, f.sections, f.choice, 'rankedin');
  assert.deepEqual(JSON.parse(JSON.stringify(final.scores)), [[7, 5], [6, 3]]);
  assert.deepEqual(f.match.scores, [[5, 7], [3, 6]]);
  assert.equal(final.court, 'Court 1');
  assert.equal(final.source, 'rankedin');
});

test('winner cards reject other divisions, different opponents, placement matches and unfinished finals', () => {
  const { winnerFinal } = winnerDetailsModule(), f = scoreFixture();
  assert.equal(winnerFinal(f.result, f.sections, { ...f.choice, name: 'Men' }, 'rankedin'), null);
  assert.equal(winnerFinal({ ...f.result, runnerUp: 'Other & Pair' }, f.sections, f.choice, 'rankedin'), null);
  assert.equal(winnerFinal({ ...f.result, winners: [{ name: 'Other' }] }, f.sections, f.choice, 'rankedin'), null);
  assert.equal(winnerFinal(f.result, [{ ...f.sections[0], name: '3rd place playoff' }], f.choice, 'rankedin'), null);
  f.match.completed = false;
  assert.equal(winnerFinal(f.result, f.sections, f.choice, 'native'), null);
  f.match.completed = true; f.match.scores = []; f.match.status = 'Walkover';
  const walkover = winnerFinal(f.result, f.sections, f.choice, 'native');
  assert.equal(walkover.status, 'Walkover');
  assert.equal(walkover.scores.length, 0);
});

test('native main-draw finals are supported without treating a consolation winner as a champion', () => {
  const { winnerFinal } = winnerDetailsModule(), f = scoreFixture();
  const native = [{ ...f.sections[0], name: 'Tournament draw' }];
  assert.equal(winnerFinal(f.result, native, f.choice, 'native').source, 'native');
  assert.equal(winnerFinal(f.result, native, { ...f.choice, name: 'Women · Consolation' }, 'native'), null);
});

test('winner identities use current gender-correct SAPA main ranks and leave duplicate public names unlinked', () => {
  const { winnerProfiles } = winnerDetailsModule(), f = scoreFixture();
  const profiles = [{ id: 1, name: 'Ava', nationality: 'ZA', gender: 'female', rankings: [
    { ranking_id: 16482, age_group: 'Women-Main', rank: 9 },
    { ranking_id: 15809, age_group: 'Men-Main', rank: 822 },
    { ranking_id: 15809, age_group: 'Women-Main', rank: 2 }], image_url: 'ava.jpg' },
    { id: 2, name: 'Mia', gender: 'female' }, { id: 3, name: 'Mia', gender: 'female' }];
  const result = winnerProfiles(f.result, profiles);
  assert.equal(result.winners[0].ranking.label, 'SAPA Women-Main');
  assert.equal(result.winners[0].ranking.rank, 2);
  assert.equal(result.winners[0].country, 'ZA');
  assert.equal(result.winners[1].profileId, null);
  assert.equal(result.winners[1].ranking, null);
  assert.deepEqual(Array.from(result.runnersUp, player => player.name), ['Sam', 'Jo']);
  assert.equal(f.result.winners[0].ranking, undefined);
});

test('the winners sheet loads at most two draws at a time and skips ambiguous class identities', async () => {
  const queried = []; let active = 0, peak = 0, draws = 0;
  const fixtures = ['Women', 'Mixed', 'Juniors', 'Men', 'Over 40'].map(name => scoreFixture(name));
  const choices = fixtures.map((f, i) => ({ ...f.choice, id: `${i}:draw`, classId: String(i), name: f.result.division }));
  const api = { from(table) {
    assert.equal(table, 'players_public');
    return { select(fields) { queried.push(fields); return this; }, in(field, names) { assert.equal(field, 'name'); assert.ok(names.includes('Ava') && names.includes('Sam')); return Promise.resolve({ data: [], error: null }); } };
  } };
  const { fetchEventWinnerDetails } = winnerDetailsModule({ api, draws: {
    fetchTournamentDrawChoices: async () => choices,
    fetchTournamentDraw: async (_event, source, choice) => { assert.equal(source, 'rankedin'); active++; peak = Math.max(peak, active); draws++;
      await new Promise(resolve => setImmediate(resolve)); active--; return { sections: fixtures.find(f => f.result.division === choice.name).sections }; },
  } });
  const event = { id: 523, rankedin_url: 'https://www.rankedin.com/en/tournament/75991/event', resultDivisions: fixtures.map(f => f.result) };
  const detail = await fetchEventWinnerDetails(event);
  assert.equal(peak, 2); assert.equal(draws, 5); assert.equal(detail.warning, false);
  assert.equal(detail.results.filter(result => result.final).length, 5);
  assert.deepEqual(queried, ['id,name,image_url,nationality,rankings,gender,category']);
  choices.push({ ...choices[0], classId: 'another-class' });
  draws = 0;
  const ambiguous = await fetchEventWinnerDetails(event);
  assert.equal(ambiguous.results[0].final, undefined);
  assert.equal(draws, 4);
});

test('Final details opens that division and match rather than defaulting to Men’s Open', () => {
  const mod = { exports: {} }, routes = []; let dismissed = 0;
  const result = { ...scoreFixture('Ladies Open').result, final: { matchId: '7038000', classId: '180099', choiceId: '180099:654069', source: 'rankedin', scores: [[6, 3], [6, 4]], summary: false, court: 'Court 1', status: 'Final score' } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/event-winners.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, require: id => id === 'react/jsx-runtime' ? { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }
      : id === 'expo-router' ? { useLocalSearchParams: () => ({ id: '523' }), useRouter: () => ({ canDismiss: () => true, dismiss: () => { dismissed++; }, navigate: route => routes.push(route) }) }
      : id === 'react-native' ? { StyleSheet: { create: x => x }, View: 'View', Text: 'Text', FlatList: 'FlatList', useWindowDimensions: () => ({ width: 393, fontScale: 1 }) }
      : id === 'react-native-safe-area-context' ? { useSafeAreaInsets: () => ({ bottom: 34 }) }
      : id === '@/hooks/use-event-winners' ? { useEventWinners: () => ({ event: { id: 523, event_name: 'Inclusive Cup', resultDivisions: [result] } }) }
      : id === '@/lib/home-results' ? { resultHighlightKey }
      : id === '@/lib/home' ? { formatEventRange: () => '6–8 NOV' }
      : id === '@/theme/tokens' ? { lightBrand: {} } : { SymbolView: 'SymbolView', HomeAction: 'HomeAction' } });
  const tree = mod.exports.default(), list = tree.props.children[0], element = list.props.renderItem({ item: result });
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];
  const finalButton = flatten(element.type(element.props)).find(node => node.props?.label === 'Final details');
  finalButton.props.onPress();
  assert.equal(dismissed, 1);
  assert.equal(routes[0].pathname, '/events/[id]');
  assert.equal(routes[0].params.id, '523');
  assert.equal(routes[0].params.division, '180099');
  assert.equal(routes[0].params.drawChoice, '180099:654069');
  assert.equal(routes[0].params.match, '7038000');
  assert.equal(routes[0].params.drawSource, 'rankedin');
  assert.equal(routes[0].params.tab, 'Results');
});
