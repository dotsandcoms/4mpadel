import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const load = (path, require) => {
  const module = { exports: {} };
  const { code } = transformSync(read(path), { loader: 'tsx', format: 'cjs' });
  vm.runInNewContext(code, { module, exports: module.exports, require, URL });
  return module.exports;
};

test('published share URLs route to their native screens on warm open and survive a cold start', () => {
  const links = load('mobile/src/lib/shared-links.ts');
  const { redirectSystemPath } = load('mobile/src/app/+native-intent.tsx', () => links);
  const playerShare = 'https://4mpadel.co.za/players?id=491';
  assert.equal(redirectSystemPath({ path: playerShare, initial: false }), '/players/491');
  assert.equal(links.consumeSharedLink(), null);
  assert.equal(redirectSystemPath({ path: playerShare, initial: true }), '/');
  assert.equal(links.consumeSharedLink(), '/players/491');
  assert.equal(links.consumeSharedLink(), null);

  for (const [path, destination] of [
    ['/players', '/rankings?view=Discover'],
    ['/players?id=garbage', '/rankings?view=Discover'],
    ['/rankings', '/rankings?view=Rankings'],
    ['/calendar/rockets-cup', '/events/rockets-cup'],
    ['/clubs/rocket-ballito', '/clubs/rocket-ballito'],
    ['/pro/results?event=123', '/pro/tournament/123?tab=matches'],
  ]) {
    assert.equal(links.sharedLinkDestination(`https://4mpadel.co.za${path}`), destination);
  }

  for (const path of ['https://other.example/players?id=491', 'https://4mpadel.co.za/events/pay-balance?registrationId=1', 'fourmpadel://reset-password', 'https://4mpadel.co.za/calendar/%2Fadmin', 'invalid link']) {
    assert.equal(redirectSystemPath({ path, initial: true }), path);
    assert.equal(links.consumeSharedLink(), null);
  }
});

test('the web association files match the native app identifiers and verified URL paths', () => {
  const { expo } = readJson('mobile/app.json');
  const [{ appIDs, components }] = readJson('public/.well-known/apple-app-site-association').applinks.details;
  const [android] = readJson('public/.well-known/assetlinks.json');
  const [filter] = expo.android.intentFilters;
  assert.deepEqual(appIDs, [`${expo.ios.appleTeamId}.${expo.ios.bundleIdentifier}`]);
  assert.equal(android.target.package_name, expo.android.package);
  assert.match(android.target.sha256_cert_fingerprints[0], /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.deepEqual(android.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(filter.autoVerify, true);
  assert.deepEqual(filter.data.map(({ path, pathPrefix }) => path ?? `${pathPrefix}*`), components.map((entry) => entry['/']));
  for (const { host, scheme } of filter.data) {
    assert.equal(scheme, 'https');
    assert.ok(expo.ios.associatedDomains.includes(`applinks:${host}`));
  }

  const { rewrites } = readJson('vercel.json');
  for (const path of ['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json']) {
    assert.deepEqual(rewrites.slice(0, 2).find((entry) => entry.source === path), { source: path, destination: path });
  }
});
