import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the actual helper without mounting React or contacting external services.
const source = readFileSync(new URL('../src/hooks/useRankedin.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('const fetchWithCache ='), source.indexOf('export const useRankedin ='));
const rankingUrl = 'https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=15809';
const populated = { Payload: [{ Name: 'Player', Standing: 1 }] };
const empty = { Payload: [], TotalCount: 0 };

function harness(cached, live, age = 0) {
    let fetches = 0;
    const writes = [];
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        supabase: {
            from() {
                return {
                    select() { return this; },
                    eq() { return this; },
                    async maybeSingle() {
                        return { data: cached ? { payload: cached, updated_at: new Date(Date.now() - age).toISOString() } : null };
                    },
                    async upsert(row) { writes.push(row); return {}; },
                };
            },
        },
        async fetchWithTimeout() {
            fetches++;
            return { ok: true, async json() { return live; } };
        },
    });
    const fetch = vm.runInContext(`${helper}\nfetchWithCache`, context);
    return { fetch, writes, get fetches() { return fetches; } };
}

test('empty fresh leaderboard cache is replaced with live rankings', async () => {
    const h = harness(empty, populated);
    assert.equal(await h.fetch(rankingUrl), populated);
    assert.equal(h.fetches, 1);
    assert.equal(h.writes.length, 1);
});
test('populated fresh leaderboard is served without a live request', async () => {
    const h = harness(populated, empty);
    assert.equal(await h.fetch(rankingUrl), populated);
    assert.equal(h.fetches, 0);
});
test('empty live leaderboard preserves and serves populated stale cache', async () => {
    const h = harness(populated, empty, 7 * 3600000);
    assert.equal(await h.fetch(rankingUrl), populated);
    assert.equal(h.writes.length, 0);
});
test('empty or malformed rankings cannot be cached or used as fallback', async () => {
    for (const payload of [empty, {}, null]) {
        const h = harness(payload, payload);
        await assert.rejects(h.fetch(rankingUrl), /temporarily unavailable/);
        assert.equal(h.writes.length, 0);
    }
});
test('empty responses for other endpoints remain valid', async () => {
    const h = harness(null, empty);
    assert.equal(await h.fetch('https://api.rankedin.com/v1/player/matches'), empty);
    assert.equal(h.writes.length, 1);
});

test('leaderboards refresh after five minutes even with the default six-hour cache', async () => {
    const newer = { Payload: [{ Name: 'Player', Standing: 2 }] };
    const h = harness(populated, newer, 5 * 60000 + 1);
    assert.equal(await h.fetch(rankingUrl), newer);
    assert.equal(h.fetches, 1);
    assert.equal(h.writes.length, 1);
});
test('leaderboards younger than five minutes stay cached', async () => {
    const h = harness(populated, empty, 4 * 60000);
    assert.equal(await h.fetch(rankingUrl), populated);
    assert.equal(h.fetches, 0);
});
test('other endpoints retain their six-hour cache', async () => {
    const h = harness(populated, empty, 10 * 60000);
    assert.equal(await h.fetch('https://api.rankedin.com/v1/player/matches'), populated);
    assert.equal(h.fetches, 0);
});
