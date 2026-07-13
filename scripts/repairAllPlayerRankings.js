/**
 * Bulk-repair players.rankings + players.points from live Rankedin leaderboards.
 *
 * Strategy: download each org/category list once, index by rankedin_id + name,
 * then patch every local player. Much more reliable than per-player query search.
 *
 * Usage:
 *   node scripts/repairAllPlayerRankings.js
 *   node scripts/repairAllPlayerRankings.js --only-bad
 *   node scripts/repairAllPlayerRankings.js --limit 50
 */
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Node 20 has no native WebSocket global that @supabase/realtime-js accepts,
// so it must be handed the `ws` package explicitly or client init throws.
const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    { realtime: { transport: WebSocket } }
);

const LISTS = [
    { orgId: 15809, orgName: 'SAPA ranking', type: 3, age: 82, ageLabel: 'Men-Main', match: 'Men-Doubles' },
    { orgId: 15809, orgName: 'SAPA ranking', type: 4, age: 83, ageLabel: 'Women-Main', match: 'Women-Doubles' },
    { orgId: 15809, orgName: 'SAPA ranking', type: 3, age: 3, ageLabel: 'Men Over 40', match: 'Men-Doubles' },
    { orgId: 15809, orgName: 'SAPA ranking', type: 3, age: 2, ageLabel: 'Men Over 35', match: 'Men-Doubles' },
    { orgId: 16317, orgName: 'Broll Pro Tour', type: 3, age: 82, ageLabel: 'Men-Main', match: 'Men-Doubles' },
    { orgId: 16317, orgName: 'Broll Pro Tour', type: 4, age: 83, ageLabel: 'Women-Main', match: 'Women-Doubles' },
    { orgId: 16482, orgName: 'SA Grand Tour', type: 3, age: 82, ageLabel: 'Men-Main', match: 'Men-Doubles' },
    { orgId: 16482, orgName: 'SA Grand Tour', type: 4, age: 83, ageLabel: 'Women-Main', match: 'Women-Doubles' },
    { orgId: 16482, orgName: 'SA Grand Tour', type: 3, age: 3, ageLabel: 'Men Over 40', match: 'Men-Doubles' },
];

const isBadRankings = (rankings) => {
    if (!Array.isArray(rankings) || rankings.length === 0) return true;
    return rankings.every((r) => !r.org || !String(r.org).trim());
};

// Orgs we actively refresh from live Rankedin lists — anything else (VybeSports,
// VAPC, H&MPADEL, PadelTravel, etc.) already stored on the player must be kept as-is
// or we silently wipe it out on every repair run.
const COVERED_ORGS = new Set(LISTS.map((l) => l.orgName));
const keepUncoveredRows = (rankings) =>
    (Array.isArray(rankings) ? rankings : []).filter((r) => !COVERED_ORGS.has(r.org));

async function fetchList({ orgId, type, age }) {
    const url = `https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=${orgId}&rankingType=${type}&ageGroup=${age}&weekFromNow=0&language=en&skip=0&take=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    return data.Payload || [];
}

async function fetchDetails(rankingParticipantId, ageGroup) {
    const url = `https://api.rankedin.com/v1/ranking/getparticipantpointsdetailsasync?id=${rankingParticipantId}&agegroup=${ageGroup}&weekfromnow=0&showAll=false&language=en&skip=0&take=100`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        return (json?.ParticipantWithPoints?.EventPoints?.Payload || []).map((ep) => ({
            date: ep.EventPoint?.Date || '',
            name: ep.EventName || ep.EventPoint?.EventName?.split('|')[0]?.trim() || '',
            class: ep.EventPoint?.EventName?.split('| Class:')[1]?.trim() || '',
            place: ep.EventPoint?.Standing || '',
            event_type: ep.EventPoint?.EventType === 4 ? 'tournament' : 'friendly',
            points: ep.EventPoint?.Points ? parseFloat(ep.EventPoint.Points) : 0,
        }));
    } catch {
        return [];
    }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
    const onlyBad = process.argv.includes('--only-bad');
    const limitArg = process.argv.indexOf('--limit');
    const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
    const skipDetails = process.argv.includes('--skip-details');

    console.log('Downloading Rankedin category lists…');
    /** @type {Map<string, Array>} keyed by rankedin_id and by lowercased name */
    const byId = new Map();
    const byName = new Map();

    for (const list of LISTS) {
        process.stdout.write(`  ${list.orgName} ${list.ageLabel}… `);
        const rows = await fetchList(list);
        console.log(`${rows.length} players`);
        for (const hit of rows) {
            const entryMeta = {
                list,
                hit,
                rank: String(hit.Standing),
                points: String(Math.round(parseFloat(hit.ParticipantPoints?.Points) || 0)),
                rpId: hit.Participant?.Id || hit.ParticipantPoints?.RankingParticipantId,
            };
            const rid = hit.RankedinId ? String(hit.RankedinId) : null;
            const nameKey = (hit.Name || '').trim().toLowerCase();
            if (rid) {
                if (!byId.has(rid)) byId.set(rid, []);
                byId.get(rid).push(entryMeta);
            }
            if (nameKey) {
                if (!byName.has(nameKey)) byName.set(nameKey, []);
                byName.get(nameKey).push(entryMeta);
            }
        }
        await sleep(200);
    }

    console.log('\nLoading local players…');
    const players = [];
    const PAGE = 500;
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('players')
            .select('id, name, rankings, rankedin_id, skill_rating, preferred_ranking, active_ranking_label, category')
            .eq('approved', true)
            .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        players.push(...data);
        if (data.length < PAGE) break;
    }

    let targets = players.filter((p) => p.rankedin_id || p.name);
    if (onlyBad) targets = targets.filter((p) => isBadRankings(p.rankings) || Number(p.skill_rating) === 26.94);
    targets = targets.slice(0, limit);
    console.log(`Repairing ${targets.length} players…`);

    let ok = 0;
    let miss = 0;
    let fail = 0;

    for (const player of targets) {
        try {
            const rid = player.rankedin_id ? String(player.rankedin_id) : null;
            const nameKey = (player.name || '').trim().toLowerCase();
            const matches = [
                ...(rid && byId.has(rid) ? byId.get(rid) : []),
                ...(nameKey && byName.has(nameKey) ? byName.get(nameKey) : []),
            ];
            // de-dupe by org+age
            const seen = new Set();
            const unique = [];
            for (const m of matches) {
                const key = `${m.list.orgId}|${m.list.age}|${m.list.type}`;
                if (seen.has(key)) continue;
                seen.add(key);
                unique.push(m);
            }

            if (!unique.length) {
                miss++;
                continue;
            }

            const rankings = keepUncoveredRows(player.rankings);
            for (const m of unique) {
                // Fetch tournament breakdown for Main lists (what Rankings modal shows);
                // skip for secondary age bands to keep the repair fast.
                const wantDetails = !skipDetails && /main/i.test(m.list.ageLabel);
                const details = wantDetails && m.rpId ? await fetchDetails(m.rpId, m.list.age) : [];
                if (wantDetails) await sleep(40);
                rankings.push({
                    rank: m.rank,
                    org: m.list.orgName,
                    age_group: m.list.ageLabel,
                    points: m.points,
                    match_type: m.list.match,
                    details,
                });
            }

            const woman = /women|ladies|female/i.test(`${player.category || ''} ${player.name || ''}`)
                || rankings.some((r) => /women/i.test(r.age_group));
            const mainLabel = woman ? 'Women-Main' : 'Men-Main';
            const main = rankings.find((r) => r.org === 'SAPA ranking' && r.age_group === mainLabel)
                || rankings.find((r) => r.org === 'SAPA ranking' && /main/i.test(r.age_group));

            const patch = {
                rankings,
                // Fall back to the freshest matched list row, never a preserved
                // uncovered-org row, so points/rank_label reflect the covered orgs.
                points: main ? Number(main.points) : Number(unique[0]?.points) || 0,
                rank_label: main?.rank || unique[0]?.rank || null,
            };
            if (main) {
                patch.preferred_ranking = `SAPA ranking|${main.age_group}|Doubles`;
                patch.active_ranking_label = `SAPA ranking - ${main.age_group}`;
            }
            if (Number(player.skill_rating) === 26.94) patch.skill_rating = null;

            const { error } = await supabase.from('players').update(patch).eq('id', player.id);
            if (error) throw error;
            ok++;
            if (ok <= 30 || ok % 25 === 0) {
                console.log(`✓ ${player.name}: ${patch.points} pts · ${rankings.length} rows`);
            }
        } catch (err) {
            fail++;
            console.error(`× ${player.name}: ${err.message}`);
        }
    }

    console.log(`\nDone. Updated ${ok}, not on lists ${miss}, failed ${fail}.`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
