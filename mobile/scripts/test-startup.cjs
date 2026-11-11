const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function deadline() {
  const timers = new Map(); let next = 0;
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/startup.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: mod, exports: mod.exports,
    setTimeout: callback => { timers.set(++next, callback); return next; },
    clearTimeout: id => timers.delete(id),
  });
  return { ...mod.exports, timers };
}

test('a stalled startup settles as an error instead of an endless splash', async () => {
  const h = deadline(), task = h.withStartupDeadline(new Promise(() => {}));
  const result = assert.rejects(task, /Startup timed out/);
  [...h.timers.values()][0]();
  await result;
});

test('successful session restoration keeps its result and cancels the deadline', async () => {
  const h = deadline(), session = { user: { id: 'test-user' } };
  assert.equal(await h.withStartupDeadline(Promise.resolve(session)), session);
  assert.equal(h.timers.size, 0);
});

test('a storage error surfaces immediately and cancels the deadline', async () => {
  const h = deadline();
  await assert.rejects(h.withStartupDeadline(Promise.reject(new Error('Storage unavailable'))), /Storage unavailable/);
  assert.equal(h.timers.size, 0);
});

test('a timed-out restoration cannot later replace the retry screen with success', async () => {
  const h = deadline(); let finish;
  const task = h.withStartupDeadline(new Promise(resolve => { finish = resolve; }));
  const result = assert.rejects(task, /Startup timed out/);
  [...h.timers.values()][0]();
  await result;
  finish('late session');
  await assert.rejects(task, /Startup timed out/);
});

// Exercise the root layout's actual startup effect, including its retry/error wiring.
function boot(sessionTask, seen = true) {
  const file = ts.createSourceFile('layout.tsx', fs.readFileSync('src/app/_layout.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' && node.arguments[0]?.getText(file).includes('supabase.auth.getSession()')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(effect);
  const h = deadline(), calls = [], mod = { exports: {} };
  const context = {
    module: mod, exports: mod.exports, ...h, __DEV__: false,
    hasSeenOnboarding: async () => seen,
    migrateLegacyDrafts: () => Promise.reject(new Error('Legacy draft unavailable')),
    supabase: { auth: { getSession: () => sessionTask, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
    setCompanionAccount: async () => {},
    setAnalyticsUser: async () => {},
    seenRef: { current: false }, sessionRef: { current: null }, settled: { current: false }, recoveryRoute: { current: false },
    Observe: { reportError: error => calls.push(['error', error.message]) },
    router: { replace: path => calls.push(['navigate', path]) },
    watchPushRegistration: () => ({ remove() {} }), addNotificationResponseListener: () => ({ remove() {} }),
    ...Object.fromEntries(['setDataReady', 'setBootError', 'setPendingPushPath'].map(name => [name, value => calls.push([name, value])])),
  };
  vm.runInNewContext(ts.transpile('module.exports = (' + effect.getText(file) + ');'), context);
  return { ...h, calls, start: mod.exports };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

function initialPath(dev, replay) {
  const file = ts.createSourceFile('layout.tsx', fs.readFileSync('src/app/_layout.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let resolver;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'resolvePath') resolver = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(resolver);
  const mod = { exports: {} }, calls = [];
  vm.runInNewContext(ts.transpile('module.exports = (' + resolver.getText(file) + ');'), {
    module: mod, exports: mod.exports, __DEV__: dev, process: { env: { EXPO_PUBLIC_REPLAY_ONBOARDING: replay } },
    withStartupDeadline: value => value,
    destinationAfterAuth: session => { calls.push(session); return '/(tabs)'; },
  });
  return { resolve: mod.exports, calls };
}
test('normal dev reload restores a saved session through the account eligibility gate', async () => {
  const app = initialPath(true), session = { user: { id: 'a' } };
  assert.equal(await app.resolve(true, session), '/(tabs)'); assert.equal(app.calls[0], session);
});
test('onboarding replay requires the dev-only opt-in; release ignores that flag', async () => {
  assert.equal(await initialPath(true, '1').resolve(true, {}), '/(auth)/onboarding');
  assert.equal(await initialPath(false, '1').resolve(true, {}), '/(tabs)');
});
test('session restoration preserves first-install onboarding and unsigned users still sign in', async () => {
  const app = initialPath(true);
  assert.equal(await app.resolve(false, null), '/(auth)/onboarding');
  assert.equal(await app.resolve(true, null), '/(auth)/sign-in'); assert.equal(app.calls.length, 0);
});

test('the root shows retry when session restoration never completes', async () => {
  const h = boot(new Promise(() => {}));
  h.start(); await flush(); [...h.timers.values()][0](); await flush();
  assert.ok(h.calls.some(([name, value]) => name === 'setBootError' && value === true));
  assert.ok(!h.calls.some(([name]) => name === 'setDataReady'));
});

test('a fresh install opens onboarding without waiting for saved-session restoration', async () => {
  const h = boot(new Promise(() => {}), false);
  h.start(); await flush();
  assert.ok(h.calls.some(([name, value]) => name === 'setDataReady' && value === true));
  assert.ok(!h.calls.some(([name]) => name === 'setBootError'));
  assert.equal(h.timers.size, 0);
});

test('the root can open even when unrelated legacy draft migration would fail', async () => {
  const h = boot(Promise.resolve({ data: { session: null }, error: null }));
  h.start(); await flush();
  assert.ok(h.calls.some(([name, value]) => name === 'setDataReady' && value === true));
  assert.ok(!h.calls.some(([name]) => name === 'setBootError'));
});

test('a cancelled startup attempt cannot change the next attempt or navigate later', async () => {
  let finish;
  const h = boot(new Promise(resolve => { finish = resolve; }));
  const stop = h.start(); stop();
  finish({ data: { session: null }, error: null }); await flush();
  assert.deepEqual(h.calls, []);
});
