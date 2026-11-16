// Grants/RLS enablement integration test. Actual table definitions are used,
// with foreign keys removed because the old application baseline is separate.
// No app functions, triggers, seed data or live connection are used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { migrationFiles, createdTable, tableAccess, normalizeName } from './lib/migration-access.mjs';
import { contracts } from '../tests/fixtures/data-api-access.mjs';

const host = process.env.PGHOST || '/private/tmp';
assert.ok(['/private/tmp', '/tmp', '127.0.0.1', 'localhost', '::1'].includes(host), 'Use a disposable local PostgreSQL instance');
const database = 'fourm_data_api_grant_test';
const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', host, '-p', process.env.PGPORT || '55443', '-d', database];
const files = migrationFiles();
const literal = value => `'${value.replaceAll("'", "''")}'`;
const expect = (condition, label) => `SELECT pg_temp.expect(${condition}, ${literal(label)});`;
const sql = [
    'BEGIN;',
    `DO $$ BEGIN
        IF current_database() <> '${database}' OR EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
            RAISE EXCEPTION 'Use the empty disposable fourm_data_api_grant_test database';
        END IF;
    END $$;`,
    'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',
    'GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;',
    `CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid;
    $$;
    CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'email';
    $$;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid(); $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;`,
    `CREATE FUNCTION pg_temp.expect(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
    CREATE FUNCTION pg_temp.denied(query text) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
        BEGIN EXECUTE query; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
        RAISE EXCEPTION 'Expected permission denial: %',query;
    END $$;`,
];

const sequences = new Set();
for (const { statements, tables } of files.filter(file => file.tables.length)) {
    for (const statement of statements) {
        const table = createdTable(statement);
        if (table?.startsWith('public.')) {
            // Column-level references only. Subsequent ALTER TABLE foreign keys
            // are not part of this access-only fixture.
            sql.push(statement.replace(/\breferences\s+(?:\w+\.)?\w+\s*\([^)]*\)(?:\s+on\s+(?:delete|update)\s+(?:no\s+action|restrict|cascade|set\s+null|set\s+default))*/gi, '') + ';');
        } else {
            const acl = tableAccess(statement);
            const rls = statement.match(/^alter\s+table\s+(\S+)\s+enable\s+row\s+level\s+security$/i);
            if (rls && tables.includes(normalizeName(rls[1]).includes('.') ? normalizeName(rls[1]) : `public.${normalizeName(rls[1])}`)) sql.push(statement + ';');
            else if (acl?.kind === 'table' && acl.tables.every(name => tables.includes(name))) sql.push(statement + ';');
            else if (acl?.kind === 'sequence' && acl.tables.every(name => tables.some(table => name.startsWith(`${table}_`)))) {
                sql.push(statement + ';');
                for (const name of acl.tables) sequences.add(name);
            }
        }
    }
}

for (const [table, roles] of contracts) {
    sql.push(expect(`(SELECT relrowsecurity FROM pg_class WHERE oid=${literal(table)}::regclass)`, `${table}: RLS enabled`));
    for (const [role, privileges] of Object.entries(roles)) {
        for (const privilege of ['select', 'insert', 'update', 'delete']) {
            sql.push(expect(`has_table_privilege(${literal(role)}, ${literal(table)}, ${literal(privilege)}) = ${privileges.includes(privilege)}`, `${role} ${privilege} ${table}`));
        }
    }
}
for (const sequence of sequences) sql.push(expect(`has_sequence_privilege('service_role', ${literal(sequence)}, 'usage')`, `service_role sequence usage: ${sequence}`));

// Replay the later FIP column restrictions too. A service grant must not undo
// the client restrictions or expose requester IDs and verification timestamps.
for (const file of [
    '20261001065425_player_fip_links_least_privilege.sql',
    '20261001065753_player_fip_profile_snapshot.sql',
    '20261001072337_official_fip_profile_links.sql',
]) {
    for (const statement of files.find(item => item.file.endsWith(file)).statements) {
        if (tableAccess(statement)?.tables.includes('public.player_fip_links')
            || (/^alter\s+table\s+public\.player_fip_links\b/i.test(statement) && /\badd\s+column\b/i.test(statement))) sql.push(statement + ';');
    }
}
sql.push(
    expect("NOT has_table_privilege('anon','public.player_fip_links','select')", 'FIP clients have column-only reads'),
    expect("has_column_privilege('anon','public.player_fip_links','fip_profile_url','select')", 'FIP public columns stay readable'),
    expect("NOT has_column_privilege('anon','public.player_fip_links','requested_by','select')", 'FIP requester stays private'),
    expect("NOT has_column_privilege('authenticated','public.player_fip_links','verified_at','insert')", 'clients cannot set FIP verification time'),
    expect("has_table_privilege('service_role','public.player_fip_links','insert,select,update,delete')", 'FIP server access remains available'),
);

// Exercise real source policies for My Schedule, plus representative public
// reads and private worker/identity inserts under actual Postgres roles.
const schedule = files.find(file => file.file.endsWith('20260803_player_schedule_events.sql'));
sql.push(...schedule.statements.filter(sql => /^create\s+policy/i.test(sql)).map(sql => sql + ';'));
sql.push(
    'CREATE POLICY public_divisions_read ON public.tournament_divisions FOR SELECT TO anon USING (true);',
    "SET LOCAL ROLE service_role; INSERT INTO public.tournament_divisions(name) VALUES('Synthetic division');",
    "INSERT INTO public.push_outbox(email,type,title,body) VALUES('fixture@example.com','event_registration','Fixture','Fixture');",
    "INSERT INTO public.tournament_audit(event_id,action) VALUES(1,'fixture');",
    "SELECT nextval('public.tournament_audit_id_seq'); RESET ROLE;",
    'SET LOCAL ROLE anon;',
    expect('(SELECT count(*) FROM public.tournament_divisions)=1', 'public read succeeds with explicit SELECT'),
    "SELECT pg_temp.denied('SELECT * FROM public.push_outbox');",
    "SELECT pg_temp.denied($q$INSERT INTO public.tournament_divisions(name) VALUES('Denied')$q$); RESET ROLE;",
    `SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"owner@example.com"}',true);`,
    'SET LOCAL ROLE authenticated;',
    "INSERT INTO public.player_schedule_events(user_email,event_id) VALUES('owner@example.com',1);",
    expect('(SELECT count(*) FROM public.player_schedule_events)=1', 'owner can create and read schedule'),
    "SELECT pg_temp.denied($q$INSERT INTO public.player_schedule_events(user_email,event_id) VALUES('other@example.com',2)$q$);",
    "SELECT pg_temp.denied('SELECT * FROM public.push_outbox');",
    `SELECT set_config('request.jwt.claims','{"email":"other@example.com"}',true);`,
    expect('(SELECT count(*) FROM public.player_schedule_events)=0', 'another account cannot read schedule'),
    "DELETE FROM public.player_schedule_events WHERE user_email='owner@example.com';",
    `SELECT set_config('request.jwt.claims','{"email":"owner@example.com"}',true);`,
    expect('(SELECT count(*) FROM public.player_schedule_events)=1', 'another account cannot remove schedule'),
    "DELETE FROM public.player_schedule_events WHERE user_email='owner@example.com';",
    expect('(SELECT count(*) FROM public.player_schedule_events)=0', 'owner can remove schedule'),
    'RESET ROLE; ROLLBACK;',
);

const result = spawnSync('psql', args, { input: sql.join('\n'), encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
console.log(`PostgreSQL: ${contracts.size} table access contracts, ${sequences.size} sequences, FIP column restrictions and role/RLS scenarios passed with automatic grants disabled.`);
