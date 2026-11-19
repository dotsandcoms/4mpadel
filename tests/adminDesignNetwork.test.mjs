import assert from 'node:assert/strict';
import test from 'node:test';
import { previewScopes } from '../src/pages/admin-preview/access.js';
import { canReadClubDirectory, loadClubDirectory } from '../src/pages/admin-preview/clubsData.js';
import { loadClubDetails } from '../src/pages/admin-preview/clubDetailsData.js';

const session = { user: { id: 'synthetic-north-member' } };
const member = { role: 'custom', allowed_tabs: ['clubs'], clubs: [
  { id: 'north-club', name: 'North Padel', member_role: 'admin' },
  { id: 'visit-club', name: 'Visitor Club', member_role: 'member' },
] };
const directory = [{id:'north-club',name:'North Padel'},{id:'south-club',name:'South Padel'}];

function databaseFixture() {
  const requests = [];
  return { requests, client: { from: table => {
    let id, offset;
    const query = {
      select: () => query, order: () => query, abortSignal: () => query,
      eq: (field, value) => { requests.push([table, field, value]); id = value; return query; },
      range: start => { offset = start; return query; },
      maybeSingle: async () => ({ data: directory.find(row => row.id === id) }),
      then: resolve => resolve({ data: offset ? [] : directory.filter(row => !id || row.id === id) }),
    };
    return query;
  } } };
}

test('club directory, export rows and opening a drawer are constrained to the verified club', async () => {
  const scopes = previewScopes(member, 'clubs');
  assert.deepEqual(scopes.map(scope => scope.id), ['club:north-club']);
  assert.equal(canReadClubDirectory(session, member, 'all'), false);
  assert.equal(canReadClubDirectory(session, member, 'club:visit-club'), false);
  const { requests, client } = databaseFixture();
  const rows = await loadClubDirectory(client, session, member, scopes[0].id);
  assert.deepEqual(rows.map(row => row.name), ['North Padel']);
  assert.ok(requests.every(row => row.join(':') === 'clubs:id:north-club'));
  assert.deepEqual(await loadClubDetails(client, session, member, scopes[0].id, 'north-club'), rows[0]);
  const requestCount = requests.length;
  await assert.rejects(loadClubDetails(client, session, member, scopes[0].id, 'south-club'), /outside the selected workspace/);
  await assert.rejects(loadClubDirectory(client, session, member, 'club:south-club'), /Current Clubs access/);
  assert.equal(requests.length, requestCount);
});

test('an organisation membership cannot turn an additional club tab into a platform directory grant', async () => {
  const { client, requests } = databaseFixture();
  const orgMember = { role: 'custom', allowed_tabs: ['clubs'], orgs: [{ id: 'north', member_role: 'owner' }] };
  await assert.rejects(loadClubDirectory(client, session, orgMember, 'all'), /Current Clubs access/);
  assert.equal(requests.length, 0);
  assert.equal((await loadClubDirectory(client, session, { role: 'super_admin' }, 'all')).length, 2);
});
