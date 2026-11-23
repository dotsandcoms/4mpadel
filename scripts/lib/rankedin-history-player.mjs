import {
    done, eventReference, fingerprint, job, label, numericId, pageParameters, pageResult,
    playerId, record, rows, SourceIssue,
} from './rankedin-history-source.mjs';

export const publicPlayer = (id, name, url, internalId) => ({
    id: playerId(id) ?? playerId(label(url)?.match(/\/player\/(R[0-9]{9})(?:[/?#]|$)/i)?.[1]),
    name: label(name),
    internal_id: numericId(internalId),
});

export function playerIds(sides, owner) {
    return [...new Set([...sides.map(side => side.id), owner].filter(Boolean))].sort();
}

export function publicEvent(item, fallback) {
    const name = label(item.eventName ?? item.Name ?? item.name);
    const url = label(item.eventUrl ?? item.Link ?? item.link);
    const type = item.type ?? item.Type;
    const rawId = numericId(item.eventId ?? item.Id ?? item.id);
    const knownType = type === 4 ? 'tournament' : type === 3 ? 'teamleague' : type === 2 ? 'clubleague' : fallback;
    const event = eventReference(url, rawId, knownType);
    const key = event?.key ?? 'other:' + (rawId ?? fingerprint([url, name, item.StartDate]));
    return {
        event: event && { ...event, poolId: numericId(url?.match(/[?&]pool=([1-9][0-9]*)/i)?.[1]) },
        key,
        data: {
            id: event?.id ?? rawId,
            event_type: event?.kind ?? 'other',
            name,
            starts_at: label(item.startDate ?? item.StartDate),
            ends_at: label(item.endDate ?? item.EndDate),
            source_type: type,
        },
    };
}

function eventJob(event) {
    const args = { event_id: event.id, event_key: event.key };
    if (event.poolId) args.pool_id = event.poolId;
    return job(event.kind, event.id, args);
}

function collectEvents(items, owner) {
    const records = [];
    const jobs = [];
    let unresolved = false;
    for (const item of items) {
        if (!item || typeof item !== 'object') throw new SourceIssue('malformed_source');
        const e = publicEvent(item);
        if (!e.data.name || (!e.event && !e.data.id)) {
            unresolved = true;
            continue;
        }
        records.push(record('event', e.key, e.data, e.key));
        if (owner) records.push(record('participation', owner + ':' + e.key, { player_ids: [owner] }, e.key));
        if (e.event) jobs.push(eventJob(e.event));
        else unresolved = true;
    }
    return { records, jobs, issue: unresolved ? 'event_type_unavailable' : undefined };
}

async function catalogue(task, source) {
    const response = await source.get('Organization/GetOrganisationEventsAsync', {
        organisationId: 11331, IsFinished: task.args.finished, Language: 'en', ...pageParameters(task),
    });
    const items = rows(response?.payload);
    const { records, jobs, issue } = collectEvents(items);
    return pageResult(task, response, items, records.map(r => r.key), done(records, jobs, 1, issue));
}

async function player(task, source) {
    const owner = task.args.player_id;
    const response = await source.get('player/playerprofileinfoasync', { rankedinId: owner, language: 'en' });
    const id = numericId(response?.Id ?? response?.Header?.PlayerId);
    if (!id || response.IsFake || playerId(response.Header?.RankedinId) !== owner) {
        return done([], [], 7, 'profile_identity_unverified');
    }
    const args = { player_id: owner, internal_id: id };
    const jobs = ['participation', 'player_matches', 'player_rankings'].map(kind => job(kind, owner + ':' + id, args));
    const stats = response.Statistics;
    return done([record('player', owner, {
        player_ids: [owner],
        internal_id: id,
        doubles_record: label(stats?.CareerWinLossDoubles),
        singles_record: label(stats?.CareerWinLossSingles),
    })], jobs, 7);
}

async function participation(task, source) {
    const owner = task.args.player_id;
    const response = await source.get('player/ParticipatedEventsAsync', {
        playerId: task.args.internal_id, language: 'en', ...pageParameters(task),
    });
    const items = rows(response?.Payload);
    const { records, jobs, issue } = collectEvents(items, owner);
    return pageResult(task, response, items, records.filter(r => r.kind === 'participation').map(r => r.key), done(records, jobs, 7, issue));
}

function directMatch(item, owner) {
    const challengeId = numericId(item.ChallengeId);
    const matchId = numericId(item.MatchId);
    if (!challengeId && !matchId) return undefined;
    const info = item.Info;
    const sides = [info.Challenger, info.Challenger1, info.Challenged, info.Challenged1]
        .filter(Boolean).map(side => publicPlayer(side.RankedinId, side.Name, side.PlayerUrl, side.Id));
    const event = eventReference(info.EventUrl);
    const score = item.Score?.Score;
    const sets = Array.isArray(score) ? score.filter(set => Number.isFinite(set.Score1) && Number.isFinite(set.Score2))
        .map(set => ({ Score1: set.Score1, Score2: set.Score2 })) : [];
    return record('match', challengeId ? 'challenge:' + challengeId : 'player-match:' + matchId, {
        challenge_id: challengeId,
        match_id: matchId,
        player_ids: playerIds(sides, owner),
        players: sides,
        event_name: label(info.EventName),
        date: label(info.Date),
        court: label(info.Court),
        score: sets.length ? { Score: sets, IsSummary: item.Score.IsSummary === true } : undefined,
        score_quality: sets.length ? (item.Score.IsSummary === true ? 1 : 2) : undefined,
    }, event?.key);
}

async function playerMatches(task, source) {
    const owner = task.args.player_id;
    const take = 40;
    const response = await source.playerMatches({
        playerid: task.args.internal_id, takehistory: true, language: 'en', ...pageParameters(task, take),
    });
    const items = rows(response?.Payload);
    const valid = items.filter(item => label(item?.Info?.EventName) && item.Info.EventName !== 'EventName');
    if (items.length && !valid.length) return done([], [], 7, 'player_match_feed_placeholder');
    const records = valid.map(item => directMatch(item, owner)).filter(Boolean);
    const issue = records.length !== items.length ? 'player_match_id_unavailable' : undefined;
    return pageResult(task, response, items, records.map(r => r.key), done(records, [], 7, issue), take);
}

async function playerRankings(task, source) {
    const owner = task.args.player_id;
    const response = await source.get('player/PlayerRankingsAsync', {
        id: task.args.internal_id, language: 'en', ...pageParameters(task),
    });
    const envelope = response?.PlayerRankings;
    const items = rows(envelope?.Payload);
    const records = [];
    const jobs = [];
    for (const item of items) {
        const rid = numericId(item?.RankingId);
        const participantId = numericId(item?.RankingParticipantId);
        const age = numericId(item?.AgeGroup);
        const name = label(item?.RankingName);
        if (!rid || !participantId || !age || !name) continue;
        const key = owner + ':' + participantId + ':' + age;
        records.push(record('ranking', key, {
            player_ids: [owner], ranking_id: rid, participant_id: participantId, age_group: age,
            name, points: item.Points, position: item.Position,
        }));
        jobs.push(job('points', key, { player_id: owner, participant_id: participantId, age_group: age }));
    }
    if (items.length && !records.length) return done([], [], 7, 'player_ranking_feed_placeholder');
    const issue = items.length !== records.length ? 'player_ranking_identity_unavailable' : undefined;
    return pageResult(task, envelope, items, records.map(r => r.key), done(records, jobs, 7, issue));
}

async function points(task, source) {
    const { player_id: owner, participant_id: id, age_group: age } = task.args;
    const response = await source.get('ranking/getparticipantpointsdetailsasync', {
        id, agegroup: age, weekfromnow: 0, showAll: true, language: 'en', ...pageParameters(task),
    });
    const envelope = response?.ParticipantWithPoints?.EventPoints;
    const items = rows(envelope?.Payload);
    const records = items.map(item => {
        const point = item?.EventPoint;
        if (!point || typeof point !== 'object') throw new SourceIssue('malformed_source');
        const event = eventReference(item.EventUrl);
        const division = label(point.EventName?.split('| Class:')[1]);
        const key = owner + ':' + id + ':' + age + ':' + fingerprint([
            event?.key ?? item.EventUrl ?? item.EventName, division, point.Date, point.RankingEventTypeId,
        ]);
        return record('ranking_result', key, {
            player_ids: [owner], participant_id: id, age_group: age,
            event_name: label(item.EventName), division, date: label(point.Date), place: point.Standing,
            points: point.Points, counted: point.IsInCalculation, source_event_type: point.EventType,
        }, event?.key);
    });
    return pageResult(task, envelope, items, records.map(r => r.key), done(records, [], 7));
}

export const playerTasks = {
    catalogue, player, participation, player_matches: playerMatches, player_rankings: playerRankings, points,
};
