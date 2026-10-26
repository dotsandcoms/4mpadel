import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directoryLicense, filterPlayers, isPublicPlayer, loadDirectory, loadPlayerConnections, moneyLabel, playerStats, readAll, textValue } from '../../src/pages/admin-preview/playersData.js';
import { mockReadClient, players, tables } from './playersTestData.mjs';

test('readAll follows the actual server cap and returns every record once', async () => {
  const client = mockReadClient(tables, { cap: 17 });
  const rows = await readAll(() => client.from('players').select('id').order('id'));
  assert.equal(rows.length, 105); assert.equal(new Set(rows.map(p => p.id)).size, 105);
});
test('errors never turn into a successful empty directory', async () => {
  await assert.rejects(loadDirectory(mockReadClient(tables, { errors: { players: 'denied' } })), /denied/);
});
test('unavailable payment history is explicitly marked', async () => {
  const data = await loadDirectory(mockReadClient(tables, { errors: { payments: 'denied' } }));
  assert.equal(data.players.length, 105); assert.equal(data.paymentsAvailable, false); assert.match(data.warnings[0], /could not be read/);
});
test('full membership, temporary licence, unpaid and unknown remain separate', () => {
  assert.equal(directoryLicense(players[0]).key, 'full');
  assert.equal(directoryLicense(players[1]).key, 'temporary');
  assert.equal(directoryLicense(players[2]).key, 'unknown');
  assert.equal(directoryLicense(players[3]).key, 'unpaid');
  assert.equal(isPublicPlayer(players[0]), false);
  assert.equal(isPublicPlayer({ ...players[0], approved: true }), true);
  assert.equal(isPublicPlayer({ ...players[1], approved: true }), false);
  const stats = playerStats(players); assert.equal(stats.full + stats.temporary + stats.unpaid + stats.unknown, stats.total);
});
test('filters handle missing regions, mixed case searches and preserve input order', () => {
  const original = players.map(p => p.id);
  assert.equal(filterPlayers(players, { q: 'PLAYER1@EXAMPLE.TEST' }).length, 1);
  assert.equal(filterPlayers(players, { region: '__unassigned' }).length, 35);
  assert.equal(filterPlayers(players, { licence: 'temporary' }).length, 26);
  assert.equal(filterPlayers(players, { sort: 'points' })[0].id, 'test-105');
  assert.deepEqual(players.map(p => p.id), original);
});
test('zero values and structured fields are rendered safely', () => {
  assert.equal(textValue(0), '0'); assert.equal(textValue(false), 'No');
  assert.equal(typeof textValue({ division: 'Open', player_name: 'QA' }), 'string');
  assert.equal(moneyLabel(null), 'Not available'); assert.notEqual(moneyLabel(0), 'Not available');
});
test('linked records resolve both team members without changing any data', async () => {
  const before = JSON.stringify(tables);
  const result = await loadPlayerConnections(mockReadClient(), players[0]);
  assert.equal(result.registrations.length, 1); assert.equal(result.partners[0].id, players[1].id);
  assert.equal(result.teamRegistrations.length, 2); assert.equal(result.ownPayments.length, 1);
  assert.equal(JSON.stringify(tables), before);
});
test('missing email does not run a broad registration query', async () => {
  const client = mockReadClient(); const result = await loadPlayerConnections(client, { id: 'no-email' });
  assert.equal(result.registrations.length, 0); assert.match(result.warnings[0], /No email/);
  assert.equal(client.calls.some(c => c.table === 'event_registrations'), false);
});
test('aborted reads stop before querying', async () => {
  const controller = new AbortController(); controller.abort();
  const client = mockReadClient();
  await assert.rejects(readAll(() => client.from('players').select('id'), controller.signal), { name: 'AbortError' });
  assert.equal(client.calls.length, 0);
});
test('duplicate partner profiles are not guessed', async () => {
  const source = { ...tables, players: [...players, { ...players[1], id: 'duplicate' }] };
  const result = await loadPlayerConnections(mockReadClient(source), players[0]);
  assert.equal(result.partners.length, 0);
  assert.ok(result.warnings.some(w => w.includes('Multiple profiles')));
});
test('revoked temporary licences are excluded from directory and partner shaping without changing history',async()=>{
 const revoked={id:'revoked',event_id:9001,revoked_at:'2026-10-19T10:00:00Z'};
 const active={id:'active',event_id:9001,revoked_at:null};
 const source={...tables,players:players.map(p=>({...p,temporary_licenses:[active,revoked]}))};
 const directory=await loadDirectory(mockReadClient(source));
 assert.deepEqual(directory.players[0].temporary_licenses,[active]);
 const linked=await loadPlayerConnections(mockReadClient(source),source.players[0]);
 assert.deepEqual(linked.partners[0].temporary_licenses,[active]);
 assert.equal(source.players[0].temporary_licenses.length,2);
});
