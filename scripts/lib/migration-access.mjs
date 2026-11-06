import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Split top-level SQL only: comments, quoted strings and function bodies can
// contain semicolons and GRANT text that must never count as table access.
export function splitSql(source) {
    const result = [];
    let statement = '';
    for (let i = 0; i < source.length;) {
        if (source.startsWith('--', i)) {
            const end = source.indexOf('\n', i);
            i = end < 0 ? source.length : end + 1;
            statement += '\n';
        } else if (source.startsWith('/*', i)) {
            let depth = 1;
            i += 2;
            while (i < source.length && depth) {
                if (source.startsWith('/*', i)) { depth++; i += 2; }
                else if (source.startsWith('*/', i)) { depth--; i += 2; }
                else i++;
            }
            if (depth) throw new Error('Unclosed SQL comment');
            statement += ' ';
        } else if (source[i] === "'" || source[i] === '"') {
            const quote = source[i];
            const start = i++;
            const escaped = quote === "'" && /(?:^|\W)[eE]$/.test(source.slice(Math.max(0, start - 2), start));
            let closed = false;
            while (i < source.length) {
                if (escaped && source[i] === '\\') i += 2;
                else if (source[i++] === quote) {
                    if (source[i] === quote) i++;
                    else { closed = true; break; }
                }
            }
            if (!closed) throw new Error('Unclosed SQL quote');
            statement += source.slice(start, i);
        } else if (source[i] === '$' && /^\$(?:[a-z_][a-z_0-9]*)?\$/i.test(source.slice(i))) {
            const tag = source.slice(i).match(/^\$(?:[a-z_][a-z_0-9]*)?\$/i)[0];
            const end = source.indexOf(tag, i + tag.length);
            if (end < 0) throw new Error('Unclosed SQL function body');
            statement += source.slice(i, end + tag.length);
            i = end + tag.length;
        } else if (source[i] === ';') {
            if (statement.trim()) result.push(statement.trim());
            statement = '';
            i++;
        } else statement += source[i++];
    }
    if (statement.trim()) result.push(statement.trim());
    return result;
}

const identifier = '(?:"(?:[^"]|"")*"|[a-z_][a-z_0-9]*)';
const qualifiedName = `${identifier}(?:\\s*\\.\\s*${identifier})?`;
export const normalizeName = name => name.replaceAll('"', '').replace(/\s/g, '').toLowerCase();
export const publicName = name => name.includes('.') ? normalizeName(name) : `public.${normalizeName(name)}`;

export function createdTable(statement) {
    const match = statement.match(new RegExp(`^create\\s+(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?(${qualifiedName})(?=\\s|\\()`, 'i'));
    return match ? publicName(match[1]) : null;
}

export function tableAccess(statement) {
    const match = statement.match(/^(grant|revoke)\s+([\s\S]+?)\s+on\s+(?:(table|sequence)\s+)?([\s\S]+?)\s+(?:to|from)\s+([\s\S]+)$/i);
    if (!match || /^(?:function|all\s|schema)\b/i.test(match[4])) return null;
    const tables = match[4].split(',').map(publicName);
    if (tables.some(name => !new RegExp(`^${identifier}\\.${identifier}$`, 'i').test(name))) return null;
    return {
        action: match[1].toLowerCase(), kind: match[3]?.toLowerCase() || 'table',
        privileges: match[2].trim().toLowerCase(), tables,
        roles: match[5].split(',').map(normalizeName), statement,
    };
}

export function migrationFiles(root = process.cwd()) {
    return ['supabase/migrations', 'mobile/supabase/migrations'].flatMap(folder =>
        readdirSync(resolve(root, folder)).filter(name => name.endsWith('.sql')).sort().map(name => {
            const file = `${folder}/${name}`;
            const statements = splitSql(readFileSync(resolve(root, file), 'utf8'));
            return { file, statements, tables: statements.map(createdTable).filter(name => name?.startsWith('public.')) };
        }),
    );
}

export function tablePrivileges(access, role) {
    const result = new Set();
    for (const acl of access.filter(item => item.kind === 'table' && (item.roles.includes(role) || item.roles.includes('public')))) {
        // Column grants are checked separately; they do not imply table access.
        if (acl.privileges.includes('(')) continue;
        const privileges = /^all(?:\s+privileges)?$/.test(acl.privileges)
            ? ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
            : acl.privileges.split(',').map(value => value.trim());
        for (const privilege of privileges) {
            if (acl.action === 'grant') result.add(privilege);
            else result.delete(privilege);
        }
    }
    return [...result].filter(value => ['select', 'insert', 'update', 'delete'].includes(value)).sort();
}
