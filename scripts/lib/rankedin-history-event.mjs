import { normalizeRankedinMatchScore } from '../../src/utils/rankedinMatchScore.js';
import { done, job, label, numericId, record, rows, SourceIssue } from './rankedin-history-source.mjs';
import { playerIds, publicPlayer } from './rankedin-history-player.mjs';

function lifetime(event) {
    if (event?.IsActive || event?.IsFinished === false) return 1;
    return 30;
}

function divisionRecord(eventKey, division, classId) {
    const key = eventKey + ':' + classId;
    return record('division', key, { id: classId, name: label(division.Name) }, eventKey);
}

async function tournament(task, source) {
    const { event_id: id, event_key: key } = task.args;
    const base = { event_id: id, event_key: key };
    // Discovery is independent so an unavailable standings endpoint cannot block rosters or fixtures.
    const jobs = [
        job('tournament_results', key, base),
        job('tournament_roster', key, base),
        job('tournament_matches', key, base),
    ];
    return done([record('event', key, { id, event_type: 'tournament' }, key)], jobs, 30);
}

function requireDivisionId(division) {
    const id = numericId(division?.Id);
    if (!id) throw new SourceIssue('division_id_unavailable');
    return id;
}

async function tournamentResults(task, source) {
    const { event_id: id, event_key: key, class_id: classId, ranking_id: rankingId } = task.args;
    if (!classId) {
        const standings = await source.get('tournament/GetStandingsAsync', { id });
        if (String(standings?.TournamentId) !== id || typeof standings.IsFinished !== 'boolean') {
            throw new SourceIssue('malformed_source');
        }
        const classes = rows(standings.Classes);
        const published = standings.IsFinished;
        const ranking = numericId(standings.Rankings?.[0]?.Id) ?? '0';
        const divisions = classes.map(division => divisionRecord(key, division, requireDivisionId(division)));
        const jobs = published ? classes.map(division => {
            const classId = requireDivisionId(division);
            return job('tournament_results', key + ':' + classId, {
                event_id: id, event_key: key, class_id: classId, ranking_id: ranking,
            });
        }) : [];
        const event = record('event', key, { id, event_type: 'tournament', standings_published: published }, key);
        return done([event, ...divisions], jobs, lifetime(standings), published && !classes.length ? 'results_divisions_unavailable' : undefined);
    }
    const response = await source.get('tournament/GetResultsAsync', {
        tournamentId: id, classId, rankingId, language: 'en',
    });
    const items = rows(response?.Data);
    const records = items.map(item => {
        const entry = numericId(item.EventParticipantId);
        if (!entry) throw new SourceIssue('standing_id_unavailable');
        const sides = [
            publicPlayer(undefined, item.Player1Name, item.Player1Url),
            publicPlayer(undefined, item.Player2Name, item.Player2Url),
        ].filter(side => side.id || side.name);
        return record('standing', key + ':' + classId + ':' + entry, {
            class_id: classId, entry_id: entry, placing: item.Standing, placing_to: item.StandingRangeTo || undefined,
            players: sides, player_ids: playerIds(sides),
        }, key);
    });
    return done(records, [], 30, !records.length ? 'published_standings_empty' : undefined);
}

function rosterEntry(item, eventKey, classId) {
    const p = item.Participant ?? item;
    const sides = [p.FirstPlayer, p.SecondPlayer].filter(Boolean)
        .map(side => publicPlayer(side.RankedinId, side.Name, side.PlayerUrl, side.Id))
        .filter(side => side.id || side.name);
    const sources = [p.FirstPlayer, p.SecondPlayer].filter(Boolean)
        .map(side => numericId(side.Id) ?? playerIdFromSide(side)).filter(Boolean).sort();
    const entryId = numericId(p.EventParticipantId ?? p.TournamentPlayerId);
    const teamId = numericId(p.TeamId ?? p.Team?.Id ?? p.Id);
    const eventParticipantId = numericId(p.EventParticipantId);
    const suffix = eventParticipantId ? 'entry:' + eventParticipantId
        : teamId ? 'team:' + teamId
            : sources.length ? 'players:' + sources.join(':') : entryId;
    if (!suffix || (!sides.length && !label(p.TeamName ?? p.Name ?? p.Team?.Name))) return undefined;
    return record('entry', eventKey + ':' + classId + ':' + suffix, {
        class_id: classId, entry_id: entryId, team_id: teamId, team_name: label(p.TeamName ?? p.Name ?? p.Team?.Name),
        players: sides, player_ids: playerIds(sides),
        withdrawn: typeof p.HasCancelation === 'boolean' ? p.HasCancelation : undefined,
    }, eventKey);
}

function playerIdFromSide(side) {
    return publicPlayer(side.RankedinId, undefined, side.PlayerUrl).id;
}

async function tournamentRoster(task, source) {
    const { event_id: id, event_key: key, class_id: classId } = task.args;
    if (!classId) {
        const divisions = rows(await source.get('tournament/GetPlayersTabAsync', { id, language: 'en' }));
        const records = divisions.map(division => divisionRecord(key, division, requireDivisionId(division)));
        const jobs = divisions.map(division => {
            const classId = requireDivisionId(division);
            return job('tournament_roster', key + ':' + classId, { event_id: id, event_key: key, class_id: classId });
        });
        return done(records, jobs, 7, !divisions.length ? 'entry_divisions_unavailable' : undefined);
    }
    const response = await source.get('tournament/GetPlayersForClassAsync', {
        tournamentId: id, tournamentClassId: classId, language: 'en',
    });
    const items = [...rows(response?.Teams ?? []), ...rows(response?.Participants ?? [])];
    if (!Array.isArray(response?.Teams) && !Array.isArray(response?.Participants)) throw new SourceIssue('malformed_source');
    const records = items.map(item => rosterEntry(item, key, classId)).filter(Boolean);
    return done(records, [], 7, records.length !== items.length ? 'entry_id_unavailable' : undefined);
}

function sections(data) {
    if (Array.isArray(data)) return data.flatMap(sections);
    if (data?.AreMatchesPublished === false || data?.Matches?.AreMatchesPublished === false) return [];
    return rows(Array.isArray(data?.Matches) ? data.Matches : data?.Matches?.Matches);
}

function fixturePlayers(side) {
    if (!side) return [];
    return [
        publicPlayer(undefined, side.Name, side.Player1Url, side.Player1Id),
        publicPlayer(undefined, side.Player2Name, side.Player2Url, side.Player2Id),
    ].filter(player => player.id || player.name);
}

function isTeamFixture(item) {
    return [item?.Challenger, item?.Challenged].some(side => label(side?.Player1Url)?.includes('/team/'));
}

function fixtureRecord(item, eventKey) {
    const id = numericId(item?.Id);
    if (!id) throw new SourceIssue('match_id_unavailable');
    const first = fixturePlayers(item.Challenger);
    const second = fixturePlayers(item.Challenged);
    const score = normalizeRankedinMatchScore(item.MatchResult?.Score);
    const winner = item.MatchResult?.Score?.IsFirstParticipantWinner ?? item.MatchResult?.IsFirstParticipantWinner;
    return record('match', 'challenge:' + id, {
        challenge_id: id,
        player_ids: playerIds([...first, ...second]),
        first_players: first, second_players: second,
        division: label(item.TournamentClassName), draw: label(item.Draw),
        date: label(item.Date), court: label(item.Court),
        first_won: typeof winner === 'boolean' ? winner : undefined,
        score: score.Score.length ? score : undefined,
        score_quality: score.Score.length ? (score.IsSummary ? 1 : 2) : undefined,
    }, eventKey);
}

function playedFixtures(fixtures, eventKey) {
    return fixtures.filter(item => item?.MatchResult?.IsPlayed && item.ShowResult !== false)
        .map(item => fixtureRecord(item, eventKey));
}

async function tournamentMatches(task, source) {
    const { event_id: id, event_key: key, challenge_id: challengeId } = task.args;
    if (challengeId) {
        const data = await source.get('tournament/GetTournamentTeamsMatchesAsync', {
            tournamentId: id, challengeId, language: 'en',
        });
        return done(playedFixtures(sections(data), key), [], 7);
    }
    const data = await source.get('tournament/GetMatchesSectionAsync', {
        Id: id, LanguageCode: 'en', IsReadonly: true,
    });
    const fixtures = sections(data);
    const jobs = [];
    for (const fixture of fixtures.filter(isTeamFixture)) {
        const child = numericId(fixture.Id);
        if (!child) throw new SourceIssue('match_id_unavailable');
        jobs.push(job('tournament_team_matches', key + ':' + child, { event_id: id, event_key: key, challenge_id: child }));
    }
    return done(playedFixtures(fixtures, key), jobs, 7,
        data?.AreMatchesPublished === false ? 'fixtures_unpublished' : undefined);
}

export const tournamentTasks = {
    tournament,
    tournament_roster: tournamentRoster,
    tournament_results: tournamentResults,
    tournament_matches: tournamentMatches,
    tournament_team_matches: tournamentMatches,
};

export { playedFixtures, sections };
