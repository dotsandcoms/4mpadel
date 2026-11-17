// Isolated PostgreSQL only. Never reads hosted credentials or a database URL.
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const dir = mkdtempSync(join(tmpdir(), 'fourm-paid-registration-')), data = join(dir, 'data');
const conn = ['-h', '/private/tmp', '-p', '55452', '-d', 'fourm_permission_boundary_test'];
let started = false;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-instructions', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', "-k /private/tmp -h '' -p 55452", '-w', 'start']); started = true;
  run('createdb', ['-h', '/private/tmp', '-p', '55452', 'fourm_permission_boundary_test']);
  const output = run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...conn, '-f', resolve('tests/paid-registration-checkout.sql')]);
  process.stdout.write(output.split('\n').filter(line => /Paid registration DB:/.test(line)).join('\n') + '\n');
} catch (error) {
  process.stderr.write(error.stderr?.toString() || error.message);
  if (!started) { try { process.stderr.write(readFileSync(join(dir, 'postgres.log'), 'utf8')); } catch {} }
  process.exitCode = 1;
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
