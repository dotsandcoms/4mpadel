import { createRankedinSource, DAY, job, numericId, playerId, SourceIssue } from './rankedin-history-source.mjs';
import { playerTasks } from './rankedin-history-player.mjs';
import { tournamentTasks } from './rankedin-history-event.mjs';
import { leagueTasks } from './rankedin-history-league.mjs';

const handlers = { ...playerTasks, ...tournamentTasks, ...leagueTasks };

function unique(items, key) {
    return [...new Map(items.map(item => [key(item), item])).values()];
}

export async function fetchArchivePage(task, source) {
    if (!Object.hasOwn(handlers, task.kind)) throw new Error('Unknown archive job type');
    const result = await handlers[task.kind](task, source);
    const issue = task.cursor?.issue ?? result.issue;
    const gap = issue && result.state === 'done';
    return {
        ...result,
        state: gap ? 'gap' : result.state,
        cursor: result.cursor ? { ...result.cursor, issue } : {},
        issue,
        records: unique(result.records, r => r.kind + ':' + r.key),
        jobs: unique(result.jobs, j => j.key),
    };
}

function recovery(task, error) {
    const cursor = task.cursor ?? {};
    if (!(error instanceof SourceIssue)) throw error;
    if (error.code === 'rate_limited') {
        return { state: 'retry', nextSeconds: Math.min(error.retryAfter, 7 * DAY), cursor, issue: error.code };
    }
    if (error.code === 'batch_deadline') return { state: 'page', nextSeconds: 0, cursor };
    if (error.permanent || task.attempts >= 4) return { state: 'gap', nextSeconds: 7 * DAY, issue: error.code };
    return { state: 'retry', nextSeconds: 60 * 2 ** task.attempts, cursor, issue: error.code };
}

function count(map, key, by = 1) {
    map[key] = (map[key] ?? 0) + by;
}

export function pilotTargets(input = '') {
    const values = input.split(',').map(value => value.trim()).filter(Boolean);
    if (values.length > 25) throw new Error('Choose at most 25 pilot targets.');
    return unique(values.map(value => {
        const player = playerId(value);
        if (player) return job('player', player, { player_id: player });
        const [kind, id, extra] = value.split(':');
        if (extra !== undefined || !['tournament', 'teamleague', 'clubleague'].includes(kind) || !numericId(id)) {
            throw new Error('Pilot targets must be Rankedin player IDs or event type and ID pairs.');
        }
        return job(kind, id, { event_id: id, event_key: kind + ':' + id });
    }), target => target.key);
}

export async function previewArchive(database, targets, options = {}) {
    const source = options.source ?? createRankedinSource(options);
    const queue = [...targets];
    const known = new Set(queue.map(task => task.key));
    const report = { dry_run: true, pages: 0, found: {}, issues: {} };
    while (queue.length && report.pages < 60) {
        const task = queue.shift();
        let result;
        try {
            result = await fetchArchivePage(task, source);
        } catch (error) {
            result = recovery({ ...task, attempts: 0 }, error);
        }
        report.pages++;
        for (const r of result.records ?? []) count(report.found, r.kind);
        if (result.issue) count(report.issues, result.issue);
        if (result.issue === 'rate_limited' || result.nextSeconds === 0 && !result.cursor?.skip) break;
        if (result.state === 'page') queue.push({ ...task, cursor: result.cursor });
        for (const next of result.jobs ?? []) {
            if (known.has(next.key)) continue;
            known.add(next.key);
            queue.push(next);
        }
    }
    report.unchecked_preview_jobs = queue.length;
    if (database) report.archive = await database.status();
    return report;
}

export async function syncArchive(database, { targets = [], deadline = Date.now() + 480000, source = createRankedinSource({ deadline }), maxPages = 600 } = {}) {
    const report = { links: await database.seed(targets.length === 0, targets), pages: 0, saved: {}, issues: {} };
    while (report.pages < maxPages && Date.now() < deadline - 20000) {
        const task = await database.claim();
        if (!task) break;
        let result;
        try {
            result = await fetchArchivePage(task, source);
        } catch (error) {
            result = recovery(task, error);
        }
        const saved = await database.finish(task, result);
        if (!saved) throw new Error('Archive job lease expired before the page could be saved.');
        report.pages++;
        for (const r of result.records ?? []) count(report.saved, r.kind);
        if (result.issue) count(report.issues, result.issue);
        if (result.issue === 'rate_limited' || result.nextSeconds === 0 && !result.cursor?.skip) break;
    }
    report.archive = await database.status();
    return report;
}
