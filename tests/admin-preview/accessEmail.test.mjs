import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccessEmail } from '../../src/pages/admin-preview/accessEmail.js';

const sample = { name: 'Sample User', modules: ['Event Manager'], superAdmin: false, eventNames: ['Sample Cup'], financeEventNames: [] };
test('email has a verified deployed route and both formats', () => {
  const email = buildAccessEmail(sample);
  assert.equal(email.loginUrl, 'https://4mpadel.co.za/admin');
  assert.match(email.text, /Sample Cup/);
  assert.match(email.html, /Sample Cup/);
  assert.doesNotMatch(email.html, /localhost|127\.0\.0\.1|admin-preview/);
});
test('profile and event values are escaped in HTML', () => {
  const email = buildAccessEmail({ ...sample, name: '<img src=x onerror=alert(1)>', eventNames: ['<script>alert(1)</script>'] });
  assert.doesNotMatch(email.html, /<img|<script>/);
  assert.match(email.html, /&lt;script&gt;/);
});
test('super admin does not imply stored event restrictions apply', () => {
  const email = buildAccessEmail({ ...sample, superAdmin: true });
  assert.match(email.text, /Account role: Super admin/);
  assert.doesNotMatch(email.text, /Sample Cup/);
});
test('no direct modules is explicit rather than inventing access', () => {
  assert.match(buildAccessEmail({ ...sample, modules: [], eventNames: [] }).text, /No direct modules assigned/);
});
