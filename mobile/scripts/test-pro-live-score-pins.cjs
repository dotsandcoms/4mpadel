const assert = require('node:assert/strict');
const test = require('node:test');

const match = 55;
const time = Date.parse('2026-11-27T11:10:00Z');
const observed = (status, sets) => ({ id: match, status, sets });
const openSet = (game_score, point = '15-0') => ({ games: [{ game_score, points: [point] }] });

test('game and set replay ignores points and accepts a corrected game score', async () => {
  const { scoreFromFeed, hasScoreChanged } = await import('../supabase/functions/_shared/pro-live-score.mjs');
  const start = scoreFromFeed(observed('ongoing', [openSet('2-1')]), match, time);
  const point = scoreFromFeed(observed('ongoing', [openSet('2-1', '40-15')]), match, time + 1000);
  const game = scoreFromFeed(observed('live', [openSet('3-1')]), match, time + 60000);
  const correction = scoreFromFeed(observed('live', [openSet('2-1')]), match, time + 120000);
  const firstSet = scoreFromFeed(observed('live', [{ set_score: '6-3' }]), match, time + 180000);
  const final = scoreFromFeed(observed('ended', [{ set_score: '6-3' }, { set_score: '7-6' }]), match, time + 360000);
  assert.deepEqual(start.games, [2, 1]);
  assert.equal(hasScoreChanged(point, start), false);
  assert.equal(hasScoreChanged(game, point), true);
  assert.equal(hasScoreChanged(correction, game), true);
  assert.deepEqual(firstSet.sets, [[6, 3]]);
  assert.equal(firstSet.games, null);
  assert.equal(final.status, 'final');
  assert.deepEqual(final.sets, [[6, 3], [7, 6]]);
  assert.equal(hasScoreChanged(final, firstSet), true);
  assert.equal(scoreFromFeed(observed('scheduled', []), match, time), null);
  assert.equal(scoreFromFeed(observed('live', []), match + 1, time), null);
});

test('stale scores do not extend freshness and missing point feeds can end via a confirmed result', async () => {
  const { getScore } = await import('../supabase/functions/_shared/pro-live-score.mjs');
  const response = (body, headers = {}) => Response.json(body, { headers });
  assert.equal(await getScore(async () => response(observed('live', []), { 'x-4m-cache': 'stale' }), 'fixture', match, () => time), null);
  const paths = [];
  const final = await getScore(async (url) => {
    paths.push(new URL(url).pathname);
    if (url.endsWith('/live')) return new Response(null, { status: 404 });
    return response({ id: match, status: 'finished', score: [{ team_1: 6, team_2: 2 }] });
  }, 'fixture', match, () => time);
  assert.deepEqual(paths, ['/api/matches/55/live', '/api/matches/55']);
  assert.deepEqual(final.sets, [[6, 2]]);
  assert.equal(final.status, 'final');
});

test('APNs updates carry the provider stale date and leave the final result briefly visible', async () => {
  const { scoreFromFeed } = await import('../supabase/functions/_shared/pro-live-score.mjs');
  const { applePayload } = await import('../supabase/functions/_shared/pro-live-score-push.ts');
  const teams = ['Pair One', 'Pair Two'];
  const now = time / 1000;
  const score = scoreFromFeed(observed('ongoing', [openSet('2-1')]), match, time);
  const update = applePayload(score, teams, now).aps;
  assert.equal(update.event, 'update');
  assert.equal(update['stale-date'], now + 180);
  assert.deepEqual(update['content-state'].teams, teams);
  const final = applePayload({ ...score, status: 'final' }, teams, now).aps;
  assert.equal(final.event, 'end');
  assert.equal(final['dismissal-date'], now + 300);
});

test('Android sends data-only scores through the existing Expo FCM transport', async () => {
  const { scoreFromFeed } = await import('../supabase/functions/_shared/pro-live-score.mjs');
  const { sendLiveScore } = await import('../supabase/functions/_shared/pro-live-score-push.ts');
  const pin = { platform: 'android', pin: 'pin-fixture', match, token: 'ExpoPushToken[android-fixture]', teams: ['A', 'B'] };
  const score = scoreFromFeed(observed('live', [openSet('4-2')]), match, time);
  const result = await sendLiveScore(pin, score, async (endpoint, message) => {
    assert.equal(endpoint, 'send');
    assert.equal(message.to, pin.token);
    assert.equal(message.title, undefined);
    assert.equal(message.body, undefined);
    assert.equal(message.data.pin, pin.pin);
    assert.deepEqual(message.data.score.games, [4, 2]);
    assert.equal(message.ttl, 180);
    return { status: 'ok' };
  });
  assert.equal(result, 'accepted');
});
