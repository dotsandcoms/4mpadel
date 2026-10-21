const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function events(request) {
  const timers = new Map(); let next = 0, initial, effect;
  const chain = {};
  for (const name of ['select', 'or', 'neq', 'order', 'limit']) chain[name] = () => chain;
  chain.abortSignal = signal => request(signal);
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/onboarding-events.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: mod, exports: mod.exports, AbortController,
    setTimeout: callback => { timers.set(++next, callback); return next; },
    clearTimeout: id => timers.delete(id),
    require: name => name === 'react' ? {
      useState: value => { initial = value; return [value, () => {}]; },
      useEffect: fn => { effect = fn; },
    } : { isSupabaseConfigured: () => true, supabase: { from: () => chain } },
  });
  return { ...mod.exports, timers, initial: () => initial, effect: () => effect() };
}

test('the first render shows complete example cards before any network response', () => {
  const h = events(() => new Promise(() => {}));
  const preview = h.useOnboardingEvents();
  assert.equal(preview.loading, false);
  assert.equal(preview.events.length, 2);
  assert.ok(preview.events.every(card => card.place && card.date && card.location));
});

test('an offline or stalled event request aborts and retains useful example cards', async () => {
  let signal;
  const h = events(value => { signal = value; return new Promise(resolve => value.addEventListener('abort', () => resolve({ error: new Error('Offline') }))); });
  const pending = h.fetchOnboardingEvents();
  [...h.timers.values()][0]();
  const cards = await pending;
  assert.equal(signal.aborted, true);
  assert.equal(cards.length, 2);
  assert.equal(h.timers.size, 0);
});

test('a successful public event response replaces examples and clears the timeout', async () => {
  const h = events(async () => ({ data: [{ id: 8, event_name: 'Test tournament', start_date: '2099-10-22', end_date: '2099-10-25', venue: 'Test court', city: 'Cape Town', is_spotlight: true }] }));
  const cards = await h.fetchOnboardingEvents();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].place, 'Test tournament');
  assert.equal(h.timers.size, 0);
});
