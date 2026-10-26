const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup(state = 'active') {
  const timers = new Map(), listeners = new Set(); let id = 0;
  const AppState = { currentState: state, addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/foreground-task.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, require: () => ({ AppState }), setInterval: fn => { timers.set(++id, fn); return id; }, clearInterval: key => timers.delete(key) });
  return { ...mod.exports, timers, listeners, change(value) { AppState.currentState = value; [...listeners].forEach(fn => fn(value)); }, tick() { [...timers.values()].forEach(fn => fn()); } };
}
test('backgrounding removes timers and foregrounding refreshes once; disposal removes listeners', async () => {
  const h = setup(); let calls = 0;
  const stop = h.startForegroundTask(() => { calls++; }, 60000);
  await flush(); assert.equal(calls, 1); assert.equal(h.timers.size, 1);
  h.change('background'); h.tick(); await flush(); assert.equal(calls, 1); assert.equal(h.timers.size, 0);
  h.change('active'); await flush(); assert.equal(calls, 2); assert.equal(h.timers.size, 1);
  stop(); h.change('active'); h.tick(); await flush(); assert.equal(calls, 2); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
});
test('slow requests cannot overlap, and a rejected request can be retried', async () => {
  const h = setup(); let calls = 0, release;
  const stop = h.startForegroundTask(() => { calls++; return calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.reject(new Error('offline')); }, 1000);
  await flush(); h.tick(); h.tick(); await flush(); assert.equal(calls, 1);
  release(); await flush(); h.tick(); await flush(); assert.equal(calls, 2);
  h.tick(); await flush(); assert.equal(calls, 3); stop();
});
test('tasks queued immediately before suspension or disposal do not begin', async () => {
  for (const dispose of [false, true]) {
    const h = setup(); let calls = 0; const stop = h.startForegroundTask(() => { calls++; }, 1000);
    if (dispose) stop(); else h.change('inactive');
    await flush(); assert.equal(calls, 0); assert.equal(h.timers.size, 0); stop();
  }
});
test('auth refresh stops when inactive and has no leaked visibility listener', async () => {
  const h = setup('background'), calls = [];
  const stop = h.watchAuthRefresh({ startAutoRefresh: async () => calls.push('start'), stopAutoRefresh: async () => calls.push('stop') });
  h.change('active'); h.change('inactive'); stop(); h.change('active');
  assert.deepEqual(calls, ['stop', 'start', 'stop', 'stop']); assert.equal(h.listeners.size, 0);
});
test('multiple countdowns share one timer and the final unsubscribe releases it', async () => {
  const h = setup(); let a = 0, b = 0;
  const stopA = h.subscribeForegroundClock(() => a++, 1000), stopB = h.subscribeForegroundClock(() => b++, 1000);
  await flush(); assert.equal(h.timers.size, 1);
  h.tick(); await flush(); assert.ok(a >= 2 && b >= 2);
  stopA(); assert.equal(h.timers.size, 1); stopB(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});
