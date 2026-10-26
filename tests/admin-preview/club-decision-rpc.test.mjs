import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_DECISION_STAGING_URL, isClubDecisionEnabled, applicationDecisionArguments, claimDecisionArguments, submitClubDecision, loadClubApplicationReview } from '../../src/pages/admin-preview/clubDecisionRpc.js';
const config = { enable: 'staging' };
const application = { id: 'club', name: 'Test', status: 'in_review', contact_email: 'a@example.invalid', contacts: [], created_by: null };
function mock(role = 'super_admin') {
  const calls = [];
  return { calls, supabaseUrl: CLUB_DECISION_STAGING_URL,
    auth: { getUser: async () => ({ data: { user: { id: 'actor', email: 'qa@example.invalid' } } }) },
    from(table) { return { select() { return this; }, ilike() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role } }), single: async () => ({ data: application }) }; },
    rpc: async (name, args) => {if(name==='account_is_active')return{data:true};if(name==='is_super_admin')return{data:role==='super_admin'}; calls.push({ name, args }); return { data: { status: 'published', notification: 'queued' } }; },
  };
}
test('gates exact staging URL and explicit flag, defaults off', () => {
  const client = mock(); assert.equal(isClubDecisionEnabled(client), false); assert.equal(isClubDecisionEnabled(client, config), true);
  for (const url of ['https://production.supabase.co', `${CLUB_DECISION_STAGING_URL}/`, `${CLUB_DECISION_STAGING_URL}.evil`, undefined]) assert.equal(isClubDecisionEnabled({ supabaseUrl: url }, config), false);
  for (const enable of ['true', true, '', undefined, 'production']) assert.equal(isClubDecisionEnabled(client, { enable }), false);
});
test('builds immutable exact reviewed application and five-argument claim snapshots', () => {
  const args = applicationDecisionArguments(application, 'approved'); assert.deepEqual(Object.keys(args.p_expected_application).sort(), ['contact_email','contacts','created_by','name','status']);
  assert.equal(args.p_expected_application.created_by, null);
  const claim = { id: 'claim', club_id: 'club', requester_email: 'a@example.invalid', requester_player_id: null, status: 'pending', full_name: 'A', players: { name: 'unused' } };
  const claimArgs = claimDecisionArguments(claim, 'rejected', ' Review evidence '); assert.equal(claimArgs.p_expected_club_id, 'club'); assert.equal(claimArgs.p_rejection_notes, 'Review evidence'); assert.equal('players' in claimArgs.p_expected_claim, false);
  claim.full_name = 'Changed'; assert.equal(claimArgs.p_expected_claim.full_name, 'A');
  assert.throws(() => applicationDecisionArguments(application, 'rejected', ''), /required/);
  assert.throws(() => applicationDecisionArguments({ id: 'club', status: 'in_review' }, 'approved'), /complete/);
});
test('fresh role, account identity and context checks prevent RPC writes', async () => {
  for (const options of [{ client: mock('custom') }, { client: mock(), userId: 'other' }, { client: mock(), isCurrent: () => false }, { client: mock(), config: { enable: '' } }]) {
    const args = { client: options.client, scopeId: 'all', userId: 'actor', kind: 'application', args: applicationDecisionArguments(application, 'approved'), config, ...options };
    await assert.rejects(submitClubDecision(args)); assert.equal(args.client.calls.length, 0);
  }
});
test('loads fresh application then calls only atomic RPC', async () => {
  const client = mock(); const record = await loadClubApplicationReview({ client, scopeId: 'all', userId: 'actor', clubId: 'club', config });
  await submitClubDecision({ client, scopeId: 'all', userId: 'actor', kind: 'application', args: applicationDecisionArguments(record, 'approved'), config });
  assert.equal(client.calls.length, 1); assert.equal(client.calls[0].name, 'preview_decide_club_application');
});
