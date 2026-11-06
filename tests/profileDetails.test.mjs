import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as web from '../src/utils/profileDetails.js';

const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const ts = require('typescript');
const native = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../mobile/src/lib/profile-details.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: native, exports: native.exports, require: () => ({ supabase: {} }) });

for (const [platform, rules] of [['web', web], ['native', native.exports]]) {
  test(`${platform}: age changes on the birthday and handles leap days and missing dates`, () => {
    assert.equal(rules.ageFromBirthDate('2011-11-03', '2026-11-02'), 14);
    assert.equal(rules.ageFromBirthDate('2011-11-03', '2026-11-03'), 15);
    assert.equal(rules.ageFromBirthDate('2011-11-03', '2026-11-04'), 15);
    assert.equal(rules.ageFromBirthDate('2000-02-29', '2026-02-28'), 25);
    assert.equal(rules.ageFromBirthDate('2000-02-29', '2026-03-01'), 26);
    assert.equal(rules.ageFromBirthDate('2026-11-02', '2026-11-02'), 0);
    for (const value of ['', '2027-01-01', '2001-02-29']) assert.equal(rules.ageFromBirthDate(value, '2026-11-02'), null);
  });
  test(`${platform}: birth date is mandatory and rejects future and nonexistent dates`, () => {
    for (const value of ['', '2001-02-29', '2026-04-31', '2027-01-01', '1899-12-31', '01/02/2000']) assert.ok(rules.birthDateError(value, '2026-11-02'), value);
    for (const value of ['2000-02-29', '1991-10-15', '2026-11-02']) assert.equal(rules.birthDateError(value, '2026-11-02'), null);
  });
  test(`${platform}: level is required and zero is valid without a screenshot`, () => {
    for (const level of ['0', '0.00', '3.25', '7.00']) {
      assert.equal(rules.playtomicError(level, '1/proof.jpg'), null);
      assert.equal(rules.playtomicError(level, ''), null);
    }
    for (const level of ['-1', '7.01', 'NaN', 'Infinity', '3.251', '1e0']) assert.ok(rules.playtomicError(level, '1/proof.jpg'));
    assert.ok(rules.playtomicError('', ''));
    assert.ok(rules.playtomicError('   ', ''));
    assert.ok(rules.playtomicError('', '1/proof.jpg'));
  });
}

test('proof accepts bounded images and rejects empty, oversized and active file types', () => {
  assert.equal(web.proofFileError({ type: 'image/png', size: web.MAX_PROOF_BYTES }), null);
  for (const file of [{ type: 'image/png', size: 0 }, { type: 'image/jpeg', size: web.MAX_PROOF_BYTES + 1 }, { type: 'image/svg+xml', size: 10 }, { type: 'application/pdf', size: 10 }]) assert.ok(web.proofFileError(file));
});

test('profile date follows Johannesburg across the UTC midnight boundary', () => {
  assert.equal(web.profileToday(new Date('2026-11-01T22:30:00Z')), '2026-11-02');
});

test('saving preserves zero instead of clearing it and sends only private fields', async () => {
  let sent;
  const client = { rpc: async (name, args) => { sent = { name, args }; return { data: args.p_details }; } };
  await web.saveProfileDetails(client, 42, { date_of_birth: '2000-02-29', playtomic_level: '0', playtomic_proof_path: '42/a.jpg', name: 'Ignore' });
  assert.equal(sent.name, 'save_player_profile_details_v3');
  assert.deepEqual(sent.args, { p_player_id: 42, p_details: { date_of_birth: '2000-02-29', playtomic_no_profile: false, playtomic_level: 0, playtomic_proof_path: '42/a.jpg' } });
});

test('failed reads and saves never pretend to succeed', async () => {
  const client = { rpc: async () => ({ error: { message: 'Access denied' } }) };
  await assert.rejects(web.getProfileDetails(client, 42), /could not be loaded/);
  await assert.rejects(web.saveProfileDetails(client, 42, { date_of_birth: '2000-02-29', playtomic_level: '3.25', playtomic_proof_path: '42/a.jpg' }), /Access denied/);
});

test('updated clients require a screenshot or explicit no-profile confirmation, never fake zero', async () => {
  assert.ok(web.playtomicDetailsError({playtomic_level:'0'}));
  assert.equal(web.playtomicDetailsError({playtomic_level:'0',playtomic_proof_path:'1/a.jpg'}),null);
  assert.equal(web.playtomicDetailsError({playtomic_no_profile:true}),null);
  assert.ok(native.exports.playtomicDetailsError('0','',false));
  assert.equal(native.exports.playtomicDetailsError('','',true),null);
  let payload;
  await web.saveProfileDetails({rpc:async(name,args)=>{payload=args.p_details;return {data:payload}}},1,{date_of_birth:'2000-01-01',playtomic_no_profile:true,playtomic_level:'5',playtomic_proof_path:'1/a.jpg',playtomic_matches:999});
  assert.deepEqual(payload,{date_of_birth:'2000-01-01',playtomic_no_profile:true,playtomic_level:null,playtomic_proof_path:null});
});
test('client extraction parsing accepts partial and zero values but rejects forged ranges', () => {
  assert.deepEqual(web.parsePlaytomicExtraction({status:'detected',level:5.17,matches:660,reliability_percent:93}),{level:5.17,matches:660,reliability_percent:93});
  assert.deepEqual(web.parsePlaytomicExtraction({status:'not_found',level:null,matches:0,reliability_percent:100}),{level:null,matches:0,reliability_percent:100});
  assert.equal(web.parsePlaytomicExtraction({status:'detected',level:8,matches:1.5,reliability_percent:101}),null);
});
