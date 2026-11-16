import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationFiles, splitSql, createdTable, tableAccess, tablePrivileges } from '../scripts/lib/migration-access.mjs';

import { contracts } from './fixtures/data-api-access.mjs';

const files = migrationFiles();
test('every public table creation declares RLS and all three API role decisions in the same migration', () => {
    for (const { file, statements, tables } of files) {
        const acls = statements.map(tableAccess).filter(Boolean);
        for (const table of tables) {
            assert.ok(contracts.has(table), `${file}: add a reviewed access contract for ${table}`);
            const access = acls.filter(item => item.kind === 'table' && item.tables.includes(table));
            const name = table.replace('public.', '');
            assert.ok(statements.some(sql => new RegExp(`^alter\\s+table\\s+(?:public\\.)?${name}\\s+enable\\s+row\\s+level\\s+security$`, 'i').test(sql)), `${file}: enable RLS for ${table}`);
            for (const role of ['anon', 'authenticated', 'service_role']) {
                assert.ok(access.some(item => item.roles.includes(role)), `${file}: explicit GRANT or REVOKE missing for ${role} on ${table}`);
                assert.deepEqual(tablePrivileges(access, role), contracts.get(table)[role], `${file}: unexpected ${role} access to ${table}`);
            }
        }
    }
    assert.deepEqual([...new Set(files.flatMap(file => file.tables))].sort(), [...contracts.keys()].sort(), 'remove stale contracts when dropping/renaming a table');
});

test('identity and serial sequences explicitly grant service worker usage', () => {
    for (const { file, statements } of files) {
        for (const sql of statements) {
            const table = createdTable(sql);
            if (!table?.startsWith('public.')) continue;
            for (const [, column] of sql.matchAll(/\b(\w+)\s+(?:(?:big|small)?serial\b|(?:bigint|integer|smallint)\s+generated\s+(?:always|by\s+default)\s+as\s+identity)/gi)) {
                const sequence = `${table}_${column}_seq`;
                assert.ok(statements.map(tableAccess).some(acl => acl?.kind === 'sequence' && acl.action === 'grant' && acl.tables.includes(sequence) && acl.roles.includes('service_role') && /\busage\b|^all\b/.test(acl.privileges)), `${file}: service_role needs USAGE on ${sequence}`);
            }
        }
    }
});

test('SQL inventory ignores commented examples and function bodies, and handles quoted/unqualified tables', () => {
    const sql = splitSql(`-- CREATE TABLE ignored(id int);\n/* outer /* nested */ CREATE TABLE hidden(id int); */
        CREATE TABLE IF NOT EXISTS "public"."visible" (value text DEFAULT 'semi;colon');
        CREATE FUNCTION f() RETURNS void AS $body$ BEGIN GRANT ALL ON hidden TO anon; END; $body$ LANGUAGE plpgsql;
        GRANT SELECT ON TABLE public.visible, other TO anon, authenticated;
        REVOKE ALL ON public.visible FROM PUBLIC, anon;
        CREATE TABLE plain(id int);`);
    assert.deepEqual(sql.map(createdTable).filter(Boolean), ['public.visible', 'public.plain']);
    assert.equal(sql.map(tableAccess).filter(Boolean).length, 2);
    assert.deepEqual(tableAccess(sql[2]).tables, ['public.visible', 'public.other']);
    assert.deepEqual(tablePrivileges(sql.map(tableAccess).filter(Boolean), 'anon'), []);
});
