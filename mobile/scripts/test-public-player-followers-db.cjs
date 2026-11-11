// Synthetic disposable PostgreSQL only. No hosted rows or credentials are used.
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname } = require('node:path');
const { execFileSync } = require('node:child_process');
const dir = mkdtempSync(join(tmpdir(), 'fourm-public-followers-'));
const data = join(dir, 'data'), log = join(dir, 'postgres.log');
const conn = ['-h', '/private/tmp', '-p', '55450'];
let started = false;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const file = resolve('tests/public-player-followers.sql');
  const guard = readFileSync('supabase/migrations/20261110102648_permission_boundaries_for_legacy_admin_and_worker_access.sql', 'utf8')
    .match(/create or replace function private\.permission_actor_active\(\)[\s\S]*?\$\$;/)?.[0];
  if (!guard) throw new Error('Actual session guard could not be loaded.');
  const sql = readFileSync(file, 'utf8').replace('-- @active_actor_helper@', () => guard)
    .replace(/^\\ir (.+)$/gm, (_, path) => readFileSync(resolve(dirname(file), path), 'utf8'));
  writeFileSync(join(dir, 'fixture.sql'), sql);
  run('initdb', ['-D', data, '-A', 'trust', '--no-instructions', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', log, '-o', "-k /private/tmp -h '' -p 55450", '-w', 'start']); started = true;
  run('createdb', [...conn, 'fourm_public_followers_test']);
  const out = run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...conn, '-d', 'fourm_public_followers_test', '-f', join(dir, 'fixture.sql')]);
  process.stdout.write(out.split('\n').filter(line => /Public player followers DB:/.test(line)).join('\n') + '\n');
} catch (error) {
  process.stderr.write(error.stderr?.toString() || error.message);
  if (!started) { try { process.stderr.write(readFileSync(log, 'utf8')); } catch {} }
  process.exitCode = 1;
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
