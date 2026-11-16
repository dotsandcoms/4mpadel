import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, detectedLevel, detectedMatches, detectedReliability, DEFAULT_MODEL } from '../supabase/functions/extract-playtomic-level/handler.mjs';

const screenshot = '1/00000000-0000-4000-8000-000000000001.png';
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
function fixture(options = {}) {
  const calls = [];
  const handler = createHandler({
    apiKey: options.noKey ? '' : 'test-key',
    userClient: () => ({
      auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'owner', is_anonymous: options.anonymous } }, error: null }) },
      rpc: async (name, args) => { calls.push({ name, args }); return { data: options.denied ? false : true }; },
      storage: { from: bucket => ({ download: async path => {
        calls.push({ download: path, bucket });
        return { data: options.missing ? null : options.image ?? new Blob([png], { type: 'image/png' }) };
      } }) },
    }),
    adminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'get_playtomic_profile_proof_id' ? '00000000-0000-4000-8000-000000000099' : !options.limited, error: name === 'consume_playtomic_extraction' ? options.quotaError : name === 'record_playtomic_profile_extraction' ? options.saveError : null }; } }),
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), signal: init.signal });
      if (options.throw) throw new Error('provider details must not leak');
      return new Response(JSON.stringify(options.response ?? { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ level_text: options.raw === undefined ? '5,17' : options.raw, matches_text: options.matches ?? null, reliability_percent_text: options.reliability ?? null }) }] }] }), { status: options.httpStatus ?? 200 });
    },
  });
  const request = async (path = screenshot, authorization = 'Bearer user-token') => {
    const response = await handler(new Request('https://example.test/extract', { method: 'POST', headers: authorization ? { Authorization: authorization } : {}, body: JSON.stringify({ proof_path: path }) }));
    return { status: response.status, body: await response.json() };
  };
  return { handler, calls, request };
}

test('normalizes the example’s decimal comma and accepts only a bounded level numeral', () => {
  for (const [raw, expected] of [['5,17', 5.17], ['5.17', 5.17], ['0', 0], ['7.00', 7]]) assert.equal(detectedLevel(raw), expected);
  for (const raw of [null, 5.17, '93%', '660', '5.171', '-1', '7.01', '1e0', 'Level 5.17', '5.17 93', '']) assert.equal(detectedLevel(raw), null);
});

test('auth and ownership are checked before downloads or paid requests', async () => {
  for (const options of [{ noUser: true }, { anonymous: true }]) {
    const h = fixture(options);
    assert.equal((await h.request()).status, 401);
    assert.equal(h.calls.length, 0);
  }
  const h = fixture({ denied: true });
  assert.equal((await h.request()).status, 403);
  assert.deepEqual(h.calls.map(c => c.name), ['can_access_player_profile_proof']);
  assert.equal((await fixture().request(screenshot, '')).status, 401);
});

test('rejects arbitrary URLs, traversal, and invalid uploads', async () => {
  for (const path of ['https://example.test/a.png', '../1/a.png', '1/a.svg']) assert.equal((await fixture().request(path)).status, 400);
  for (const image of [new Blob([]), new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]), new Blob(['not an image'])]) {
    const h = fixture({ image });
    assert.equal((await h.request()).status, 400);
    assert.equal(h.calls.some(c => c.url), false);
  }
});

test('missing configuration or screenshot fails without a provider request', async () => {
  for (const [options, expected] of [[{ noKey: true }, 503], [{ missing: true }, 404]]) {
    const h = fixture(options);
    assert.equal((await h.request()).status, expected);
    assert.equal(h.calls.some(c => c.url), false);
  }
});

test('uses server quota, strict output, high-detail bytes and no response storage', async () => {
  const h = fixture();
  assert.deepEqual(await h.request(), { status: 200, body: { status: 'detected', level: 5.17, matches: null, reliability_percent: null } });
  assert.deepEqual(h.calls.find(c => c.name === 'consume_playtomic_extraction'), { name: 'consume_playtomic_extraction', args: { p_user_id: 'owner' } });
  const call = h.calls.find(call => call.url);
  assert.equal(call.url, 'https://api.openai.com/v1/responses');
  assert.equal(call.body.model, DEFAULT_MODEL);
  assert.equal(call.body.store, false);
  assert.equal(call.body.text.format.strict, true);
  assert.equal(call.body.text.format.schema.additionalProperties, false);
  assert.match(call.body.input[1].content[0].image_url, /^data:image\/png;base64,/);
  assert.equal(call.body.input[1].content[0].detail, 'high');
  assert.ok(call.signal instanceof AbortSignal);
});

test('quota exhaustion and quota failure stop before OpenAI', async () => {
  for (const [options, expected] of [[{ limited: true }, 429], [{ quotaError: { message: 'db' } }, 503]]) {
    const h = fixture(options);
    assert.equal((await h.request()).status, expected);
    assert.equal(h.calls.some(c => c.url), false);
  }
});

test('ambiguous, irrelevant, refused and incomplete outputs return no suggestion', async () => {
  for (const raw of [null, '93', '660', 'Level 5.17', '5,171', 'NaN']) assert.deepEqual((await fixture({ raw }).request()).body, { status: 'not_found', level: null, matches: null, reliability_percent: null });
  for (const response of [{ output: [] }, { status: 'incomplete', output: [] }, { output: [{ type: 'message', content: [{ type: 'refusal' }] }] }]) assert.equal((await fixture({ response }).request()).body.status, 'not_found');
});

test('provider errors and timeouts retain a manual-entry fallback and hide provider details', async () => {
  for (const options of [{ throw: true }, { httpStatus: 429 }, { httpStatus: 500 }]) {
    const result = await fixture(options).request();
    assert.ok(result.status >= 500);
    assert.match(result.body.error, /manually/);
    assert.doesNotMatch(result.body.error, /provider details/);
  }
});

test('signup paths work through the same access check; OPTIONS and methods are bounded', async () => {
  const h = fixture();
  assert.equal((await h.request('signup/00000000-0000-0000-0000-000000000003/a.png')).status, 200);
  assert.equal((await h.handler(new Request('https://example.test', { method: 'OPTIONS' }))).status, 200);
  assert.equal((await h.handler(new Request('https://example.test', { method: 'GET' }))).status, 405);
});

test('extracts and persists all three example values without confusing other profile numbers', async () => {
  const h = fixture({ matches: '660', reliability: '93%' });
  assert.deepEqual((await h.request()).body, { status: 'detected', level: 5.17, matches: 660, reliability_percent: 93 });
  assert.deepEqual(h.calls.at(-1), { name: 'record_playtomic_profile_extraction', args: { p_path: screenshot, p_level: 5.17, p_matches: 660, p_reliability_percent: 93, p_object_id:'00000000-0000-4000-8000-000000000099' } });
  const prompt = h.calls.find(c => c.url).body.input[0].content;
  assert.match(prompt, /Followers, Following, challenge/);
  assert.match(prompt, /blurred name/);
});
test('match and reliability parsers preserve zero and reject invalid or ambiguous numerals', () => {
  for (const [raw, value] of [['0',0],['660',660],['1,234',1234],['12 345',12345],['1.234',1234]]) assert.equal(detectedMatches(raw),value);
  for (const raw of [null,'-1','660.5','1k','2,81','2147483648','660 Matches','660 / 281']) assert.equal(detectedMatches(raw),null);
  for (const [raw,value] of [['0%',0],['93%',93],['100',100],['93,25%',93.25]]) assert.equal(detectedReliability(raw),value);
  for (const raw of [null,'101%','-1%','93 HIGH','93.123','NaN']) assert.equal(detectedReliability(raw),null);
});
test('partial details remain independent and persistence errors cannot pretend success', async () => {
  const h = fixture({ raw: null, matches: '0', reliability: '100' });
  assert.deepEqual((await h.request()).body, { status:'not_found', level:null, matches:0, reliability_percent:100 });
  assert.equal((await fixture({ saveError:{message:'secret'} }).request()).status,503);
  const empty=fixture({raw:null}); await empty.request(); assert.equal(empty.calls.some(c=>c.name==='record_playtomic_profile_extraction'),false);
});
