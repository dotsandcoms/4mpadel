// Run in an isolated local PostgreSQL cluster. Never connects to a hosted DB.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'fourm-license-dashboard-'));
const data = join(directory, 'data'), log = join(directory, 'postgres.log');
const port = '55446', connection = ['-h', '/private/tmp', '-p', port];
let started = false;
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-instructions', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', log, '-o', `-k /private/tmp -h '' -p ${port}`, '-w', 'start']);
  started = true;
  run('createdb', [...connection, 'fourm_license_dashboard_test']);
  const result = run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...connection, '-d', 'fourm_license_dashboard_test', '-f', 'tests/licenses/dashboard.sql']);
  console.log(result.trim().split('\n').slice(-3).join('\n'));
  for (const fixture of ['sales', 'payment-history', 'renewal-pricing', 'start-dates', 'archived-seasons', 'temporary-assignment']) {
    run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...connection, '-d', 'fourm_license_dashboard_test', '-f', `tests/licenses/${fixture}.sql`]);
    console.log(`${fixture}: passed`);
  }
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  if (!started) { try { console.error(readFileSync(log, 'utf8')); } catch { /* No log before startup. */ } }
  process.exitCode = 1;
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
