// Temporary PostgreSQL only. No hosted database credentials or URL are read.
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const dir = mkdtempSync(join(tmpdir(), 'fourm-following-ranking-'));
const data = join(dir, 'data'), log = join(dir, 'postgres.log'), conn = ['-h', '/private/tmp', '-p', '55449'];
let started = false;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-instructions', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', log, '-o', "-k /private/tmp -h '' -p 55449", '-w', 'start']); started = true;
  run('createdb', [...conn, 'fourm_following_ranking_test']);
  const output = run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...conn, '-d', 'fourm_following_ranking_test', '-f', resolve('tests/following-main-ranking.sql')]);
  process.stdout.write(output.split('\n').filter(line => /Following main rankings DB:/.test(line)).join('\n') + '\n');
} catch (error) {
  process.stderr.write(error.stderr?.toString() || error.message);
  if (!started) { try { process.stderr.write(readFileSync(log, 'utf8')); } catch {} }
  process.exitCode = 1;
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
