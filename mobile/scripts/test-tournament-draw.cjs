const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/tournament-draw.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, URL, Intl, Date });
const { publishedDrawChoices, rankedinDrawSections, nativeDrawSections, drawMatchWhen } = mod.exports;
const fixture = require('./fixtures/tournament-draw.json');
const completedFixture = require('./fixtures/tournament-draw-results.json');
const directory = [{ id: 454, name: 'Brett Hilarides', rankedin_id: 'R000342302', image_url: 'https://test.invalid/brett.jpg' }];

test('Growthpoint exposes only published Men 35+ and Men 45+ draws', () => {
  assert.deepEqual(Array.from(publishedDrawChoices(fixture.classes), c => c.name), ['Men 35+', 'Men 45+']);
  assert.equal(publishedDrawChoices([{ IsPublished: false, ShowDraws: false, TournamentDraws: [{ Id: 1 }] }]).length, 0);
});
test('real Growthpoint bracket includes all 12 matches and all four placement sections without duplicates', () => {
  const before = JSON.stringify(fixture.draw), sections = rankedinDrawSections(fixture.draw, directory);
  assert.equal(sections.length, 4);
  assert.deepEqual(Array.from(sections[0].rounds, r => r.name), ['Quarterfinals', 'Semifinals', 'Final']);
  assert.deepEqual(Array.from(sections, s => s.rounds.reduce((n, r) => n + r.matches.length, 0)), [7, 1, 3, 1]);
  const match = sections[0].rounds[0].matches[0];
  assert.equal(match.one.players[0].name, 'Brett Hilarides'); assert.equal(match.one.players[0].photo, 'https://test.invalid/brett.jpg');
  assert.equal(match.one.players[1].name, 'Jason Blakey-Milner'); assert.equal(match.one.players[1].photo, null);
  assert.equal(match.one.players[0].country, 'ZA'); assert.equal(match.court, 'Century Crt 2');
  assert.match(drawMatchWhen(match.start), /10:00 SAST$/); assert.equal(JSON.stringify(fixture.draw), before);
});
test('detailed sets, totals, winners and cancellation states retain their meaning', () => {
  const base = fixture.draw[0].Elimination.DrawCells[0];
  const payload = results => [{ BaseType: 'Elimination', Elimination: { DrawCells: [{ ...base, MatchViewModel: results }] } }];
  let match = rankedinDrawSections(payload({ IsPlayed: true, IsFirstParticipantWinner: false, Score: { DetailedScoring: [{ FirstParticipantScore: 0, SecondParticipantScore: 6 }, { FirstParticipantScore: 0, SecondParticipantScore: 6 }] } }))[0].rounds[0].matches[0];
  assert.deepEqual(Array.from(match.scores, s => Array.from(s)), [[0, 6], [0, 6]]); assert.equal(match.winner, 2); assert.equal(match.summary, false);
  match = rankedinDrawSections(payload({ IsPlayed: true, Score: { FirstParticipantScore: 2, SecondParticipantScore: 0 } }))[0].rounds[0].matches[0];
  assert.equal(match.summary, true); assert.equal(match.completed, true);
  match = rankedinDrawSections(payload({ HasCancellation: true, IsFirstParticipantWinner: true }))[0].rounds[0].matches[0];
  assert.equal(match.status, 'Walkover'); assert.equal(match.completed, true);
  match = rankedinDrawSections(payload({ IsPlayed: false, IsFirstParticipantWinner: true }))[0].rounds[0].matches[0];
  assert.equal(match.status, 'Walkover'); assert.equal(match.completed, true);
});
test('Nationals final highlights Ockie/Scott and assigns every set to the correct team', () => {
  const final = rankedinDrawSections(completedFixture.divisions[0].draw)[0].rounds.at(-1).matches[0];
  assert.deepEqual(Array.from(final.one.players, p => p.name), ['Brett Hilarides', 'Jason Blakey-Milner']);
  assert.deepEqual(Array.from(final.two.players, p => p.name), ['Ockie Oosthuizen', 'Scott Whysall']);
  assert.equal(final.winner, 2);
  assert.deepEqual(Array.from(final.scores, s => Array.from(s)), [[6, 3], [3, 6], [4, 6]]);
});
test('both Nationals divisions have one championship final and a separately named third-place playoff', () => {
  const expected = [
    [['Ockie Oosthuizen', 'Scott Whysall'], ['Martin Redelinghuys', 'James Munro']],
    [['Paul Atkinson', 'Paul Waldburger'], ['Brad Vermeulen', 'Brandon Weir-Smith']],
  ];
  completedFixture.divisions.forEach((division, i) => {
    const before = JSON.stringify(division.draw), sections = rankedinDrawSections(division.draw);
    const finals = sections.flatMap(s => s.rounds).filter(r => r.name === 'Final');
    assert.equal(finals.length, 1);
    assert.equal(finals[0].matches.length, 1);
    const playoff = sections.find(s => s.name === '3rd place playoff').rounds[0];
    assert.equal(playoff.name, '3rd place playoff');
    assert.equal(playoff.matches.length, 1);
    [finals[0], playoff].forEach((round, j) => {
      const match = round.matches[0];
      assert.deepEqual(Array.from((match.winner === 1 ? match.one : match.two).players, p => p.name), expected[i][j]);
    });
    assert.equal(JSON.stringify(division.draw), before);
  });
});
test('both completed Nationals divisions agree with the independently ordered RankedIn match results', () => {
  let reversed = 0, compared = 0, byes = 0;
  const names = values => Array.from(values, n => n.trim().replace(/\s+/g, ' '));
  for (const division of completedFixture.divisions) {
    const before = JSON.stringify(division.draw);
    const normalized = rankedinDrawSections(division.draw).flatMap(s => s.rounds.flatMap(r => r.matches));
    const cells = division.draw.flatMap(s => s.Elimination.DrawCells);
    assert.equal(normalized.length, cells.length);
    for (const cell of cells) {
      const match = normalized.find(m => m.id === String(cell.MatchId));
      const result = division.matches.find(m => m.Id === cell.ChallengeId);
      if (!result && (match.one.placeholder === 'Bye' || match.two.placeholder === 'Bye')) {
        assert.equal(match.status, 'Bye'); assert.equal(match.completed, true);
        assert.equal(match.winner, match.one.placeholder === 'Bye' ? 2 : 1);
        assert.equal(match.scores.length, 0); byes++;
        continue;
      }
      assert.ok(result, `match result missing for ${division.name} / ${cell.MatchId}`);
      const firstNames = names(match.one.players.map(p => p.name));
      const secondNames = names(match.two.players.map(p => p.name));
      const isReversed = firstNames.join('|') === names(result.Challenged).join('|');
      assert.deepEqual(firstNames, names(isReversed ? result.Challenged : result.Challenger));
      assert.deepEqual(secondNames, names(isReversed ? result.Challenger : result.Challenged));
      const firstWon = result.MatchResult.IsFirstParticipantWinner;
      assert.equal(typeof firstWon, 'boolean');
      assert.deepEqual(names((match.winner === 1 ? match.one : match.two).players.map(p => p.name)), names(firstWon ? result.Challenger : result.Challenged));
      const score = result.MatchResult.Score;
      const sets = !score ? [] : score.DetailedScoring.length ? score.DetailedScoring : [score];
      const expected = sets.map(s => isReversed ? [s.SecondParticipantScore, s.FirstParticipantScore] : [s.FirstParticipantScore, s.SecondParticipantScore]);
      assert.deepEqual(Array.from(match.scores, s => Array.from(s)), expected, `scores for ${division.name} / ${cell.MatchId}`);
      compared++;
      if (isReversed) reversed++;
    }
    assert.equal(JSON.stringify(division.draw), before);
  }
  assert.equal(compared, 36); assert.equal(byes, 6);
  assert.ok(reversed > 0, 'fixture must exercise reversed challenge/bracket order');
});
test('winner IDs handle string identities, reversed totals and score flags naming either side', () => {
  const base = completedFixture.divisions[0].draw[0].Elimination.DrawCells.at(-1);
  const normalize = cell => rankedinDrawSections([{ BaseType: 'Elimination', Elimination: { DrawCells: [cell] } }])[0].rounds[0].matches[0];
  let match = normalize({ ...base, WinnerParticipantId: String(base.WinnerParticipantId), MatchViewModel: { IsPlayed: true, IsFirstParticipantWinner: true, Score: { FirstParticipantScore: 2, SecondParticipantScore: 1 } } });
  assert.equal(match.winner, 2); assert.equal(match.summary, true);
  assert.deepEqual(Array.from(match.scores, s => Array.from(s)), [[1, 2]]);
  match = normalize({ ...base, WinnerParticipantId: base.ChallengerParticipant.EventParticipantId, MatchViewModel: { IsPlayed: true, IsFirstParticipantWinner: false, Score: { DetailedScoring: [{ FirstParticipantScore: 4, SecondParticipantScore: 6 }] } } });
  assert.equal(match.winner, 1);
  assert.deepEqual(Array.from(match.scores, s => Array.from(s)), [[6, 4]]);
  match = normalize({ ...base, MatchViewModel: { IsPlayed: true, IsFirstParticipantWinner: false, Score: { DetailedScoring: [{ FirstParticipantScore: 4, SecondParticipantScore: 6 }] } } });
  assert.equal(match.winner, 2);
  assert.deepEqual(Array.from(match.scores, s => Array.from(s)), [[4, 6]]);
  match = normalize({ ...base, MatchViewModel: { IsPlayed: false, IsFirstParticipantWinner: null, Score: null } });
  assert.equal(match.winner, 2); assert.equal(match.status, 'Walkover'); assert.equal(match.scores.length, 0);
  match = normalize({ ...base, WinnerParticipantId: 0, ChallengerParticipant: { EventParticipantId: 0 }, ChallengedParticipant: { EventParticipantId: 0 }, MatchViewModel: { IsPlayed: false, IsFirstParticipantWinner: null, Score: null } });
  assert.equal(match.winner, null); assert.equal(match.completed, false); assert.equal(match.status, 'Upcoming match');
});
test('round robin preserves standings, names and deduplicates mirrored pool matches', () => {
  const section = rankedinDrawSections([fixture.roundRobin])[0];
  assert.equal(section.standings.length, 6); assert.equal(section.rounds[0].matches.length, 15);
  const match = section.rounds[0].matches[0]; assert.equal(match.start, null);
  assert.equal(match.one.players[0].name, 'Nicolas Rajah'); assert.equal(match.two.players[0].name, 'Edwin de Villiers');
  assert.equal(match.winner, 2); assert.equal(match.summary, true);
  assert.deepEqual(Array.from(match.scores, s => Array.from(s)), [[2, 4]]);
});
test('ambiguous profiles and mismatched RankedIn identities cannot acquire someone else’s picture', () => {
  const mismatch = [{ ...directory[0], rankedin_id: 'wrong' }, { ...directory[0], id: 999, rankedin_id: 'wrong' }];
  assert.equal(rankedinDrawSections(fixture.draw, mismatch)[0].rounds[0].matches[0].one.players[0].photo, null);
});
test('native draws preserve groups, round labels, scores, winners and local player identity', () => {
  const sections = nativeDrawSections([{ id: 'm', round_number: 1, round_label: 'Quarterfinal', bracket_position: 1, entry_one_id: 'a', entry_two_id: 'b', winner_entry_id: 'b', status: 'completed' }], [{ id: 'a', player_one_id: 454, player_one_name: 'Brett Hilarides' }, { id: 'b', player_one_name: 'Opponent' }], [{ match_id: 'm', set_number: 1, entry_one_games: 4, entry_two_games: 6 }], [], [], directory);
  const match = sections[0].rounds[0].matches[0]; assert.equal(match.winner, 2); assert.equal(match.one.players[0].id, '454'); assert.equal(match.scores[0][1], 6);
  assert.equal(sections[0].rounds[0].name, 'Quarterfinal');
});
test('native finals and third-place playoffs sharing a round number stay separate in either input order', () => {
  const matches = [
    { id: 'final', stage: 'knockout', round_number: 3, round_label: 'Final', bracket_position: 1, entry_one_id: 'a', entry_two_id: 'b', winner_entry_id: 'a', status: 'completed' },
    { id: 'third', stage: 'placement', round_number: 3, round_label: '3rd place playoff', bracket_position: 2, entry_one_id: 'c', entry_two_id: 'd', winner_entry_id: 'c', status: 'completed' },
  ];
  const entries = ['a', 'b', 'c', 'd'].map(id => ({ id, player_one_name: id }));
  for (const input of [matches, [...matches].reverse()]) {
    const before = JSON.stringify(input), rounds = nativeDrawSections(input, entries, [], [], [])[0].rounds;
    assert.equal(new Set(rounds.map(r => r.id)).size, 2);
    assert.deepEqual(Array.from(rounds, r => [r.name, Array.from(r.matches, m => m.id)]), [['Final', ['final']], ['3rd place playoff', ['third']]]);
    assert.equal(JSON.stringify(input), before);
  }
});
function drawBoard(sections, matchId, results) {
  const hooks = { useState: initial => [initial, () => {}], useMemo: fn => fn(), useEffect() {} };
  const modules = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name])), StyleSheet: { create: value => value } },
    'expo-image': { Image: 'Image' }, '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-router': {},
    '@/lib/tournament-draw': mod.exports, '@/lib/tournament-draw-data': {}, '@/lib/player-hub': {}, '@/lib/supabase': {}, '@/theme/tokens': { lightBrand: {} },
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('src/components/events/tournament-draw.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  const cards = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (node.type === exports.TournamentDrawMatch) cards.push(node.props);
    visit(node.props?.children);
  }
  visit(exports.TournamentDrawBoard({ sections, matchId, results }));
  return { cards, renderCard: props => exports.TournamentDrawMatch(props) };
}
test('Draws and Results show only the selected final or playoff and title each match card explicitly', () => {
  for (const division of completedFixture.divisions) {
    const sections = rankedinDrawSections(division.draw);
    for (const results of [false, true]) for (const section of sections.slice(0, 2)) {
      const round = section.rounds.at(-1), match = round.matches[0];
      const board = drawBoard(sections, match.id, results);
      assert.equal(board.cards.length, 1);
      assert.equal(board.cards[0].match.id, match.id);
      assert.equal(board.cards[0].roundLabel, round.name);
      assert.ok(JSON.stringify(board.renderCard(board.cards[0])).includes(round.name));
    }
  }
});
test('draw and results tabs render in-app rather than routing through a browser', () => {
  const screen = fs.readFileSync('src/app/(tabs)/(calendar)/events/[id].tsx', 'utf8');
  assert.match(screen, /<TournamentDraw event=/); assert.doesNotMatch(screen, /View published draws|openSitePath\(eventDrawPath/);
});
test('website draw links route to the native tab and retain explicit native source and notification targets', async () => {
  const routes = [], browsers = [], module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/lib/site.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URL, require: name => name === 'expo-router' ? { router: { push: route => routes.push(route) } } : { openBrowserAsync: url => browsers.push(url) } });
  for (const path of ['/draws/nationals', '/results/nationals', '/native-draws/nationals?division=d&match=m']) await module.exports.openSitePath(path);
  assert.equal(browsers.length, 0); assert.equal(routes[0].params.tab, 'Draws'); assert.equal(routes[1].params.tab, 'Results');
  assert.equal(routes[2].params.drawSource, 'native'); assert.equal(routes[2].params.division, 'd'); assert.equal(routes[2].params.match, 'm');
});
