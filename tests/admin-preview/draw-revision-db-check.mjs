// Explicit offline check. Creates its own socket-only Postgres cluster; never
// accepts DATABASE_URL or connects to a configured/shared Supabase database.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { sampleTournament } from './tournament-data.js';
import { generateDivisionDraw } from '../../src/pages/admin-preview/tournament/utils/tournament/draws.js';

const source = process.env.MAIN_SOURCE_ROOT || '/Users/bradein/Sites/4m-Padel';
const directory = mkdtempSync(join(tmpdir(), '4m-draw-revision-'));
const dataDirectory = join(directory, 'data');
const port = '55439';
const psqlArgs = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', directory, '-p', port, '-U', userInfo().username, '-d', 'postgres'];
const run = (command, args, input) => {
  const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout.trim();
};
const sql = input => run('psql', psqlArgs, input);
const quote = value => value == null ? 'NULL' : `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
const insert = (table, rows, keys) => rows.map(row => `INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(key => quote(row[key])).join(',')});`).join('\n');
const migration = readFileSync(resolve('supabase/migrations/20261019071938_tournament_private_draw_revision_guard.sql'), 'utf8');
const admin = '00000000-0000-4000-8000-000000000001';
const actor = `SELECT set_config('request.jwt.claim.sub','${admin}',false);`;
let started = false;
try {
  run('initdb', ['-D', dataDirectory, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  // No TCP listener; this private 0700 directory owns the only socket.
  run('pg_ctl', ['-D', dataDirectory, '-l', join(directory, 'server.log'), '-o', `-F -k ${directory} -h '' -p ${port}`, '-w', 'start']);
  started = true;
  run('psql', [...psqlArgs, '-f', join(source, 'tests/tournament/schema.sql')]);
  for (const name of ['20260916110000_tournament_schedule.sql', '20260916120000_tournament_operations.sql', '20260916130000_tournament_preparation.sql']) {
    run('psql', [...psqlArgs, '-f', join(source, 'supabase/migrations', name)]);
  }
  const data = sampleTournament(), division = data.divisions[0], confirmation = data.confirmations[0];
  const registrations = data.registrations.filter(row => row.division_id === division.id);
  const review = { excluded: [], exceptions: {}, seeds: registrations.map(row => row.id) };
  const draft = generateDivisionDraw(data, division.id, confirmation.configuration, review);
  const save = revision => `SELECT public.tm_save_draw(${data.event.id},${quote(division.id)},${revision},${quote(draft)}::jsonb);`;
  sql([
    insert('auth.users', [{ id: admin, email: 'admin@example.test' }, { id: '00000000-0000-4000-8000-000000000002', email: 'outsider@example.test' }], ['id', 'email']),
    insert('calendar', [data.event], ['id', 'event_name', 'start_date', 'end_date', 'venue', 'is_manual']),
    insert('tournament_divisions', [division], ['id', 'event_id', 'name', 'sort_order', 'is_active']),
    insert('players', data.players, ['id', 'name', 'email', 'license_type', 'points']),
    insert('event_registrations', registrations, ['id', 'event_id', 'division_id', 'full_name', 'email', 'partner_name', 'partner_email', 'payment_status', 'status']), actor,
    `SELECT tm_confirm(${data.event.id},${quote(division.id)},'players','{"excluded":[],"exceptions":{}}',0);`,
    `SELECT tm_confirm(${data.event.id},${quote(division.id)},'format',${quote(confirmation.configuration)},1);`,
    `SELECT tm_confirm(${data.event.id},${quote(division.id)},'seeds',${quote({ seeds: review.seeds })},2);`,
    save(3), save(3),
  ].join('\n'));
  const revision = () => Number(sql(`SELECT revision FROM tournament_confirmations WHERE division_id=${quote(division.id)};`));
  const snapshot = () => sql(`SELECT md5(jsonb_build_array((SELECT to_jsonb(c) FROM tournament_confirmations c WHERE division_id=${quote(division.id)}),(SELECT jsonb_agg(to_jsonb(d)) FROM draws d),(SELECT jsonb_agg(to_jsonb(e)) FROM draw_entries e),(SELECT jsonb_agg(to_jsonb(m)) FROM draw_matches m))::text);`);
  assert.equal(revision(), 3, 'reproduces deployed overwrite: two saves consume no revision');
  const baseline = sql("SELECT pg_get_functiondef('public.tm_save_draw(bigint,uuid,integer,jsonb)'::regprocedure);");
  assert.equal(sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='public.tm_save_draw(bigint,uuid,integer,jsonb)'::regprocedure;"), 'cdb82aaac64fafdf72d69f9d27e56a0a', 'test source must match the verified deployed function body');
  sql(baseline.replace('DECLARE c public.', 'DECLARE /* synthetic source drift */ c public.'));
  const drift = spawnSync('psql', psqlArgs, { input: migration, encoding: 'utf8', timeout: 30000 });
  assert.notEqual(drift.status, 0); assert.match(drift.stderr, /Unexpected tm_save_draw/);
  sql(baseline);
  sql(migration); sql(migration); // Candidate must preserve its own replay behavior.
  sql(actor + save(3)); assert.equal(revision(), 4);
  assert.equal(Number(sql('SELECT (scoring_rules->>\'preparation_revision\')::integer FROM draws;')), 4);
  const expectRejected = (statement, pattern) => {
    const before = snapshot();
    const result = spawnSync('psql', psqlArgs, { input: actor + statement, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(result.status, 0); assert.match(result.stderr, pattern); assert.equal(snapshot(), before, 'rejection must leave no partial changes');
  };
  expectRejected(save(3), /Confirm the current players/);
  expectRejected(save('NULL'), /Confirm the current players/);
  expectRejected(`SELECT tm_save_draw(${data.event.id},${quote(division.id)},4,${quote({ ...draft, entries: [] })});`, /Every included team/);
  sql(actor + `SELECT tm_publish_draw(${data.event.id},(SELECT id FROM draws),(SELECT updated_at FROM draws));`);
  expectRejected(save(4), /Published draws/);
  // Fixture-only reopening to exercise competing private saves, never a live RPC.
  sql("UPDATE draws SET status='draft';");
  const first = spawn('psql', psqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  let firstOutput = '', firstError = '';
  const firstDone = new Promise(resolve => first.once('close', code => resolve(code)));
  first.stderr.on('data', chunk => { firstError += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('First writer did not reach its transaction barrier')), 10000);
    first.stdout.on('data', chunk => { firstOutput += chunk; if (firstOutput.includes('first-saved')) { clearTimeout(timer); resolve(); } });
    first.once('close', () => { if (!firstOutput.includes('first-saved')) { clearTimeout(timer); reject(new Error(firstError)); } });
  });
  first.stdin.end(`BEGIN;${actor}${save(4)} SELECT 'first-saved'; SELECT pg_sleep(0.4); COMMIT;`);
  await ready;
  const second = spawnSync('psql', psqlArgs, { input: actor + save(4), encoding: 'utf8', timeout: 10000 });
  assert.equal(await firstDone, 0, firstError); assert.notEqual(second.status, 0); assert.match(second.stderr, /Confirm the current players/); assert.equal(revision(), 5);
  sql(actor + `SELECT tm_confirm(${data.event.id},${quote(division.id)},'format',${quote(confirmation.configuration)},5); SELECT tm_confirm(${data.event.id},${quote(division.id)},'seeds',${quote({ seeds: review.seeds })},6);` + save(7) + `SELECT tm_publish_draw(${data.event.id},(SELECT id FROM draws),(SELECT updated_at FROM draws));`);
  assert.equal(revision(), 8, 'reconfirmation and regeneration remain compatible');
  sql("SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false); DO $$ BEGIN BEGIN PERFORM tm_save_draw(90000002,'" + division.id + "',5,'{}'); EXCEPTION WHEN insufficient_privilege THEN RETURN; END; RAISE EXCEPTION 'Expected authority denial'; END $$;");
  assert.equal(sql("SELECT has_function_privilege('anon','public.tm_save_draw(bigint,uuid,integer,jsonb)','execute');"), 'f');
  // Demonstrate rather than hide the adjacent legacy-writer limitation.
  sql(actor + "SET ROLE authenticated; UPDATE draws SET status='draft',generated_at=clock_timestamp();");
  assert.equal(revision(), 8, 'legacy direct draw writes do not consume the RPC revision');
  console.log('PASS: deployed race reproduced; exact source drift rejection, candidate replay, null/stale rejection, atomic rollback, publication/reconfirmation compatibility, concurrent writers and authority denial verified. Legacy direct-write bypass also reproduced; candidate is not global draw protection.');
  console.log(`Local server ${run('postgres', ['--version'])}; shared/production databases untouched. Temporary test files retained at ${directory}`);
} finally {
  if (started) run('pg_ctl', ['-D', dataDirectory, '-m', 'fast', '-w', 'stop']);
}
