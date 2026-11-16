// Creates and removes an isolated local cluster; never connects to Supabase.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'fourm-profile-details-'));
const data = join(directory, 'data');
const log = join(directory, 'postgres.log');
const port = '55444';
const connection = ['-h', '/private/tmp', '-p', port];
let started = false;
function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-instructions', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', log, '-o', `-k /private/tmp -h '' -p ${port}`, '-w', 'start']);
  started = true;
  run('createdb', [...connection, 'fourm_profile_details_test']);
  const result = run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...connection, '-d', 'fourm_profile_details_test', '-f', 'tests/profileDetails.sql']);
  console.log(result.trim().split('\n').at(-1));
  run('createdb', [...connection, 'fourm_data_api_grant_test']);
  console.log(run('npm', ['run', 'test:data-api:db'], { env: { ...process.env, PGHOST: '/private/tmp', PGPORT: port } }).trim());
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  if (!started) { try { console.error(readFileSync(log, 'utf8')); } catch { /* initdb may not have started. */ } }
  process.exitCode = 1;
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
