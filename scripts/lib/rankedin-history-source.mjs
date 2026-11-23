import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export const DAY = 86400;

export class SourceIssue extends Error {
    constructor(code, { retryAfter, permanent = false } = {}) {
        super(code);
        this.code = code;
        this.retryAfter = retryAfter;
        this.permanent = permanent;
    }
}

export function numericId(value) {
    const id = String(value ?? '');
    return /^[1-9][0-9]*$/.test(id) ? id : undefined;
}

export function playerId(value) {
    const id = String(value ?? '').toUpperCase();
    return /^R[0-9]{9}$/.test(id) ? id : undefined;
}

export function label(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function rows(value) {
    if (!Array.isArray(value)) throw new SourceIssue('malformed_source');
    return value;
}

export function fingerprint(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function createRankedinSource({ fetchImpl = fetch, deadline, interval = 1000 } = {}) {
    let nextRequest = 0;
    let anonymousToken;
    async function get(route, parameters, headers = {}) {
        if (deadline && deadline - Date.now() < 18000) throw new SourceIssue('batch_deadline');
        if (nextRequest > Date.now()) await sleep(nextRequest - Date.now());
        nextRequest = Date.now() + interval;
        const url = new URL('https://api.rankedin.com/v1/' + route);
        for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
        let response;
        try {
            response = await fetchImpl(url, {
                headers: { Accept: 'application/json', ...headers },
                signal: AbortSignal.timeout(15000)
            });
        } catch {
            throw new SourceIssue('source_network');
        }
        if (response.status === 429) {
            const value = response.headers.get('retry-after');
            const parsed = /^\d+$/.test(value ?? '') ? Number(value) : (Date.parse(value) - Date.now()) / 1000;
            throw new SourceIssue('rate_limited', { retryAfter: Number.isFinite(parsed) ? Math.max(60, Math.ceil(parsed)) : 900 });
        }
        if ([401, 403, 404, 410].includes(response.status)) throw new SourceIssue('source_unavailable', { permanent: true });
        if (!response.ok) throw new SourceIssue('source_http_' + response.status);
        try {
            return await response.json();
        } catch {
            throw new SourceIssue('malformed_source');
        }
    }

    return {
        get,
        async playerMatches(parameters) {
            if (anonymousToken === undefined) {
                const layout = await get('player/getlayoutinfoasync', { language: 'en' });
                anonymousToken = layout?.AnonymousToken || null;
            }
            return get('player/GetPlayerMatchesAsync', parameters,
                anonymousToken ? { 'x-anonymous-token': anonymousToken } : {});
        },
    };
}

export function job(kind, key, args) {
    return { key: kind + ':' + key, kind, args };
}

export function record(kind, key, data, eventKey) {
    return { kind, key, data, event_key: eventKey };
}

export function done(records = [], jobs = [], days = 7, issue) {
    return { state: issue ? 'gap' : 'done', nextSeconds: days * DAY, records, jobs, issue };
}

export const TIME_PAGE = { skip: 0, take: 100 };

export function pageParameters(task, take = TIME_PAGE.take) {
    return { skip: task.cursor?.skip ?? TIME_PAGE.skip, take };
}

export function pageResult(task, envelope, items, keys, result, take = TIME_PAGE.take) {
    const { skip } = pageParameters(task, take);
    const total = envelope.TotalCount ?? envelope.totalCount;
    const hasMore = envelope.HasMore ?? envelope.hasMore
        ?? (Number.isInteger(total) ? skip + items.length < total : items.length >= take);
    const stamp = fingerprint([...keys].sort());
    if (items.length && task.cursor?.fingerprint === stamp) throw new SourceIssue('repeated_source_page');
    if (!hasMore) return result;
    if (!items.length || !keys.length) throw new SourceIssue('incomplete_source_page');
    return {
        ...result,
        state: 'page',
        nextSeconds: 0,
        cursor: { skip: skip + items.length, fingerprint: stamp },
    };
}

export function eventReference(url, id, fallback) {
    const match = label(url)?.match(/\/(tournament|teamleague|clubleague)\/([1-9][0-9]*)(?=\/|[?#]|$)/i);
    const kind = match?.[1].toLowerCase() ?? fallback;
    const eventId = match?.[2] ?? numericId(id);
    return kind && eventId ? { kind, id: eventId, key: kind + ':' + eventId } : undefined;
}
