// Isolated PostgreSQL only; never reads a hosted URL or credentials.
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const dir = mkdtempSync(join(tmpdir(), 'fourm-messaging-'));
const data = join(dir, 'data'), log = join(dir, 'postgres.log');
const conn = ['-h', '/private/tmp', '-p', '55446'];
let started = false;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-instructions', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', log, '-o', `-k /private/tmp -h '' -p 55446`, '-w', 'start']); started = true;
  run('createdb', [...conn, 'fourm_messaging_test']);
  process.stdout.write(run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...conn, '-d', 'fourm_messaging_test', '-f', resolve('tests/messaging.sql')]).trim().split('\n').filter(line => /Messaging (DB|capacity):/.test(line)).join('\n') + '\n');
  run('createdb', [...conn, 'fourm_data_api_grant_test']);
  const access = execFileSync('npm', ['run', 'test:data-api:db'], { cwd: resolve('..'), env: { ...process.env, PGHOST: '/private/tmp', PGPORT: '55446' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(access.trim().split('\n').slice(-3).join('\n') + '\n');
} catch (e) {
  process.stderr.write(e.stderr?.toString() || e.message);
  if (!started) { try { process.stderr.write(readFileSync(log, 'utf8')); } catch {} }
  process.exitCode = 1;
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
