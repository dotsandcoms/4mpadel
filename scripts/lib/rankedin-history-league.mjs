import { normalizeRankedinMatchScore } from '../../src/utils/rankedinMatchScore.js';
import { done, job, label, numericId, pageParameters, pageResult, record, rows } from './rankedin-history-source.mjs';
import { playerIds, publicPlayer } from './rankedin-history-player.mjs';
import { playedFixtures, sections } from './rankedin-history-event.mjs';

function capitalizeKeys(value) {
    if (Array.isArray(value)) return value.map(capitalizeKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
        [key[0].toUpperCase() + key.slice(1), capitalizeKeys(item)]));
}

async function teamleague(task, source) {
    const { event_id: id, event_key: key, pool_id: poolId } = task.args;
    const response = await source.get('teamleague/GetPoolsInfoAsync', { id });
    const published = response?.arePoolsPublished !== false;
    const pools = rows(response?.pools);
    const poolIds = published ? [...new Set([poolId, ...pools.map(pool => pool.id)].map(numericId).filter(Boolean))] : [];
    const jobs = poolIds.map(poolId => job('teamleague_pool', key + ':' + poolId, {
        event_id: id, event_key: key, pool_id: poolId,
    }));
    const event = record('event', key, { id, event_type: 'teamleague' }, key);
    const divisions = pools.filter(pool => published && numericId(pool.id)).map(pool => record('division',
        key + ':' + pool.id, { id: String(pool.id), name: label(pool.name) }, key));
    return done([event, ...divisions], jobs, 7, !poolIds.length ? 'league_pools_unavailable' : undefined);
}

async function teamleaguePool(task, source) {
    const { event_id: id, event_key: key, pool_id: poolId } = task.args;
    const response = await source.get('teamleague/GetStandingsSectionAsync', {
        teamleagueId: id, poolid: poolId, language: 'en',
    });
    const published = response?.matchesSectionModel?.areDrawsPublished;
    const jobs = [];
    const records = [record('division', key + ':' + poolId, { id: poolId }, key)];
    if (published) {
        for (const round of rows(response.matchesSectionModel.rounds)) {
            for (const fixture of rows(round.matches)) {
                const matchId = numericId(fixture.matchId);
                if (!matchId || !fixture.showResults) continue;
                jobs.push(job('teamleague_matches', key + ':' + matchId, {
                    event_id: id, event_key: key, match_id: matchId,
                }));
            }
        }
        for (const entry of rows(response.standings?.scoresViewModels)) {
            const team = numericId(entry.participantId);
            if (!team) continue;
            records.push(record('standing', key + ':' + poolId + ':' + team, {
                class_id: poolId, team_id: team, team_name: label(entry.participantName), placing: entry.standing,
                wins: entry.wins, losses: entry.losses, draws: entry.draws,
            }, key));
        }
    }

    const teams = rows(await source.get('teamleague/GetPoolTeamsAsync', { poolid: poolId, language: 'en' }));
    for (const team of teams) {
        const teamId = numericId(team.Id);
        if (!teamId) continue;
        const sides = rows(team.Players).map(side => publicPlayer(undefined, side.Name, side.Url));
        records.push(record('entry', key + ':' + poolId + ':team:' + teamId, {
            class_id: poolId, team_id: teamId, team_name: label(team.Name), players: sides, player_ids: playerIds(sides),
        }, key));
    }
    return done(records, jobs, 7);
}

async function teamleagueMatches(task, source) {
    const data = await source.get('teamleague/GetTeamLeagueTeamsMatchesAsync', { teamMatchId: task.args.match_id, language: 'en' });
    return done(playedFixtures(sections(capitalizeKeys(data)), task.args.event_key), [], 7);
}

function clubPlayer(side) {
    return publicPlayer(side?.RankedinId ?? side?.PlayerRankedinId, side?.Name ?? side?.ParticipantName,
        side?.PlayerUrl ?? side?.ParticipantUrl ?? side?.Url, side?.PlayerId);
}

async function clubRoster(id, key, source) {
    const response = await source.get('clubleague/GetClubleaguePlayersAsync', { id, language: 'en' });
    const entries = rows(response?.Participants);
    const records = [];
    for (const { Participant: p } of entries) {
        const players = [p?.FirstPlayer, p?.SecondPlayer].filter(Boolean);
        const ids = players.map(p => numericId(p.ParticipantId) ?? clubPlayer(p).id).filter(Boolean).sort();
        if (!ids.length) continue;
        const sides = players.map(clubPlayer);
        records.push(record('entry', key + ':' + ids.join(':'), { players: sides, player_ids: playerIds(sides) }, key));
    }
    return done(records, [], 7, records.length !== entries.length ? 'league_roster_id_unavailable' : undefined);
}

function poolMatches(pool, eventKey, poolId) {
    const grid = rows(pool.Pool);
    const columnPlayers = rows(grid[0] ?? []);
    const records = [];
    for (const row of grid) {
        const cells = rows(row);
        const rowPlayers = cells[0]?.ParticipantCell?.Players ?? [];
        cells.forEach((cell, index) => {
            const match = cell.MatchCell;
            if (!match?.IsPublished || !match.ShowResult || !match.MatchResults?.IsPlayed) return;
            const id = numericId(match.ChallengeId);
            const matchId = numericId(match.MatchId);
            if (!id && !matchId) return;
            const sides = [...rowPlayers, ...(columnPlayers[index]?.ParticipantCell?.Players ?? [])].map(clubPlayer);
            const score = normalizeRankedinMatchScore(match.MatchResults.Score);
            records.push(record('match', id ? 'challenge:' + id : 'player-match:' + matchId, {
                challenge_id: id, match_id: matchId, class_id: poolId, player_ids: playerIds(sides), players: sides,
                date: label(match.Date), court: label(match.Court),
                score: score.Score.length ? score : undefined,
                score_quality: score.Score.length ? (score.IsSummary ? 1 : 2) : undefined,
            }, eventKey));
        });
    }
    return records;
}

async function clubPools(task, id, key, source) {
    const take = 5;
    const response = await source.get('clubleague/GetClubLeaguePoolsPagedAsync', {
        clubleagueid: id, language: 'en', ...pageParameters(task, take),
    });
    const pools = rows(response);
    const records = [];
    const ids = [];
    for (const pool of pools) {
        const poolId = numericId(pool.PoolId);
        if (!poolId) continue;
        ids.push(poolId);
        records.push(record('division', key + ':' + poolId, { id: poolId, name: label(pool.Name) }, key));
        records.push(...poolMatches(pool, key, poolId));
        for (const standing of rows(pool.Standings ?? [])) {
            const id = numericId(standing.ParticipantId);
            if (!id) continue;
            const sides = [standing.DoublesPlayer1Model, standing.DoublesPlayer2Model].filter(Boolean).map(clubPlayer);
            if (!sides.length) sides.push(clubPlayer(standing));
            records.push(record('standing', key + ':' + poolId + ':' + id, {
                class_id: poolId, placing: standing.Standing, players: sides, player_ids: playerIds(sides),
                wins: standing.Wins, losses: standing.Losses, draws: standing.Draws,
            }, key));
        }
    }
    const issue = ids.length !== pools.length ? 'league_pool_id_unavailable'
        : !pools.length && !task.cursor?.skip ? 'league_pools_unavailable' : undefined;
    return pageResult(task, {}, pools, ids, done(records, [], 7, issue), take);
}

async function clubStandings(id, key, source) {
    const response = await source.get('clubleague/GetClubLeagueRankingWithPlayersAsync', { ClubLeagueId: id, RankingId: 0 });
    const standings = rows(response?.Results);
    const records = [];
    for (const standing of standings) {
        const players = rows(standing.Players);
        const ids = players.map(p => numericId(p.ParticipantId) ?? clubPlayer(p).id).filter(Boolean).sort();
        if (!ids.length) continue;
        const sides = players.map(clubPlayer);
        records.push(record('standing', key + ':overall:' + ids.join(':'), {
            placing: standing.CurrentRoundStanding, points: standing.Points,
            players: sides, player_ids: playerIds(sides),
        }, key));
    }
    return done(records, [], 7, !records.length ? 'league_standings_unavailable' : undefined);
}

async function clubleague(task, source) {
    const { event_id: id, event_key: key, feed } = task.args;
    if (feed === 'roster') return clubRoster(id, key, source);
    if (feed === 'pools') return clubPools(task, id, key, source);
    if (feed === 'standings') return clubStandings(id, key, source);
    const jobs = ['roster','pools','standings'].map(feed =>
        job('clubleague', id + ':' + feed, { event_id: id, event_key: key, feed }));
    return done([record('event', key, { id, event_type: 'clubleague' }, key)], jobs, 30);
}

export const leagueTasks = {
    teamleague, teamleague_pool: teamleaguePool, teamleague_matches: teamleagueMatches, clubleague,
};
