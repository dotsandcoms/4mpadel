const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, modules = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: name => name.includes('sapa-main-ranking') ? main : modules[name] || {}, Date, Intl, setTimeout, clearTimeout, AbortController });
  return mod.exports;
}
const main = load('src/lib/sapa-main-ranking.ts');
const row = (gender = 'men', extra = {}) => ({ org: 'SAPA ranking', ranking_id: 15809, age_group_id: gender === 'men' ? 82 : 83, ranking_type: gender === 'men' ? 3 : 4, age_group: `${gender === 'men' ? 'Men' : 'Women'}-Main`, match_type: `${gender === 'men' ? 'Men' : 'Women'}-Doubles`, rank: '6', points: '7672', ...extra });
const grand = row('men', { org: 'SA Grand Tour', ranking_id: 16482, rank: '1', points: '1000' });
const profile = { name: 'Aidan', category: 'Men', preferred_ranking: 'SA Grand Tour|Men-Main|Men-Doubles', active_ranking_label: 'SA Grand Tour - Men-Main', rank_label: '1', points: 1000, rankings: [grand, row()] };
test('SAPA rank and points come from one national row, never active Grand Tour fields', () => {
 const result = main.withSapaMainRanking(profile);
 assert.equal(result.points, 7672); assert.equal(result.rank_label, '6'); assert.equal(result.sapa_main_label, 'SAPA Men-Main');
 assert.equal(result.preferred_ranking, profile.preferred_ranking); assert.equal(profile.points, 1000);
});
test('female identity selects Women-Main even when a male row has more points', () => {
 for (const gender of ['Female', 'Women', 'female']) {
  const result = main.resolveSapaMainRanking({ gender, category: 'Men', rankings: [row('men', { rank: 822, points: 23667 }), row('women', { rank: 2, points: 10444 })] });
  assert.equal(result.label, 'SAPA Women-Main'); assert.equal(result.rank, 2); assert.equal(result.points, 10444);
 }
});
test('an absent matching main row stays unknown rather than showing another circuit or gender', () => {
 for (const rankings of [[grand], [row('women')], [row('men', { age_group: 'Men Over 35', age_group_id: 2 })], []]) {
  const result = main.withSapaMainRanking({ gender: 'Male', rankings, points: 99999, rank_label: '1' });
  assert.equal(result.rank_label, null); assert.equal(result.points, null);
 }
});
test('unknown gender can use a single main category but cannot guess between two', () => {
 assert.equal(main.resolveSapaMainRanking({ rankings: [row('women')] }).gender, 'women');
 assert.equal(main.resolveSapaMainRanking({ rankings: [row('men'), row('women')] }), null);
});
test('provider identifiers cannot be relabelled as a SAPA Main doubles record', () => {
 for (const patch of [{ ranking_id: 16482 }, { age_group_id: 2 }, { ranking_type: 4 }, { age_group: 'Men Over 35' }, { match_type: 'Men-Singles' }, { match_type: 'Mixed-Doubles' }]) {
  assert.equal(main.resolveSapaMainRanking({ gender: 'Male', rankings: [row('men', patch)] }), null);
 }
});
test('legacy JSON, numeric strings and generic Doubles remain supported', () => {
 const result = main.resolveSapaMainRanking({ category: "Men's Open", rankings: JSON.stringify([row('men', { ranking_id: '15809', age_group_id: '82', match_type: 'Doubles' })]) });
 assert.equal(result.points, 7672); assert.equal(result.rank, 6);
 assert.equal(main.resolveSapaMainRanking({ category: 'Ladies', rankings: [{ org: 'SAPA ranking', age_group: 'Women-Main', points: 0 }] }).points, 0);
});
test('malformed, negative, missing and conflicting values are never invented', () => {
 for (const points of [null, '', 'bad', -3, Infinity]) assert.equal(main.resolveSapaMainRanking({ gender: 'Male', rankings: [row('men', { points })] }).points, null);
 for (const rankings of ['bad json', {}, null]) assert.equal(main.resolveSapaMainRanking({ rankings }), null);
 assert.equal(main.resolveSapaMainRanking({ rankings: [row(), row('men', { points: 1 })] }), null);
 assert.equal(main.resolveSapaMainRanking({ rankings: [row(), row()] }).points, 7672);
});
const resolver = load('src/lib/website/player-ranking-selection.js');
const teams = load('src/lib/event-teams.ts', { './website/player-ranking-selection': resolver });
const entries = [{ id: 'a', division_id: 'open', full_name: 'Paul', partner_name: 'Aidan', email_hash: 'p', partner_email_hash: 'a' }, { id: 'b', division_id: 'open', full_name: 'Aidan', partner_name: 'Paul', email_hash: 'a', partner_email_hash: 'p' }];
test('event player badges, team total and default ordering use SAPA Main', () => {
 const group = teams.buildEventTeams([{ id: 'open', name: 'Open' }], entries, [{ name: 'Paul', gender: 'Male', points: 1, rankings: [row('men', { points: 2712 })] }, profile])[0];
 assert.deepEqual(Array.from(group.teams[0].players, p => p.points), [2712, 7672]);
 assert.equal(group.teams[0].total, 10384); assert.equal(group.teams[0].seed, 1);
});
test('team totals stay unavailable when one profile is missing or ambiguous', () => {
 for (const profiles of [[profile], [profile, { ...profile }]]) {
  const team = teams.buildEventTeams([{ id: 'open', name: 'Open' }], entries, profiles)[0].teams[0];
  assert.equal(team.total, null); assert.equal(team.seed, null);
 }
});
test('explicit division seed order remains separate from visible national points', () => {
 const profiles = [{ name: 'Aidan', gender: 'Male', rankings: [row('men', { points: 8000 }), { ...grand, points: 100 }] }, { name: 'Paul', gender: 'Male', rankings: [row('men', { points: 2000 }), { ...grand, points: 1000 }] }];
 const group = teams.buildEventTeams([{ id: 'open', name: 'Open', seeding_ranking_source: 'organisation:SA Grand Tour' }], entries.map(e => ({ ...e, partner_name: null })), profiles)[0];
 assert.equal(group.teams[0].players[0].name, 'Paul'); assert.equal(group.teams[0].total, 2000);
 assert.equal(group.teams[1].players[0].name, 'Aidan'); assert.equal(group.teams[1].total, 8000);
});
test('Home projects the signed-in snapshot without extra ranking-provider requests', async () => {
 let selected;
 const query = { select(value) { selected = value; return this; }, ilike() { return this; }, maybeSingle: async () => ({ data: profile }) };
 const home = load('src/lib/home.ts', { '@/lib/supabase': { supabase: { from: () => query } } });
 const player = await home.fetchPlayer('player@example.com', true);
 assert.equal(player.points, 7672); assert.equal(player.rank_label, '6'); assert.match(selected, /rankings/); assert.match(selected, /gender/);
});
test('public profiles project main points while retaining labelled ranking breakdowns', async () => {
 const q = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { ...profile, id: 42 } }) };
 const players = load('src/lib/players.ts', { '@/lib/supabase': { supabase: { from: () => q } } });
 const player = await players.fetchPublicPlayer('42');
 assert.equal(player.points, 7672); assert.equal(player.rankings[0].points, '1000'); assert.equal(players.sapaMainRanking(player).points, '7672');
});
test('registration uses the same main projection and does not render missing points as zero', () => {
 const code = fs.readFileSync('src/app/events/register.tsx', 'utf8');
 assert.match(code, /setProfile\(player \? withSapaMainRanking\(player\)/);
 assert.match(code, /points,rankings,gender,category/);
 assert.doesNotMatch(fs.readFileSync('src/lib/player-hub.ts', 'utf8'), /points: match\?\.points \?\? p\.points/);
});
