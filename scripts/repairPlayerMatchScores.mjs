import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHistoryRepair } from './lib/matchCacheRepair.js';

const write = process.argv.includes('--write');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function all(table, columns, order) {
    const rows = [];
    for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from(table).select(columns).order(order).range(from, from + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
    }
}
const [rows, events] = await Promise.all([
    all('player_matches', 'rankedin_id,past_matches,updated_at', 'rankedin_id'),
    all('calendar', 'id,event_name,rankedin_id', 'id'),
]);
const backup = join(tmpdir(), `4m-match-repair-${Date.now()}.json`);
writeFileSync(backup, JSON.stringify(rows), { mode: 0o600 });
const repair = createHistoryRepair(events, async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`RankedIn ${response.status}: ${url}`);
    return response.json();
});
let profiles = 0, repaired = 0, unresolved = 0, conflicts = 0;
const remaining = {};
for (const row of rows) {
    const result = await repair(row.past_matches);
    for (const m of result.matches) if (!m.Score?.Score?.length) {
        unresolved++;
        const event = m.Info?.EventName || 'Unknown';
        remaining[event] = (remaining[event] || 0) + 1;
    }
    if (!result.repaired) continue;
    if (write) {
        let query = supabase.from('player_matches').update({ past_matches: result.matches })
            .eq('rankedin_id', row.rankedin_id);
        query = row.updated_at ? query.eq('updated_at', row.updated_at) : query.is('updated_at', null);
        const { data, error } = await query.select('rankedin_id');
        if (error) throw error;
        if (!data.length) { conflicts++; continue; }
        const { data: check, error: verifyError } = await supabase.from('player_matches').select('past_matches').eq('rankedin_id', row.rankedin_id).single();
        if (verifyError) throw verifyError;
        if (JSON.stringify(check.past_matches.map(m => m.Score)) !== JSON.stringify(result.matches.map(m => m.Score))) {
            // JSONB may reorder object keys; compare the actual score values instead.
            const scores = list => list.map(m => (m.Score?.Score || []).map(s => [s.Score1, s.Score2]));
            if (JSON.stringify(scores(check.past_matches)) !== JSON.stringify(scores(result.matches))) throw new Error(`Verification failed: ${row.rankedin_id}`);
        }
    }
    profiles++; repaired += result.repaired;
}
console.log(JSON.stringify({ mode: write ? 'write' : 'preview', scanned: rows.length, profiles, repaired, unresolved, conflicts, remaining, backup }, null, 2));
if (conflicts) process.exitCode = 1;
