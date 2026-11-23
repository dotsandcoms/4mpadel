import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchArchivePage, pilotTargets, previewArchive, syncArchive } from '../scripts/lib/rankedin-history-worker.mjs';
import { createRankedinSource, job, SourceIssue } from '../scripts/lib/rankedin-history-source.mjs';

const player = 'R000000123';
const event = { event_key: 'tournament:825', event_id: '825' };

test('SAPA catalogue and player history continue using the provider totals', async () => {
    const source = { get: async (_, query) => {
        const row = { Id: query.skip + 825, Name: 'Open', Link: '/en/tournament/' + (query.skip + 825) + '/open' };
        return { Payload: [row], TotalCount: 2 };
    } };
    const task = job('participation', player, { player_id: player, internal_id: '123' });
    const first = await fetchArchivePage(task, source);
    assert.equal(first.state, 'page');
    assert.equal(first.cursor.skip, 1);
    assert.deepEqual(first.jobs, [job('tournament', '825', event)]);
    const second = await fetchArchivePage({ ...task, cursor: first.cursor }, source);
    assert.equal(second.state, 'done');
    assert.equal(second.records.find(r => r.kind === 'participation').event_key, 'tournament:826');
    await assert.rejects(() => fetchArchivePage({ ...task, cursor: first.cursor }, {
        get: () => source.get('', { skip: 0 }),
    }), { code: 'repeated_source_page' });

    const catalogue = await fetchArchivePage(job('catalogue', 'finished', { finished: true }), {
        get: async () => ({ payload: [{ eventId: 825, eventName: 'Open', type: 4 }], totalCount: 2 }),
    });
    assert.equal(catalogue.cursor.skip, 1);
    assert.equal(catalogue.jobs[0].key, 'tournament:825');
});

test('published fixture results are collected even when the player feed returns placeholders', async () => {
    const direct = await fetchArchivePage(job('player_matches', player, { player_id: player, internal_id: '123' }), {
        playerMatches: async () => ({ Payload: [{ Info: { EventName: 'EventName' } }] }),
    });
    assert.equal(direct.issue, 'player_match_feed_placeholder');
    assert.equal(direct.records.length, 0);
    const fixture = {
        Id: 112, TournamentClassName: 'Open',
        Challenger: { Player1Id: 123, Player1Url: '/en/player/' + player + '/test' },
        MatchResult: { IsPlayed: true, Score: { FirstParticipantScore: 6, SecondParticipantScore: 2 } },
    };
    const result = await fetchArchivePage(job('tournament_matches', '825', event), {
        get: async () => ({ AreMatchesPublished: true, Matches: [fixture, { ...fixture, Id: 113, ShowResult: false }] }),
    });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].key, 'challenge:112');
    assert.deepEqual(result.records[0].data.player_ids, [player]);
    assert.deepEqual(result.records[0].data.score.Score, [{ Score1: 6, Score2: 2 }]);
});

test('entry and standing adapters preserve doubles and all places from public divisions', async () => {
    const source = {
        get: async path => path.includes('GetPlayersForClass')
            ? { Teams: [], Participants: [{ Participant: {
                TournamentPlayerId: 8,
                FirstPlayer: { Id: 123, RankedinId: player, Name: 'First' },
                SecondPlayer: { Id: 456, RankedinId: 'R000000456', Name: 'Second' },
            } }] }
            : { Data: [1, 2, 8].map(standing => ({ EventParticipantId: standing, Standing: standing, Player1Name: 'Player' })) },
    };
    const args = { ...event, class_id: '72', ranking_id: '9' };
    const roster = await fetchArchivePage(job('tournament_roster', '825:72', args), source);
    assert.deepEqual(roster.records[0].data.player_ids, [player, 'R000000456']);
    const standings = await fetchArchivePage(job('tournament_results', '825:72', args), source);
    assert.deepEqual(standings.records.map(row => row.data.placing), [1, 2, 8]);
});

test('ranking results include the source flag for counted and uncounted finishes', async () => {
    const task = job('points', player, { player_id: player, participant_id: '23', age_group: '4' });
    const result = await fetchArchivePage(task, { get: async (_, query) => {
        assert.equal(query.showAll, true);
        return { ParticipantWithPoints: { EventPoints: { TotalCount: 2, Payload: [true, false].map((counted, i) => ({
            EventUrl: '/en/tournament/' + (825 + i) + '/open',
            EventPoint: { EventName: 'Open | Class: A', Date: '2026-11-01', IsInCalculation: counted, Points: 12.5, Standing: 8 },
        })) } } };
    } });
    assert.deepEqual(result.records.map(row => row.data.counted), [true, false]);
    assert.equal(result.records[0].data.points, 12.5);
    assert.notEqual(result.records[0].key, result.records[1].key);
});

test('a rate limit stops the worker and the retry keeps the last saved cursor', async () => {
    const task = job('participation', 'test', { internal_id: '123' });
    task.cursor = { skip: 100, fingerprint: 'saved' };
    task.attempts = 1;
    let claims = 0;
    let result;
    const report = await syncArchive({
        seed: async () => ({}),
        claim: async () => { claims++; return task; },
        finish: async (_, page) => { result = page; return true; },
        status: async () => ({}),
    }, {
        deadline: Date.now() + 60000,
        source: { get: () => { throw new SourceIssue('rate_limited', { retryAfter: 234 }); } },
    });
    assert.equal(claims, 1);
    assert.equal(result.state, 'retry');
    assert.equal(result.nextSeconds, 234);
    assert.deepEqual(result.cursor, task.cursor);
    assert.equal(report.issues.rate_limited, 1);
});

test('dry runs access only the status method and never enqueue or save', async () => {
    const archive = { status: async () => ({ pending_initial: 0 }) };
    const result = await previewArchive(archive, [], {});
    assert.equal(result.dry_run, true);
    assert.equal(result.archive.pending_initial, 0);
    assert.throws(() => pilotTargets('bad-id'));
    assert.equal(pilotTargets(player + ',' + player).length, 1);
});

test('public fetch uses retry-after without exposing a response body', async () => {
    const source = createRankedinSource({
        interval: 0,
        fetchImpl: async () => new Response('rate limit body', { status: 429, headers: { 'retry-after': '120' } }),
    });
    await assert.rejects(() => source.get('thing', {}), { code: 'rate_limited', retryAfter: 120 });
});

test('team league pools are discovered without a pool ID in the event link', async () => {
    const args = { event_id: '940', event_key: 'teamleague:940' };
    const result = await fetchArchivePage(job('teamleague', '940', args), {
        get: async (route, query) => {
            assert.match(route, /GetPoolsInfoAsync/);
            assert.equal(query.id, '940');
            return { arePoolsPublished: true, pools: [{ id: 12616, name: 'Pool A' }] };
        },
    });
    assert.equal(result.records[1].data.name, 'Pool A');
    assert.equal(result.jobs[0].args.pool_id, '12616');
});

test('club league grids preserve published played matches without treating hidden cells as results', async () => {
    const args = { event_id: '940', event_key: 'clubleague:940', feed: 'pools' };
    const set = { FirstParticipantScore: 6, SecondParticipantScore: 3 };
    const cell = {
        ChallengeId: 431, IsPublished: true, ShowResult: true,
        MatchResults: { IsPlayed: true, Score: set },
    };
    const a = { ParticipantCell: { Players: [{ RankedinId: player, Name: 'First' }] } };
    const b = { ParticipantCell: { Players: [{ RankedinId: 'R000000456', Name: 'Other' }] } };
    const result = await fetchArchivePage(job('clubleague', '940:pools', args), {
        get: async () => [{
            PoolId: 20, Name: 'Pool A', Standings: [{ ParticipantId: 7, Standing: 1, PlayerRankedinId: player }],
            Pool: [[{}, b, b], [a, { MatchCell: cell }, { MatchCell: { ...cell, ChallengeId: 432, IsPublished: false } }]],
        }],
    });
    const match = result.records.find(row => row.kind === 'match');
    assert.equal(result.records.filter(row => row.kind === 'match').length, 1);
    assert.deepEqual(match.data.player_ids, [player, 'R000000456']);
    assert.deepEqual(match.data.score.Score, [{ Score1: 6, Score2: 3 }]);
    assert.equal(result.records.find(row => row.kind === 'standing').data.placing, 1);
});
