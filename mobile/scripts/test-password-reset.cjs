const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

// Execute the screen's real request handler with isolated effects; never send email.
function handler(send, valid = true) {
  const file = ts.createSourceFile('sign-in.tsx', fs.readFileSync('src/app/(auth)/sign-in.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === 'resetPassword') node = n; ts.forEachChild(n, visit); }
  visit(file);
  assert.ok(node);
  const calls = [];
  const context = {
    resetLock: { current: false }, busy: null, emailValid: valid, email: 'preview@example.com',
    emailRef: { current: { focus: () => calls.push(['focus']) } },
    sendPasswordReset: send, friendlyError: e => e.message,
    ...Object.fromEntries(['setError', 'setNotice', 'setEmailTouched', 'setResetting', 'flash'].map(name => [name, (...args) => calls.push([name, ...args])])),
  };
  vm.createContext(context);
  vm.runInContext(ts.transpile(node.getText(file)), context);
  return { run: context.resetPassword, calls, context };
}

test('reset rejects invalid email before sending', async () => {
  const h = handler(() => { throw new Error('Must not send'); }, false);
  await h.run();
  assert.ok(h.calls.some(([name]) => name === 'focus'));
  assert.ok(!h.calls.some(([name, , kind]) => name === 'flash' && kind === 'success'));
});
test('reset waits for success and prevents duplicate requests', async () => {
  let resolve, count = 0;
  const h = handler(() => { count++; return new Promise(r => { resolve = r; }); });
  const first = h.run();
  await h.run();
  assert.equal(count, 1);
  assert.ok(!h.calls.some(([name, , kind]) => name === 'flash' && kind === 'success'));
  resolve(); await first;
  assert.ok(h.calls.some(([name, , kind]) => name === 'flash' && kind === 'success'));
  assert.equal(h.context.resetLock.current, false);
});
test('reset failure shows error and allows retry', async () => {
  let count = 0;
  const h = handler(async () => { count++; throw new Error('Network unavailable'); });
  await h.run(); await h.run();
  assert.equal(count, 2);
  assert.ok(h.calls.some(([name, message]) => name === 'setError' && message === 'Network unavailable'));
  assert.ok(!h.calls.some(([name, , kind]) => name === 'flash' && kind === 'success'));
});

function recovery(update, overrides = {}) {
  const file = ts.createSourceFile('reset-password.tsx', fs.readFileSync('src/app/reset-password.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === 'save') node = n; ts.forEachChild(n, visit); }
  visit(file);
  const calls = [];
  const context = { ready: true, lock: { current: false }, password: 'Example9@', confirm: 'Example9@',
    supabase: { auth: { updateUser: update } },
    ...Object.fromEntries(['setSaving', 'setError', 'setDone', 'setPassword', 'setConfirm'].map(name => [name, (...args) => calls.push([name, ...args])])), ...overrides };
  vm.createContext(context); vm.runInContext(ts.transpile(node.getText(file)), context);
  return { run: context.save, calls };
}
test('password cannot change before reset link verification or with mismatched confirmation', async () => {
  let count = 0;
  const update = async () => { count++; return {}; };
  await recovery(update, { ready: false }).run();
  await recovery(update, { confirm: 'different' }).run();
  assert.equal(count, 0);
});
test('recovery only shows completion after a successful password update', async () => {
  const h = recovery(async () => ({ error: null }));
  await h.run();
  assert.ok(h.calls.some(([name, value]) => name === 'setDone' && value === true));
  assert.ok(h.calls.some(([name, value]) => name === 'setPassword' && value === ''));
});
test('rejected password update stays on the form with an error', async () => {
  const h = recovery(async () => ({ error: new Error('Weak password') }));
  await h.run();
  assert.ok(h.calls.some(([name, value]) => name === 'setError' && value));
  assert.ok(!h.calls.some(([name]) => name === 'setDone'));
});
