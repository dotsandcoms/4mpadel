import { sampleTournament } from './data.js';
import { CAPABILITIES } from '../../src/utils/tournament/permissions.js';
import { scheduleIssues } from '../../src/utils/tournament/scheduling.js';
import { calculateGroupStandings } from '../../src/utils/nativeDrawStandings.js';
const key = '4m-tournament-manager-demo-v1';
let state;
try { state = JSON.parse(localStorage.getItem(key)); } catch { /* Fresh synthetic fixture. */ }
if (!state) state = sampleTournament();
let caps = Object.keys(CAPABILITIES);
const clone = value => structuredClone(value);
const persist = () => localStorage.setItem(key, JSON.stringify(state));
const audit = action => { state.audit.unshift({ id: crypto.randomUUID(), action, created_at: new Date().toISOString(), details: {} }); persist(); };
export const setDemoRole = next => { caps = next; };
export const resetDemo = (scenario) => { state = sampleTournament(scenario); persist(); };
export const demoClient = {
    saveRegistration: async (_, division, registration, payload) => {
        if (state.draws.some(d => d.division_id === division && d.status !== 'draft')) throw new Error('Published entrants are locked.');
        const r = state.registrations.find(r => r.id === registration?.id);
        if (r) Object.assign(r, { full_name: payload.full_name, email: payload.email, partner_name: payload.partner_name, partner_email: payload.partner_email });
        else state.registrations.push({ id: crypto.randomUUID(), event_id: state.event.id, division_id: division, ...payload, payment_status: 'pending', status: 'registered' });
        const c = state.confirmations.find(c => c.division_id === division); if (c) { c.players_confirmed_at = null; c.seeds_confirmed_at = null; c.revision++; }
        audit('registration.saved');
    },
    saveDivision: async (_, id, name, active) => { const d = state.divisions.find(d => d.id === id); if (d) Object.assign(d, { name, is_active: active }); else state.divisions.push({ id: crypto.randomUUID(), name, is_active: active, event_id: state.event.id }); audit('division.saved'); },
    qualify: async (_, draw, matches) => {
        state.matches.push(...matches.map(m => ({ ...m, draw_id: draw.id, updated_at: new Date().toISOString() })));
        for (const m of matches) { const key = draw.id + ':future:' + m.key; const a = state.schedule?.assignments[key]; if (a) { state.schedule.assignments[m.id] = a; delete state.schedule.assignments[key]; if (state.schedule.published_revision) Object.assign(state.matches.find(x => x.id === m.id), a); } }
        state.sourceFingerprint = crypto.randomUUID(); if (state.schedule) state.schedule.source_fingerprint = state.sourceFingerprint; audit('groups.qualified');
    },
    list: async () => [{ ...state.event, capabilities: caps }],
    load: async () => ({ ...clone(state), capabilities: caps, registrations: caps.some(c => ['players', 'seeds', 'draws', 'finance'].includes(c)) ? clone(state.registrations) : [], players: caps.some(c => ['players', 'seeds', 'draws'].includes(c)) ? clone(state.players) : [] }),
    saveSettings: async (_, settings, days) => { state.settings = clone(settings); state.playDays = clone(days); state.settingsRevision++; state.sourceFingerprint = crypto.randomUUID(); audit('settings.saved'); },
    confirm: async (_, division, kind, payload) => {
        let c = state.confirmations.find(c => c.division_id === division);
        if (!c) { c = { division_id: division, revision: 0, review: {}, configuration: {} }; state.confirmations.push(c); }
        if (kind === 'players') { c.review = clone(payload); c.players_valid = true; c.seeds_confirmed_at = null; }
        if (kind === 'seeds') c.review.seeds = clone(payload.seeds);
        if (kind === 'format') c.configuration = clone(payload);
        c[kind + '_confirmed_at'] = new Date().toISOString(); c.revision++; audit(kind + '.confirmed');
    },
    saveDraw: async (_, division, payload) => {
        let d = state.draws.find(d => d.division_id === division);
        if (d && d.status !== 'draft') throw new Error('Published draw is locked.');
        if (!d) { d = { id: crypto.randomUUID(), event_id: state.event.id, division_id: division, draw_kind: 'main' }; state.draws.push(d); }
        d.format = payload.format; d.status = 'draft'; d.updated_at = new Date().toISOString(); d.scoring_rules = { ...state.confirmations.find(c => c.division_id === division).configuration, ...(payload.rotation ? { americano: payload.rotation } : {}) };
        d.group_count = d.scoring_rules.groups; d.advancers_per_group = d.scoring_rules.advancers;
        state.entries = state.entries.filter(e => e.draw_id !== d.id).concat(payload.entries.map(e => ({ ...e, draw_id: d.id })));
        state.matches = state.matches.filter(m => m.draw_id !== d.id).concat(payload.matches.map(m => ({ ...m, draw_id: d.id, updated_at: d.updated_at })));
        if (payload.rotation) state.matches.push(...payload.rotation.fixtures.map(f => ({ id: crypto.randomUUID(), draw_id: d.id, americano_fixture_key: f.id, stage: 'group', round_number: f.round, round_label: 'Round ' + f.round, bracket_position: f.wave, status: 'pending', updated_at: d.updated_at })));
        state.sourceFingerprint = crypto.randomUUID(); audit('draw.saved');
    },
    publishDraw: async (_, draw) => { state.draws.find(d => d.id === draw.id).status = 'published'; state.sourceFingerprint = crypto.randomUUID(); audit('draw.published'); },
    saveSchedule: async (_, plan) => {
        const issues = scheduleIssues({ ...plan, playDays: state.playDays });
        if (issues.length) throw new Error(issues[0]);
        state.schedule = { ...state.schedule, ...clone(plan), status: 'draft', source_fingerprint: state.sourceFingerprint, revision: (state.schedule?.revision || 0) + 1 }; audit('schedule.draft_saved');
    },
    publishSchedule: async () => {
        if (!state.schedule) throw new Error('Save the schedule first.');
        for (const m of state.matches) Object.assign(m, state.schedule.assignments[m.id], { status: m.status === 'pending' ? 'scheduled' : m.status });
        state.schedule.status = 'published'; state.schedule.published_revision = state.schedule.revision; audit('schedule.published');
    },
    result: async (_, match, result) => {
        if (!caps.includes('results')) throw new Error('No results access.');
        const m = state.matches.find(m => m.id === match.id);
        if (result.kind === 'live') {
            if (!state.schedule?.published_revision) throw new Error('Publish the schedule first.');
            m.status = 'in_progress'; audit('match.started'); return;
        }
        if (['completed', 'walkover', 'retired'].includes(m.status) && (!caps.includes('corrections') || !result.reason?.trim())) throw new Error('Corrections require permission and a reason.');
        const draw = state.draws.find(d => d.id === m.draw_id);
        if (m.americano_fixture_key) { if (!result.score || result.score.some(s => !Number.isInteger(s) || s < 0) || result.score[0] + result.score[1] !== draw.scoring_rules.americano.points) throw new Error('Enter the correct rally-point total.'); draw.scoring_rules.americano.fixtures.find(f => f.id === m.americano_fixture_key).score = result.score; m.status = 'completed'; audit('result.recorded'); return; }
        const played = result.kind === 'played';
        const sets = result.sets || [];
        const wins = [sets.filter(s => s[0] > s[1]).length, sets.filter(s => s[1] > s[0]).length];
        if (played && (Math.max(...wins) !== (draw.scoring_rules.sets_to_win || 2) || (result.winner === m.entry_one_id ? wins[0] <= wins[1] : wins[1] <= wins[0]))) throw new Error('The score must agree with the winner.');
        m.winner_entry_id = result.winner; m.loser_entry_id = m.entry_one_id === result.winner ? m.entry_two_id : m.entry_one_id;
        m.status = played ? 'completed' : result.kind === 'retirement' ? 'retired' : 'walkover'; m.updated_at = new Date().toISOString();
        state.sets = state.sets.filter(s => s.match_id !== m.id).concat(sets.map((s, i) => ({ match_id: m.id, set_number: i + 1, entry_one_games: s[0], entry_two_games: s[1] })));
        for (const type of ['winner', 'loser']) { const next = state.matches.find(n => n.id === m[type + '_to_match_id']); if (next) next[m[type + '_to_slot'] === 1 ? 'entry_one_id' : 'entry_two_id'] = m[type + '_entry_id']; }
        if (m.group_id) state.standings = state.standings.filter(s => s.group_id !== m.group_id).concat(calculateGroupStandings({ entries: state.entries, matches: state.matches, matchSets: state.sets, groupId: m.group_id }));
        audit('result.recorded');
    },
    finalise: async (_, division) => { state.finalisations.push({ division_id: division, valid: true }); audit('division.finalised'); },
    access: async (_, email, capabilities) => { state.access = state.access.filter(p => p.email !== email).concat({ user_id: crypto.randomUUID(), email, capabilities }); audit('access.updated'); },
};
// The demo's Vite resolver redirects ALL Supabase imports here.
export const supabase = { rpc: async () => { throw new Error('Hosted services are disabled in the local demo.'); } };
export const isSupabaseConfigured = () => false;
