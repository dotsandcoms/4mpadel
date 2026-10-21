import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import { licenseStartDate } from '../src/utils/licenseDates.js';

const mobile = { exports: {} };
vm.runInNewContext(transformSync(readFileSync(new URL('../mobile/src/lib/license-dates.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: mobile, exports: mobile.exports });
const imported = { license_type: 'full', season_year: 2026, starts_on: '2026-01-01', source: 'payment', purchased_on: '2026-04-16' };

for (const [client, startDate] of [['website', licenseStartDate], ['mobile', mobile.exports.licenseStartDate]]) {
  test(`${client}: an imported 2026 Full license starts on its known purchase date`, () => {
    assert.equal(startDate(imported), '2026-04-16');
    assert.equal(startDate({ ...imported, source: 'legacy' }), '2026-04-16');
    assert.equal(startDate({ ...imported, status: 'revoked' }), '2026-04-16');
  });
  test(`${client}: missing purchase evidence retains the January fallback`, () => {
    assert.equal(startDate({ ...imported, purchased_on: null }), '2026-01-01');
    assert.equal(startDate({ ...imported, purchased_on: undefined }), '2026-01-01');
    assert.equal(startDate({ ...imported, purchased_on: null, starts_on: null }), '2026-01-01');
  });
  test(`${client}: other years, temporary coverage and explicit starts are preserved`, () => {
    assert.equal(startDate({ ...imported, license_type: 'temporary', starts_on: '2026-11-03' }), '2026-11-03');
    assert.equal(startDate({ ...imported, season_year: 2027, starts_on: '2026-10-15', purchased_on: '2026-10-20' }), '2026-10-15');
    assert.equal(startDate({ ...imported, starts_on: '2026-05-01' }), '2026-05-01');
    assert.equal(startDate({ ...imported, source: 'complimentary' }), '2026-01-01');
  });
  test(`${client}: purchase evidence outside the license year never shifts coverage outside 2026`, () => {
    assert.equal(startDate({ ...imported, purchased_on: '2025-12-20' }), '2026-01-01');
    assert.equal(startDate({ ...imported, purchased_on: '2027-01-01' }), '2026-01-01');
  });
}
