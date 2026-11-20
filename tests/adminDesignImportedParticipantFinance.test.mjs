import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImportedParticipantWorkbook } from '../src/pages/admin-preview/importedParticipantWorkbook.js';
import { filterEventParticipants, publicParticipantTournament } from '../src/pages/admin-preview/eventParticipants.js';
import { importedParticipantSettlement, prepareImportedParticipantExport, verifiedImportedParticipantPayments, loadImportedFinance } from '../src/pages/admin-preview/importedParticipantFinance.js';

const event = { id: 11, event_name: 'Imported Champs', entry_fee: 600, is_manual: false, organisation_id: 'north', rankedin_id: '2001' };
const user = { id: 'user', email: 'owner@example.invalid' };
const row = (id, fields = {}) => ({ id, event_id: event.id, full_name: id, email: `${id}@example.invalid`, class_name: 'Open', is_paid: true, whatsapp_added: true, ...fields });
const alpha = row('alpha', { profile_id: 21, players: { id: 21, name: 'Alpha profile', license_type: 'full' } });
const beta = row('beta', { profile_id: 30, class_name: 'Mixed', players: { id: 30, name: 'Beta profile', temporary_licenses: [{ event_id: event.id }] } });
const gamma = row('gamma', { is_paid: false, whatsapp_added: false });
const other = row('unauthorised', { event_id: 22 });
const payment = (id, amount, metadata, fields = {}) => ({ id, reference: id, event_id: event.id, status: 'success', currency: 'ZAR',
  amount, payment_type: 'event_entry_fee', payment_method: 'manual', metadata, ...fields });
const manual = payment('manual-rec-1', '123.45', { participant_id: alpha.id, note: 'Received at venue', collection_recipient: 'organiser' });
const cover = participant => ({ type: 'entry', email: participant.email, division: participant.class_name });
const financePayload = (overrides = {}) => ({ events: [event], payments: [manual], participants: [alpha, beta, gamma], refunds: [], divisions: [], ...overrides });

function fixture({ platform = false, organisation = true, scope = 'org:north', payload = financePayload(), gatewayComplete = true, revokeAtVerify = false } = {}) {
  const calls = [];
  let active = true;
  const complete = data => ({ data, error: null });
  const client = {
    auth: { getUser: async () => complete({ user }) },
    from(table) {
      const filters = {};
      let range = null;
      const query = { select: () => query, order: () => query, abortSignal: () => query,
        eq(key, value) { filters[key] = value; return query; },
        range(a, b) { range = [a, b + 1]; return query; },
        async single() { calls.push([table, filters]); return complete(event); },
        then(resolve, reject) {
          calls.push([table, filters]);
          assert.equal(table, 'tournament_participants');
          const rows = [alpha, beta, gamma].filter(row => String(row.event_id) === String(filters.event_id));
          return Promise.resolve(complete(range ? rows.slice(...range) : rows)).then(resolve, reject);
        },
      };
      return query;
    },
    rpc(name, args) {
      calls.push([name, args]);
      const result = {
        can_manage_event: true, account_is_active: active, is_super_admin: platform, is_organisation_admin: organisation,
        event_finance_overview_source: payload,
        event_license_status: [{ player_id: 21, eligibility: { full: true, temporary: false } }, { player_id: 30, eligibility: { full: false, temporary: true } }],
      }[name];
      const request = Promise.resolve(complete(result));
      request.abortSignal = () => request;
      return request;
    },
    functions: { async invoke(name, options) {
      calls.push([name, options.body]);
      if (revokeAtVerify) active = false;
      return complete({ unresolved: gatewayComplete ? [] : [{ reason: 'synthetic provider timeout' }] });
    } },
  };
  return { calls, client, eventId: event.id, expectedUserId: user.id, scopeId: scope };
}

test('imported table supports all current filters against event-year licence evidence and a safe public tournament URL', () => {
  const rows = [alpha, beta, gamma];
  assert.deepEqual(filterEventParticipants(rows, event.id, { profile: 'linked' }).map(row => row.id), ['beta', 'alpha']);
  assert.deepEqual(filterEventParticipants(rows, event.id, { profile: 'unlinked', payment: 'unpaid', whatsapp: 'pending' }), [gamma]);
  assert.deepEqual(filterEventParticipants(rows, event.id, { division: 'Mixed', licence: 'temp', query: 'Beta profile' }), [beta]);
  assert.deepEqual(filterEventParticipants(rows, event.id, { licence: 'none', payment: 'paid' }), []);
  assert.equal(publicParticipantTournament({ ...event, rankedin_url: 'https://rankedin.com/en/tournament/2001/imported' }), 'https://rankedin.com/en/tournament/2001/imported');
  assert.equal(publicParticipantTournament({ ...event, rankedin_url: 'https://evil.example/en/tournament/2001' }), 'https://www.rankedin.com/en/tournament/2001');
  assert.equal(publicParticipantTournament({ rankedin_url: 'javascript:alert(1)' }), '');
});

test('exact manual receipts and provider-backed team allocations produce filtered Excel amounts', async () => {
  const bundle = payment('T12345678901', 350, { covers: [cover(alpha), cover(beta)], division_entry_fees: { Open: 150, Mixed: 200 } }, { payment_method: 'paystack' });
  const duplicate = payment('admin-confirmation', 150, { participant_id: alpha.id, paystack_ref: bundle.reference });
  const nameOnly = payment('incorrect-name', 600, { player_name: 'Gamma' });
  const otherEvent = { ...payment('foreign', 900, { participant_id: alpha.id }), event_id: 22 };
  const testPayment = payment('test', 150, { participant_id: beta.id, is_test: true });
  const gateway = { reference: bundle.reference, amount: 350, verified: true, currency: 'ZAR' };
  const amounts = verifiedImportedParticipantPayments(event.id, [alpha, beta, gamma, other], [manual, bundle, duplicate, nameOnly, otherEvent, testPayment], { receipts: [gateway] });
  assert.equal(amounts.get(alpha.id).cents, 27345);
  assert.equal(amounts.get(beta.id).cents, 20000);
  assert.equal(amounts.has(gamma.id), false);
  const workbook = buildImportedParticipantWorkbook(event, [alpha, gamma], amounts);
  const sheet = workbook.getWorksheet('Event Finance');
  assert.equal(sheet.getCell('A4').value, 'alpha');
  assert.equal(sheet.getCell('I4').value, 273.45);
  assert.equal(sheet.getCell('A5').value, 'gamma');
  assert.equal(sheet.getCell('I5').value, null);
  assert.equal(sheet.getCell('I7').value, 273.45);
  assert.equal((await workbook.xlsx.writeBuffer()).byteLength > 1000, true);
});

test('unverified, ambiguous, oversubscribed and cross-registration receipts do not become paid amounts', () => {
  const unpaidCovers = [cover(alpha), cover(beta)];
  const bundle = payment('T12345678902', 180, { covers: unpaidCovers, division_entry_fees: { Open: 100, Mixed: 100 } }, { payment_method: 'paystack' });
  const ambiguous = payment('duplicates', 100, { covers: [cover(alpha)] });
  const wrongLink = payment('wrong-registration', 300, { participant_id: beta.id, registration_id: 'different-registration' });
  const gateway = { reference: bundle.reference, amount: 180, verified: true, currency: 'ZAR' };
  const sameEntry = { ...alpha, id: 'other-alpha' };
  assert.equal(verifiedImportedParticipantPayments(event.id, [alpha, beta], [bundle], { receipts: [gateway] }).size, 0);
  assert.equal(verifiedImportedParticipantPayments(event.id, [alpha, beta], [bundle], {}).size, 0);
  assert.equal(verifiedImportedParticipantPayments(event.id, [alpha, beta, sameEntry], [ambiguous, wrongLink], {}).size, 0);
});

test('imported finance verifies exact event, keeps delegated readers out and rechecks immediately before export', async () => {
  const delegated = fixture({ organisation: false });
  assert.equal(await loadImportedFinance(delegated), null);
  assert.equal(delegated.calls.some(([name]) => name === 'event_finance_overview_source'), false);
  const crossEvent = fixture({ payload: financePayload({ payments: [{ ...manual, event_id: 99 }] }) });
  await assert.rejects(loadImportedFinance(crossEvent), /finance records could not be verified/);
  const wrongScope = fixture({ scope: 'org:south' });
  await assert.rejects(loadImportedFinance(wrongScope), /outside the selected workspace/);
  assert.equal(wrongScope.calls.some(([name]) => name === 'event_finance_overview_source'), false);
  const revoked = fixture({ revokeAtVerify: true });
  await assert.rejects(prepareImportedParticipantExport({ ...revoked, filters: { payment: 'paid' } }), /permission is required/);
  const unavailable = fixture({ gatewayComplete: false });
  await assert.rejects(prepareImportedParticipantExport({ ...unavailable, filters: { profile: 'linked' } }), /verification is incomplete/);
  const owner = fixture();
  const data = await loadImportedFinance(owner);
  assert.equal(importedParticipantSettlement(event, [alpha, beta, gamma], data).grossEntryFees, 123.45);
  const exported = await prepareImportedParticipantExport({ ...owner, filters: { licence: 'full', payment: 'paid' } });
  assert.deepEqual(exported.rows.map(row => row.id), ['alpha']);
  assert.equal(exported.amounts.get(alpha.id).cents, 12345);
  assert.ok(owner.calls.filter(([name, args]) => name === 'event_finance_overview_source' && args.p_event_ids[0] === event.id).length);
});
