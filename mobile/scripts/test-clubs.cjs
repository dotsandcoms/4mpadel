const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(path, dependencies, extra = {}) {
  const module = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name], URL, setTimeout, clearTimeout, ...extra });
  return module.exports;
}
const fixture = (values = {}) => ({ id: 'club-id', name: 'Cape Padel', slug: 'cape-padel', status: 'published', city: 'Cape Town', province: 'Western Cape', lat: -33.9249, lng: 18.4241, courts: { indoor: { count: 2 }, outdoor: { count: 4 } }, ...values });
function setup(responses = []) {
  const calls = [], pending = [...responses];
  const supabase = { from(table) {
    const call = { table }; calls.push(call);
    const query = { select(fields) { call.fields = fields; return this; }, in(column, values) { call.publicStatus = [column, values]; return this; }, eq(column, value) { call.identity = [column, value]; return this; }, or(filter) { call.or = filter; return this; }, neq(column, value) { call.neq = [column, value]; return this; }, limit(value) { call.limit = value; return this; }, order() { return this; }, range(from, to) { call.range = [from, to]; return this; }, abortSignal(signal) { call.signal = signal; return this; }, maybeSingle() { call.single = true; return this; }, then(ok, fail) { return Promise.resolve(pending.shift() ?? { data: [] }).then(ok, fail); } };
    return query;
  } };
  return { ...load('src/lib/clubs.ts', { './supabase': { supabase } }), calls };
}
test('clubs read public status rows with explicit public fields, paginate and cache', async () => {
  const rows = Array.from({ length: 250 }, (_, i) => fixture({ id: `club-${i}` }));
  const api = setup([{ data: rows }, { data: [fixture({ id: 'last-club' })] }]);
  const result = await api.fetchClubs();
  assert.equal(result.length, 251); assert.equal(api.calls.length, 2);
  assert.deepEqual(Array.from(api.calls[1].range), [250,499]);
  for (const call of api.calls) {
    assert.equal(call.table, 'clubs');
    assert.deepEqual(Array.from(call.publicStatus[1]), ['published','4m_approved','4m_premium']);
    assert.ok(!/\*|contact|created_by|rejection|approved_by/.test(call.fields));
  }
  assert.equal(await api.fetchClubs(), result); assert.equal(api.calls.length, 2);
});
test('club parsing refuses unpublished rows, unsafe media and invalid map pins', () => {
  const api = setup();
  assert.equal(api.parseClub(fixture({ status: 'in_review' })), null);
  const club = api.parseClub(fixture({ logo_url: 'javascript:alert(1)', lat: null, contact_email: 'private@example.test' }));
  assert.equal(club.logo, null); assert.equal(club.coordinate, null);
  assert.ok(!JSON.stringify(club).includes('private@example.test'));
  assert.equal(api.coordinate(91, 0), null); assert.equal(api.coordinate(NaN, 1), null);
  assert.equal(api.coordinate('', ''), null);
  assert.equal(api.coordinate(0, 0).latitude, 0);
});
test('directory search matches city/province and nearby filters and orders using valid coordinates only', () => {
  const api = setup(), origin = { latitude: -33.9249, longitude: 18.4241 };
  const rows = [api.parseClub(fixture()), api.parseClub(fixture({ id: 'far', name: 'Far away', lat: -26.2041, lng: 28.0473 })), api.parseClub(fixture({ id: 'missing', lat: null, name: 'Missing pin' }))];
  assert.equal(api.filterClubs(rows, 'Western Cape', null, 25).length, 3);
  assert.equal(api.filterClubs(rows, '', origin, 25).length, 1);
  assert.equal(api.filterClubs(rows, '', origin, 25)[0].distance, 0);
  const far = api.distanceKm(origin, { latitude: -26.2041, longitude: 28.0473 });
  assert.ok(far > 1250 && far < 1270);
  assert.equal(api.distanceKm(origin, origin), 0);
});
test('club details stay public and support website opening-hours keys', async () => {
  const api = setup([{ data: fixture({ about: '<p>Courts by the bay</p>', opening_hours: { mon: { open: '06:00', close: '22:00' }, sun: { closed: true } }, services: [{ title: 'Cafe' }], contact_email: 'club@example.test', contacts: [{ email: 'private@example.test' }], created_by: 'private-owner' }) }]);
  const club = await api.fetchClub('cape-padel');
  assert.equal(club.about, 'Courts by the bay');
  assert.equal(club.hours[0].day, 'Monday'); assert.equal(club.hours[0].label, '06:00 – 22:00');
  assert.equal(club.hours[1].label, 'Closed');
  assert.equal(club.facilities[0], 'Cafe');
  assert.equal(club.email, 'club@example.test');
  assert.ok(!JSON.stringify(club).includes('private@example.test'));
  assert.ok(!/contacts[,)]|created_by|approved_by|rejection|\*/.test(api.calls[0].fields));
  assert.match(api.calls[0].fields, /contact_email/);
  assert.deepEqual(Array.from(api.calls[0].identity), ['slug','cape-padel']);
});
const groupFixture = (values = {}) => ({ id: 'group-id', name: 'Net Set Padel', slug: 'net-set-padel', status: 'published', share_logo: true, share_website: true, logo_url: 'https://example.test/group.jpg', website_url: 'https://example.test', ...values });
test('Netset and Net Set include every public group venue, regardless of venue spelling', () => {
  const api = setup(), group = groupFixture();
  const names = ['Net Set Nottingham Road', 'Net Set Padel Bloemfontein', 'Net Set Padel Ramblers Club', 'Net Set Padel Sandton City', 'Netset Padel Bruma', 'Netset Padel Marks Park'];
  const clubs = names.map((name, i) => api.parseClub(fixture({ id: String(i), name, group_id: group.id, club_groups: group })));
  for (const term of ['Netset', 'Net Set', 'NET-SET']) {
    assert.equal(api.filterClubs(clubs, term, null, 25).length, 6);
    assert.equal(api.filterClubGroups([api.parseClubGroup(group)], term).length, 1);
  }
});
test('private groups never supply a public identity or inherited logo/website', async () => {
  const api = setup([{ data: fixture({ website_url: 'https://venue.test', club_groups: groupFixture({ status: 'in_review' }) }) }]);
  const club = await api.fetchClub('cape-padel');
  assert.equal(club.group, null); assert.equal(club.logo, null); assert.equal(club.website, 'https://venue.test/');
  assert.equal(api.parseClubGroup(groupFixture({ status: 'draft' })), null);
  assert.equal(api.filterClubs([club], 'Netset', null, 0).length, 0);
});
test('published group sharing follows its logo/website switches', async () => {
  for (const shared of [false, true]) {
    const api = setup([{ data: fixture({ logo_url: 'https://venue.test/logo.jpg', website_url: 'https://venue.test', club_groups: groupFixture({ share_logo: shared, share_website: shared }) }) }]);
    const club = await api.fetchClub('cape-padel');
    assert.equal(club.logo, shared ? 'https://example.test/group.jpg' : 'https://venue.test/logo.jpg');
    assert.equal(club.website, shared ? 'https://example.test/' : 'https://venue.test/');
  }
});
test('club details parse published gallery, courts, business contacts and reject unsafe URLs', async () => {
  const api = setup([{ data: fixture({ gallery: [{ url: 'https://example.test/court.jpg', caption: 'The courts' }, { url: 'javascript:alert(1)' }], courts: { indoor: { count: 2, features: ['Air conditioned'], image_url: 'https://example.test/indoor.jpg' }, outdoor: { count: 4 }, surface: 'Turf', lighting: 'LED' }, contact_phone: '+27 11 123 4567', contact_email: 'hello@example.test?bcc=other', whatsapp_number: '082 123 4567', socials: { playtomic: 'https://playtomic.io/test', facebook: 'javascript:alert(1)' }, website_url: 'https://user:password@example.test', services: [{ title: 'Coaching', description: 'Group lessons' }], google_rating: 4.8, google_ratings_total: 25 }) }]);
  const club = await api.fetchClub('cape-padel');
  assert.equal(club.gallery.length, 1); assert.equal(club.totalCourts, 6); assert.equal(club.courtDetails.length, 2);
  assert.equal(club.courtDetails[0].features[0], 'Air conditioned'); assert.equal(club.surface, 'Turf');
  assert.equal(club.phone, '+27 11 123 4567'); assert.equal(club.email, null); assert.equal(club.website, null);
  assert.equal(club.whatsapp, 'https://wa.me/27821234567'); assert.equal(club.socials.length, 1);
  assert.equal(club.facilityDetails[0].description, 'Group lessons'); assert.equal(club.googleRating, 4.8);
});
test('unpopulated imported courts do not imply a real zero-court venue', async () => {
  const api = setup([{ data: fixture({ courts: { indoor: { count: 0 }, outdoor: { count: 0 } }, stats: {} }) }]);
  const club = await api.fetchClub('cape-padel'); assert.equal(club.totalCourts, null); assert.equal(club.courtDetails.length, 0);
});
test('groups and branches retain public filtering, pagination, cancellation and cache', async () => {
  const api = setup([{ data: [groupFixture(), groupFixture({ status: 'draft', id: 'private' })] }, { data: [fixture(), fixture({ status: 'draft' })] }]);
  const signal = new AbortController().signal;
  const groups = await api.fetchClubGroups(signal); assert.equal(groups.length, 1); assert.equal(await api.fetchClubGroups(signal), groups);
  assert.equal((await api.fetchGroupVenues('group-id', signal)).length, 1);
  assert.equal(api.calls.length, 2);
  for (const call of api.calls) { assert.equal(call.signal, signal); assert.equal(call.publicStatus[0], 'status'); assert.ok(!call.fields.includes('*')); }
  assert.deepEqual(Array.from(api.calls[1].identity), ['group_id', 'group-id']);
  const aborted = new AbortController(); aborted.abort();
  const cancelled = setup([{ data: [groupFixture()] }, { data: [] }]);
  await assert.rejects(cancelled.fetchClubGroups(aborted.signal), /Cancelled/);
  await cancelled.fetchClubGroups(); assert.equal(cancelled.calls.length, 2);
});
test('linked events use public calendar rules and match the venue or short name', async () => {
  const api = setup([{ data: [{ id: 1, event_name: 'Club Cup', start_date: '2026-11-20', venue: 'CP - Court 1' }, { id: 2, event_name: 'Other', venue: 'Other venue' }] }, { data: [{ organisations: { id: 'public', name: 'Approved club organiser', status: 'approved', org_type: 'club' } }, { organisations: { id: 'draft', name: 'Private', status: 'draft' } }] }]);
  const club = api.parseClub(fixture({ short_name: 'CP' }));
  assert.equal((await api.fetchClubEvents(club)).length, 1);
  assert.equal(api.calls[0].limit, 200); assert.match(api.calls[0].or, /sanction_status/); assert.deepEqual(Array.from(api.calls[0].neq), ['is_visible', false]);
  assert.equal((await api.fetchClubOrganisations(club.id)).length, 1); assert.ok(!api.calls[1].fields.includes('*'));
});
test('club coaches only show approved public directory details matched to the venue', async () => {
  const api=setup([{data:[{id:1,status:'approved',full_name:'Coach',coaching_location:'Cape Padel',profile_pic_url:'https://example.test/coach.jpg',contact_number:'private-phone'},{id:2,status:'pending',full_name:'Private coach',coaching_location:'Cape Padel'},{id:3,status:'approved',full_name:'Other coach',coaching_location:'Other club'}]}]);
  const result=await api.fetchClubCoaches(api.parseClub(fixture()));
  assert.equal(result.length,1);assert.equal(result[0].name,'Coach');assert.ok(!JSON.stringify(result).includes('private-phone'));
  assert.ok(!/contact|email|\*/.test(api.calls[0].fields));assert.equal(api.calls[0].limit,80);
});
test('club community uses public profiles and public team roles without private player records',async()=>{
  const api=setup([{count:109,data:null},{data:[{role:'owner',player_id:7},{role:'member',player_id:8}]},{data:[{id:7,name:'Club owner',image_url:'https://example.test/player.jpg',email:'private@example.test'}]}]);
  const result=await api.fetchClubCommunity('club-id',new AbortController().signal);
  assert.equal(result.players,109);assert.equal(result.team.length,1);assert.equal(result.team[0].role,'owner');
  assert.deepEqual(api.calls.map(call=>call.table),['players_public','club_members_public','players_public']);
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
  for(const call of api.calls)assert.ok(!/email|phone|\*/.test(call.fields));
});
test('an aborted club fetch never populates the public cache', async () => {
  const api = setup([{ data: [fixture()] }]), controller = new AbortController(); controller.abort();
  await assert.rejects(api.fetchClubs(controller.signal), /Cancelled/);
  await api.fetchClubs(); assert.equal(api.calls.length, 2);
});
test('directions include the selected public venue, with no user location', () => {
  const api = setup(), club = api.parseClub(fixture());
  assert.match(api.clubDirectionsUrl(club, 'ios'), /^https:\/\/maps.apple.com\//);
  assert.match(api.clubDirectionsUrl(club, 'android'), /^geo:-33.9249,18.4241/);
  assert.equal(api.clubDirectionsUrl(api.parseClub(fixture({ lat: null, address: null })), 'ios'), null);
});
function locationApi(overrides = {}) {
  const calls = [], adapter = {
    async hasServicesEnabledAsync() { calls.push('services'); return true; },
    async getForegroundPermissionsAsync() { calls.push('permission'); return { granted: false, canAskAgain: true }; },
    async requestForegroundPermissionsAsync() { calls.push('request'); return { granted: true, canAskAgain: true }; },
    async getCurrentPositionAsync(options) { calls.push(['position', options]); return { coords: { latitude: -33.9, longitude: 18.4, accuracy: 100 } }; }, ...overrides,
  };
  const api = load('src/lib/club-location.ts', { 'expo-location': { ...adapter, Accuracy: { Balanced: 3 } }, './clubs': setup() });
  return { ...api, adapter, calls };
}
test('native location asks only foreground permission and takes one balanced fix', async () => {
  const api = locationApi(), result = await api.locateNearbyClubs(api.adapter);
  assert.equal(result.kind, 'located'); assert.equal(result.coordinate.latitude, -33.9);
  assert.deepEqual(api.calls.slice(0,3), ['services','permission','request']);
  assert.equal(api.calls[3][1].accuracy, 3); assert.equal(api.calls.length, 4);
});
test('location denial preserves manual browsing and never gets a position', async () => {
  const api = locationApi({ async requestForegroundPermissionsAsync() { return { granted: false, canAskAgain: false }; } });
  const result = await api.locateNearbyClubs(api.adapter);
  assert.equal(result.kind, 'denied'); assert.equal(result.canAskAgain, false);
  assert.ok(!api.calls.some(call => Array.isArray(call)));
});
test('previously denied permission is not requested again; disabled services do not request permission', async () => {
  const denied = locationApi({ async getForegroundPermissionsAsync() { return { granted: false, canAskAgain: false }; } });
  assert.equal((await denied.locateNearbyClubs(denied.adapter)).kind, 'denied'); assert.deepEqual(denied.calls, ['services']);
  const disabled = locationApi({ async hasServicesEnabledAsync() { return false; } });
  assert.equal((await disabled.locateNearbyClubs(disabled.adapter)).kind, 'unavailable'); assert.deepEqual(disabled.calls, []);
});
test('a granted permission avoids another prompt; a slow location fix returns a bounded unavailable state', async () => {
  const api = locationApi({ async getForegroundPermissionsAsync() { return { granted: true }; }, getCurrentPositionAsync() { return new Promise(() => {}); } });
  assert.equal((await api.locateNearbyClubs(api.adapter, 5)).kind, 'unavailable');
  assert.ok(!api.calls.includes('request'));
});
