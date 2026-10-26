import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_INVITATION_FIELDS, normalizeClubInvitationEmail, loadClubInvitations, prepareClubInvitationPreview, searchClubInvitationPlayers, loadClubInvitationProfile } from '../../src/pages/admin-preview/clubInvitations.js';
const context = { scopeId: 'all', userId: 'admin-1', clubId: 'club-1' };
function mock({ role = 'super_admin', userId = 'admin-1', player = null, error = null, rows = [] } = {}) {
  const calls = [];
  return { calls, rpc: async name => ({data: name === 'account_is_active' || role === 'super_admin'}), auth: { getUser: async () => { calls.push(['auth']); return { data: { user: { id: userId, email: 'admin@example.invalid' } } }; } }, from(table) {
    calls.push(['from', table]); let start = 0;
    const q = { select(v) { calls.push(['select', table, v]); return q; }, ilike(k,v) { calls.push(['ilike',table,k,v]); return q; }, eq(k,v) { calls.push(['eq',table,k,v]); return q; }, order(k,v) { calls.push(['order',table,k,v]); return q; }, range(v) { start=v; return q; }, abortSignal(v) { calls.push(['signal',v]); return q; }, async maybeSingle() { return table === 'admin_sidebar_permissions' ? { data: { role } } : { data: player, error }; }, then(resolve) { return Promise.resolve({ data: rows.slice(start,start+2), error }).then(resolve); } }; return q;
  } };
}
test('valid single addresses normalize, including synthetic and literal wildcard characters', () => {
  assert.equal(normalizeClubInvitationEmail(' A_%+test@example.invalid '), 'a_%+test@example.invalid');
  for (const value of ['', 'brad', 'a@b', 'a..b@example.test', '.a@example.test', 'Name <a@example.test>', 'a@example.test,b@example.test', 'a@example.test\nb@example.test', 'a@-example.test', 'a@example..test', null]) assert.throws(() => normalizeClubInvitationEmail(value), /email/);
});
function searchMock(options = {}) {
  const client = mock(options), from = client.from;
  client.from = table => {
    const q = from(table);
    for (const method of ['or','not','limit']) q[method] = (...args) => { client.calls.push([method,...args]); return q; };
    return q;
  };
  return client;
}
test('recipient search matches source fields/limit and does not exclude members', async () => {
  const rows = [{id:1,name:'Brad',email:'brad@example.invalid',image_url:null}];
  const client = searchMock({rows});
  assert.deepEqual(await searchClubInvitationPlayers({...context,client,query:' Brad '}),rows);
  assert(client.calls.some(call => JSON.stringify(call) === JSON.stringify(['select','players','id,name,email,image_url'])));
  assert(client.calls.some(call => JSON.stringify(call) === JSON.stringify(['or','name.ilike."%Brad%",email.ilike."%Brad%"'])));
  assert(client.calls.some(call => JSON.stringify(call) === JSON.stringify(['not','email','is',null])));
  assert(client.calls.some(call => JSON.stringify(call) === JSON.stringify(['limit',8])));
  assert(!client.calls.some(call => call.includes('club_members')));
});
test('recipient search quotes filter syntax and escapes literal LIKE wildcards', async () => {
  const client=searchMock(); const term='A_%,(id.gt.0),"\\B';
  await searchClubInvitationPlayers({...context,client,query:term});
  const filter=client.calls.find(call => call[0]==='or')[1];
  // Decode each quoted PostgREST value and verify SQL LIKE metacharacters remain escaped.
  const matches=[...filter.matchAll(/(?:name|email)\.ilike\.("(?:\\.|[^"\\])*")/g)];
  assert.equal(matches.length,2);
  for(const match of matches) assert.equal(JSON.parse(match[1]),'%A\\_\\%,(id.gt.0),"\\\\B%');
});
test('recipient search minimum length, authority, errors and abort fail closed', async () => {
  const short=searchMock(); assert.deepEqual(await searchClubInvitationPlayers({...context,client:short,query:' a '}),[]); assert.deepEqual(short.calls,[]);
  for(const options of [{role:'staff'},{userId:'switched'},{error:new Error('read failed')}]) await assert.rejects(searchClubInvitationPlayers({...context,client:searchMock(options),query:'Brad'}));
  for(const query of ['Br*','Br\nad','a'.repeat(201)]) await assert.rejects(searchClubInvitationPlayers({...context,client:searchMock(),query}));
  const controller=new AbortController(), client=searchMock(); controller.abort();
  await assert.rejects(searchClubInvitationPlayers({...context,client,query:'Brad',signal:controller.signal}),{name:'AbortError'}); assert.deepEqual(client.calls,[]);
});
test('metadata is club-scoped, paginated and token-free with newest-first ordering', async () => {
  const client = mock({ rows: [{id:1},{id:2},{id:3}] });
  assert.equal((await loadClubInvitations({ ...context, client })).length, 3);
  assert(client.calls.some(call => call[0]==='eq' && call[2]==='club_id' && call[3]==='club-1'));
  assert(client.calls.some(call => call[0]==='order' && call[2]==='created_at' && call[3].ascending===false));
  assert.equal(CLUB_INVITATION_FIELDS, 'id,club_id,email,status,created_at,accepted_at');
  assert(client.calls.filter(call => call[0]==='select' && call[1]==='club_claim_invites').every(call => call[2]===CLUB_INVITATION_FIELDS));
});
test('preview resolves exact email and only reports profile requirement', async () => {
  for (const player of [null,{id:7,email:' A_%@example.invalid '}]) {
    const client = mock({rows:player ? [player] : []});
    assert.deepEqual(await prepareClubInvitationPreview({...context,client,email:' A_%@example.invalid '}), {clubId:'club-1',normalizedEmail:'a_%@example.invalid',existingPlayer:!!player,profileSetupRequired:!player});
    assert(client.calls.some(call => call[0]==='ilike' && call[1]==='players' && call[3]==='%a\\_\\%@example.invalid%'));
  }
});
test('star and whitespace lookup scans all pages then enforces exact normalized email', async () => {
  const target={id:3,name:'Literal star',email:'  A*B@example.invalid  '};
  const rows=[{id:1,email:'ab@example.invalid'},{id:2,email:'axb@example.invalid'},target,{id:4,email:'a*b@example.invalid.extra'}];
  const client=mock({rows});
  assert.deepEqual(await loadClubInvitationProfile(client,'a*b@example.invalid'),target);
  assert(client.calls.some(call=>call[0]==='ilike' && call[3]==='%a%b@example.invalid%'));
  assert(client.calls.some(call=>call[0]==='order' && call[2]==='id'));
  assert.equal(await loadClubInvitationProfile(mock({rows:rows.filter(row=>row.id!==3)}),'a*b@example.invalid'),null);
});
test('exact duplicate on later page is ambiguous, not absent or first-profile wins', async () => {
  const client=mock({rows:[{id:1,email:'a@example.invalid'},{id:2,email:'other@example.invalid'},{id:3,email:' A@example.invalid '}]});
  await assert.rejects(loadClubInvitationProfile(client,'a@example.invalid'),/Multiple player profiles/);
});
test('permission, switched account, missing context and lookup errors fail closed', async () => {
  for (const options of [{role:'admin'},{userId:'different'},{error:new Error('ambiguous lookup')}]) await assert.rejects(prepareClubInvitationPreview({...context,client:mock(options),email:'a@example.invalid'}));
  await assert.rejects(loadClubInvitations({...context,client:mock(),userId:null}));
  await assert.rejects(loadClubInvitations({...context,client:mock({error:new Error('read failed')})}),/read failed/);
});
test('abort prevents queries and never misreports a missing player', async () => {
  const controller = new AbortController(); controller.abort(); const client=mock();
  await assert.rejects(prepareClubInvitationPreview({...context,client,email:'a@example.invalid',signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(loadClubInvitations({...context,client,signal:controller.signal}),{name:'AbortError'});
  assert.deepEqual(client.calls,[]);
});
