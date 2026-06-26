/**
 * Fix a user's login email in Supabase Auth (auth.users + auth.identities).
 *
 * Usage:
 *   node scripts/fix-user-email.mjs <wrongEmail> <correctEmail>
 *
 * Example:
 *   node scripts/fix-user-email.mjs chels.stewatd@gmail.com chels.stewart@gmail.com
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY from .env.
 * Uses the Admin API so the email/password identity is updated too, and
 * confirms the new address (no confirmation email is sent).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- tiny .env loader (no dependency) ---
function loadEnv(path) {
    const out = {};
    let raw = '';
    try {
        raw = readFileSync(path, 'utf8');
    } catch {
        return out;
    }
    for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        out[m[1]] = val;
    }
    return out;
}

const env = loadEnv(resolve(__dirname, '..', '.env'));
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const [, , wrongEmail, correctEmail] = process.argv;

function fail(msg) {
    console.error(`\n❌ ${msg}\n`);
    process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_KEY) fail('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env');
if (!wrongEmail || !correctEmail) fail('Usage: node scripts/fix-user-email.mjs <wrongEmail> <correctEmail>');

const norm = (s) => String(s || '').trim().toLowerCase();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
    const target = norm(email);
    const perPage = 1000;
    for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const users = data?.users || [];
        const match = users.find((u) => norm(u.email) === target);
        if (match) return match;
        if (users.length < perPage) break; // last page
    }
    return null;
}

(async () => {
    console.log(`\nLooking up ${wrongEmail} …`);
    const user = await findUserByEmail(wrongEmail);
    if (!user) fail(`No auth user found with email ${wrongEmail}`);

    const clash = await findUserByEmail(correctEmail);
    if (clash && clash.id !== user.id) {
        fail(`Another auth user already uses ${correctEmail} (id ${clash.id}). Resolve the duplicate first.`);
    }

    console.log(`Found user id ${user.id} (current: ${user.email}). Updating → ${correctEmail} …`);
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        email: correctEmail,
        email_confirm: true,
    });
    if (error) fail(`Update failed: ${error.message}`);

    console.log(`\n✅ Done. Login email is now: ${data.user.email}`);
    console.log('She can now sign in with the corrected address (existing password unchanged).');
    console.log('If she does not know her password, send a reset from Authentication → Users, or your app\'s "forgot password" flow.\n');
})().catch((e) => fail(e.message));
