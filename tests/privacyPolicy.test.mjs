import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = process.env.PRIVACY_WEBSITE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { isPrivacyPolicyRoute, isPublicRoute, requiresAuth } = await import(pathToFileURL(path.join(root, 'src/utils/routeAccess.js')));
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const expression = app.match(/const showMembersOnly\s*=\s*([\s\S]*?);/)[1];
const visible = (pathname, { loading = false, session = null, prompted = false } = {}) => vm.runInNewContext(expression, {
  isPrivacyPolicyRoute, location: { pathname }, loading, session,
  routeRequiresAuth: requiresAuth(pathname), membersOnlyPrompt: prompted,
});

test('privacy and account-deletion URLs are public, including trailing slashes and query strings', () => {
  for (const suffix of ['', '/', '///', '?source=google-play', '#account-deletion', '/?source=google-play#account-deletion']) {
    const pathname = new URL('https://4mpadel.co.za/privacy-policy' + suffix).pathname;
    assert.equal(isPublicRoute(pathname), true, pathname);
    assert.equal(requiresAuth(pathname), false, pathname);
    for (const loading of [false, true]) {
      for (const session of [null, { user: { id: 'test' } }]) {
        for (const prompted of [false, true]) {
          assert.equal(visible(pathname, { loading, session, prompted }), false, JSON.stringify({ pathname, loading, session, prompted }));
        }
      }
    }
  }
  assert.equal(isPublicRoute('/Privacy-Policy/'), true);
});

test('the privacy exception does not open member pages or paths with a similar prefix', () => {
  for (const pathname of ['/players', '/profile', '/privacy-policy-private', '/privacy-policy/private']) {
    assert.equal(isPrivacyPolicyRoute(pathname), false);
    assert.equal(requiresAuth(pathname), true);
    assert.equal(visible(pathname), true);
    assert.equal(visible(pathname, { session: { user: { id: 'test' } } }), false);
  }
  assert.equal(visible('/contact'), false);
  assert.equal(visible('/contact', { prompted: true }), true);
});

test('the public route renders the policy with contact and external deletion instructions', () => {
  assert.match(app, /<Route path="\/privacy-policy" element=\{<PrivacyPolicy \/>\} \/>/);
  const page = fs.readFileSync(path.join(root, 'src/pages/PrivacyPolicy.jsx'), 'utf8');
  for (const content of ['Privacy Policy', '4M Padel', 'Information we collect', 'Storage, security and retention', 'id="account-deletion"', 'Request account deletion by email', 'mailto:info@4mpadel.co.za']) {
    assert.ok(page.includes(content), content);
  }
  assert.doesNotMatch(page, /MembersOnlyModal|AuthModal|supabase\.auth|useSession/);
  assert.match(fs.readFileSync(path.join(root, 'src/components/SiteFooter.jsx'), 'utf8'), /to="\/privacy-policy"/);
});
