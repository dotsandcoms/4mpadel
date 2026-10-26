const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const code = ts.transpileModule(fs.readFileSync('src/lib/event-map.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load() {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require, Map, Number, Promise, Error, encodeURIComponent });
  return module.exports;
}
const maps = load();
const event = { venue: 'Padel 365 Century City', venues: ['Padel 365 Century City', 'Padel 365 Richmond'], address: 'Century City address', city: 'Cape Town' };
test('a second venue does not inherit the first venue address in its map or directions', () => {
  assert.equal(maps.eventMapLocation(event, 'Padel 365 Richmond').query, 'Padel 365 Richmond Cape Town');
  assert.equal(maps.eventMapLocation(event, 'removed venue').venue, 'Padel 365 Century City');
  assert.equal(maps.eventMapLocation({ ...event, venues: [] }, '').query, 'Padel 365 Century City Century City address Cape Town');
});
test('Android directions open Google Maps with the selected destination safely encoded', async () => {
  const calls = [];
  await maps.openEventDirections('Courts & Club #2 Cape Town', 'android', async url => calls.push(url));
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'google.navigation:q=Courts%20%26%20Club%20%232%20Cape%20Town&mode=d');
});
test('directions still work without the Google Maps app, and failed fallback propagates', async () => {
  const calls = [];
  await maps.openEventDirections('Richmond Cape Town', 'android', async url => { calls.push(url); if (calls.length === 1) throw new Error('No handler'); });
  assert.equal(calls[1], 'https://www.google.com/maps/dir/?api=1&destination=Richmond%20Cape%20Town');
  await assert.rejects(maps.openEventDirections('venue', 'android', async () => { throw new Error('offline'); }), /offline/);
  await assert.rejects(maps.openEventDirections(' ', 'android', async () => assert.fail('must not launch')), /does not have a venue/);
});
test('iOS directions retain their existing link behavior', async () => {
  let opened;
  await maps.openEventDirections('Cape Town', 'ios', async url => { opened = url; });
  assert.equal(opened, 'https://maps.google.com/?q=Cape%20Town');
});
test('simultaneous address lookups share a request, cache success, and allow failed retries', async () => {
  const resolver = load();
  let calls = 0, finish;
  const geocode = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = resolver.resolveVenueCoordinate('venue', '', geocode);
  const second = resolver.resolveVenueCoordinate('venue', '', geocode);
  assert.equal(calls, 1);
  finish([{ latitude: -33.9, longitude: 18.5 }]);
  assert.equal(await first, await second);
  await resolver.resolveVenueCoordinate('venue', '', async () => assert.fail('cached lookup'));
  await assert.rejects(resolver.resolveVenueCoordinate('other', '', async () => { throw new Error('offline'); }), /offline/);
  const retry = await resolver.resolveVenueCoordinate('other', '', async () => [{ latitude: 0, longitude: 0 }]);
  assert.equal(retry.latitude, 0);
});
test('only valid coordinates are cached, and the coordinate cache remains bounded', async () => {
  const resolver = load();
  await assert.rejects(resolver.resolveVenueCoordinate('bad', '', async () => [{ latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 20 }]), /could not be located/);
  const calls = [];
  await resolver.resolveVenueCoordinate('full query', 'street address', async value => { calls.push(value); return value === 'street address' ? [{ latitude: -33, longitude: 18 }] : []; });
  assert.deepEqual(calls, ['full query', 'street address']);
  for (let index = 0; index < 101; index++) await resolver.resolveVenueCoordinate(String(index), '', async () => [{ latitude: -33, longitude: 18 }]);
  assert.equal(resolver.cachedVenueCoordinate('0'), null);
  assert.equal(resolver.cachedVenueCoordinate('100').latitude, -33);
});

function renderLocation(platform, key) {
  const node = (type, props) => ({ type, props });
  const jsx = { jsx: node, jsxs: node, Fragment: 'Fragment' };
  const GoogleMap = 'GoogleMap', AppleMap = 'AppleMap';
  const query = maps.eventMapLocation(event, '').query;
  const requests = [];
  const mockMap = { ...maps, cachedVenueCoordinate: () => ({ latitude: -33, longitude: 18 }) };
  const module = { exports: {} };
  const component = ts.transpileModule(fs.readFileSync('src/components/events/event-location.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const react = { useEffect: () => {}, useState: value => [value, () => {}] };
  const mockRequire = name => {
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'react') return react;
    if (name === 'react-native') return { Platform: { OS: platform }, View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' };
    if (name === 'expo') return { requireOptionalNativeModule: name => { requests.push(name); return {}; } };
    if (name === '@/lib/event-map') return mockMap;
    if (name === './website-ui') return { EventText: 'Text', useEventAccent: () => '#ff0022' };
    if (name === 'expo-maps') { requests.push('expo-maps'); return { GoogleMaps: { View: GoogleMap, MapColorScheme: { LIGHT: 'light' } }, AppleMaps: { View: AppleMap, MapColorScheme: { LIGHT: 'light' } } }; }
    throw new Error('Unexpected dependency '+name);
  };
  vm.runInNewContext(component, { module, exports: module.exports, require: mockRequire, process: { env: { EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: key } } });
  const tree = module.exports.EventLocation({ event, selectedVenue: '', onSelectVenue: () => {}, onDirections: () => {} });
  const nodes = [];
  function visit(value) { if (Array.isArray(value)) return value.forEach(visit); if (!value || typeof value !== 'object') return; nodes.push(value); visit(value.props?.children); }
  visit(tree);
  return { nodes, requests, query };
}
test('Android renders Google Maps while iOS retains Apple Maps', () => {
  const android = renderLocation('android', 'test-key');
  assert.ok(android.nodes.some(node => node.type === 'GoogleMap'));
  assert.ok(!android.requests.includes('ExpoAppleMaps'));
  const ios = renderLocation('ios');
  assert.ok(ios.nodes.some(node => node.type === 'AppleMap'));
  assert.ok(!ios.requests.includes('ExpoGoogleMaps'));
});
test('missing Android credentials never instantiate the crash-prone map and keep directions available', () => {
  const android = renderLocation('android');
  assert.ok(!android.requests.includes('expo-maps'));
  assert.ok(android.nodes.some(node => node.props?.children === 'Open Google Maps'));
  assert.ok(!android.nodes.some(node => typeof node.props?.children === 'string' && node.props.children.includes('iOS build')));
});
