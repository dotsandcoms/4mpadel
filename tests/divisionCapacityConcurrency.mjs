// Disposable local Postgres only. This also runs divisionCapacity.sql, then
// checks two actual concurrent sessions competing for the last team place.
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { countDivisionPlaces } from '../src/utils/divisionCapacity.js';

const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '/private/tmp', '-p', '55443', '-d', 'postgres'];
const sql = (query) => {
    const result = spawnSync('psql', [...args, '-c', query], { encoding: 'utf8' });
    if (result.status) throw new Error(result.stderr);
    return result.stdout.trim();
};
const schema = readFileSync(new URL('./divisionCapacity.sql', import.meta.url), 'utf8').split('CREATE FUNCTION pg_temp.expect')[0]
    .replace('\\ir ../supabase/migrations/20261019050830_division_team_capacity.sql', () => readFileSync(new URL('../supabase/migrations/20261019050830_division_team_capacity.sql', import.meta.url), 'utf8'))
    .replace('\\ir ../supabase/migrations/20261019050836_registration_deadline_payment_access.sql', () => readFileSync(new URL('../supabase/migrations/20261019050836_registration_deadline_payment_access.sql', import.meta.url), 'utf8'))
    .replace('\\ir ../supabase/migrations/20261019050841_atomic_division_capacity_moves.sql', () => readFileSync(new URL('../supabase/migrations/20261019050841_atomic_division_capacity_moves.sql', import.meta.url), 'utf8'))
    .replace('\\ir ../supabase/migrations/20261019054258_event_late_payment_setting.sql', () => readFileSync(new URL('../supabase/migrations/20261019054258_event_late_payment_setting.sql', import.meta.url), 'utf8'));
const fixture = (email) => `INSERT INTO public.event_registrations(event_id,division_id,division,email,partner_email) VALUES
    (9001,'00000000-0000-0000-0000-000000009001','Race','${email}-a','${email}-b'),
    (9001,'00000000-0000-0000-0000-000000009001','Race','${email}-b','${email}-a');`;
const session = (query, onOutput = () => {}) => new Promise(resolve => {
    const child = spawn('psql', args);
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; onOutput(stdout); });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(query);
});

// Isolated instance: never point this test at a production database.
const setup = spawnSync('psql', args, { input: `${schema}
INSERT INTO public.calendar(id) VALUES(9001);
INSERT INTO public.tournament_divisions(id,event_id,name,entry_limit) VALUES('00000000-0000-0000-0000-000000009001',9001,'Race',1);
COMMIT;`, encoding: 'utf8' });
if (setup.status) throw new Error(setup.stderr);
try {
    let acquired;
    const ready = new Promise(resolve => { acquired = resolve; });
    const first = session(`BEGIN; ${fixture('first')} SELECT 'place-held'; SELECT pg_sleep(1); COMMIT;`, out => { if (out.includes('place-held')) acquired(); });
    await Promise.race([ready, first.then(result => { throw new Error(`First session ended before acquiring its place: ${JSON.stringify(result)}`); })]);
    const second = session(fixture('second'));
    const results = await Promise.all([first, second]);
    assert.equal(results[0].code, 0, results[0].stderr);
    assert.notEqual(results[1].code, 0);
    assert.match(results[1].stderr, /is full/);
    assert.equal(sql('SELECT count(*) FROM public.event_registrations'), '2');
    assert.equal(sql('SELECT private.count_registration_places(jsonb_agg(to_jsonb(r))) FROM public.event_registrations r'), '1');

    // A checkout blocked behind a withdrawal sees the released place at commit.
    let withdrawing;
    const withdrawalReady = new Promise(resolve => { withdrawing = resolve; });
    const withdrawal = session("BEGIN; UPDATE public.event_registrations SET status='withdrawn'; SELECT 'withdrawing'; SELECT pg_sleep(1); COMMIT;", out => { if (out.includes('withdrawing')) withdrawing(); });
    await Promise.race([withdrawalReady, withdrawal.then(result => { throw new Error(`Withdrawal ended before acquiring its lock: ${JSON.stringify(result)}`); })]);
    const replacement = session(fixture('replacement'));
    const release = await Promise.all([withdrawal, replacement]);
    assert.ok(release.every(r => r.code === 0), JSON.stringify(release));

    // Keep browser availability and the database's normalized roster counter in
    // agreement across duplicates, one-way reservations and malformed chains.
    let seed = 739;
    const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    for (let i = 0; i < 40; i++) {
        const rows = Array.from({ length: random(12) }, (_, id) => ({ id: String(id), email: `player-${random(8)}`,
            partner_email: random(4) ? `player-${random(8)}` : null,
            status: random(5) ? 'registered' : 'withdrawn', payment_status: random(3) ? 'pending' : 'paid' }));
        assert.equal(Number(sql(`SELECT private.count_registration_places('${JSON.stringify(rows)}'::jsonb)`)), countDivisionPlaces(rows));
    }
    console.log('Concurrent checkout, withdrawal and 40 roster parity checks passed.');
} finally {
    sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA auth CASCADE; DROP SCHEMA private CASCADE; DROP ROLE authenticated, anon, service_role;');
}
