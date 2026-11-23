import { appendFile } from 'node:fs/promises';
import { pilotTargets, previewArchive, syncArchive } from './lib/rankedin-history-worker.mjs';

const projects = {
    production: 'uzglrpbixubfijvjbtgz',
    staging: 'cefmzkwabdqqoagxhekc',
};

function createDatabase(url, key) {
    async function rpc(operation, parameters = {}) {
        const headers = { apikey: key, 'content-type': 'application/json' };
        if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
        let response;
        try {
            response = await fetch(new URL('/rest/v1/rpc/rankedin_history_' + operation, url), {
                method: 'POST', headers, body: JSON.stringify(parameters), signal: AbortSignal.timeout(12000),
            });
        } catch {
            throw new Error('Supabase connection failed for ' + operation);
        }
        if (!response.ok) throw new Error('Supabase ' + operation + ' returned HTTP ' + response.status);
        return response.json();
    }
    return {
        status: () => rpc('status'),
        seed: (includeTargets, targets) => rpc('seed', { p_targets: includeTargets, p_pilot: targets }),
        claim: () => rpc('claim'),
        finish: (task, page) => rpc('finish', {
            p_key: task.key, p_lease: task.lease_id, p_state: page.state, p_next_seconds: page.nextSeconds,
            p_cursor: page.cursor ?? {}, p_issue: page.issue ?? null,
            p_records: page.records ?? [], p_jobs: page.jobs ?? [],
        }),
    };
}

async function run() {
    const target = process.env.RANKEDIN_HISTORY_TARGET ?? 'staging';
    if (!Object.hasOwn(projects, target)) throw new Error('Select the staging or production archive.');
    const targets = pilotTargets(process.env.RANKEDIN_HISTORY_PILOT_TARGETS);
    const dryRun = process.env.RANKEDIN_HISTORY_DRY_RUN !== 'false';
    const url = process.env.RANKEDIN_HISTORY_SUPABASE_URL;
    const key = process.env.RANKEDIN_HISTORY_SUPABASE_KEY;
    if (url && (new URL(url).origin !== 'https://' + projects[target] + '.supabase.co'
        || new URL(url).username || new URL(url).password)) {
        throw new Error('The Supabase URL does not match the selected archive.');
    }
    const database = url && key ? createDatabase(url, key) : undefined;
    if (!database && (!dryRun || !targets.length)) throw new Error('The selected archive needs a Supabase worker credential.');
    if (!dryRun && target === 'production' && process.env.GITHUB_EVENT_NAME === 'schedule'
        && process.env.RANKEDIN_HISTORY_ENABLED !== 'true') throw new Error('Scheduled production writes are disabled.');
    const deadline = Date.now() + (dryRun ? 180000 : 480000);
    const report = dryRun
        ? await previewArchive(database, targets, { deadline })
        : await syncArchive(database, { deadline, targets, maxPages: targets.length ? 60 : 600 });
    const json = JSON.stringify(report, null, 2);
    console.log(json);
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, '## Rankedin History Sync\n\n```json\n' + json + '\n```\n');
    }
}

run().catch(error => {
    console.error(error instanceof Error ? error.message : 'Rankedin history sync failed');
    process.exitCode = 1;
});
