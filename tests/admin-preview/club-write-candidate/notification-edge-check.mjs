// Explicit staging integration test. Creates only private synthetic outbox rows,
// invokes the provider-disabled simulation worker, then removes its own rows.
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const project = 'cefmzkwabdqqoagxhekc';
const workdir = process.argv[2];
if (!workdir || readFileSync(`${workdir}/supabase/.temp/project-ref`, 'utf8').trim() !== project) throw new Error('Verified isolated staging workdir required.');
const run = args => execFileSync('supabase', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const query = sql => JSON.parse(run(['db', 'query', '--linked', '--workdir', workdir, sql])).rows;
// Credentials remain in process memory and are never printed or written to disk.
const keys = JSON.parse(run(['projects', 'api-keys', '--project-ref', project, '--output', 'json']));
const key = keys.find(item => item.name === 'service_role')?.api_key;
if (!key) throw new Error('Staging service credential unavailable.');
const workerToken = randomBytes(32).toString('hex');
// Rotate this test-only staging worker credential without logging it.
run(['secrets', 'set', `CLUB_NOTIFICATION_WORKER_TOKEN=${workerToken}`, '--project-ref', project]);
const fixtures = ['claim', 'application'].map(kind => ({ kind, id: randomUUID(), actor: randomUUID() }));
try {
  for (const { kind, id, actor } of fixtures) {
    const decision = kind === 'claim'
      ? `INSERT INTO club_preview_private.claim_decisions(claim_id,actor_id,decision,request_snapshot) VALUES('${id}','${actor}','approved','{}');`
      : `INSERT INTO club_preview_private.application_decisions(club_id,actor_id,decision,previous_status,request_snapshot,notification_queued) VALUES('${id}','${actor}','approved','in_review','{}',true);`;
    query(`BEGIN; ${decision} INSERT INTO club_preview_private.${kind}_notifications(${kind === 'claim' ? 'claim_id' : 'club_id'},recipient,template,payload) VALUES('${id}','edge-check@example.invalid','${kind === 'claim' ? 'club_claim_approved' : 'club_approved'}','{"clubName":"Synthetic staging edge check"}'); COMMIT;`);
    const response = await fetch(`https://${project}.supabase.co/functions/v1/club-decision-notifications`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'X-Club-Worker-Token': workerToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }), signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, 'Worker must accept authorised staging simulation');
    const result = await response.json();
    assert.equal(result.id, id); assert.equal(result.status, 'simulated');
    const rows = query(`SELECT delivery_status,attempt_count,provider_message_id FROM club_preview_private.${kind}_notifications WHERE ${kind === 'claim' ? 'claim_id' : 'club_id'}='${id}';`);
    assert.equal(rows[0].delivery_status, 'simulated'); assert.equal(rows[0].attempt_count, 1); assert.equal(rows[0].provider_message_id, null);
  }
  console.log('PASS: deployed staging worker rendered and simulated both synthetic notifications; no provider messages.');
} finally {
  for (const { kind, id } of fixtures) {
    const column = kind === 'claim' ? 'claim_id' : 'club_id';
    query(`BEGIN; DELETE FROM club_preview_private.${kind}_notifications WHERE ${column}='${id}'; DELETE FROM club_preview_private.${kind}_decisions WHERE ${column}='${id}'; COMMIT;`);
  }
  console.log('Removed only this test’s four synthetic private queue/audit rows.');
}
