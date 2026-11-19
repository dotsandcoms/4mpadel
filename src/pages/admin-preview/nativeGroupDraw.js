import { readAll } from './playersData.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';
import { drawTeamKey, editGroupTeams, groupSwapWarnings, hasGroupPlayStarted } from '../../utils/drawGroupEditing.js';
import { qualificationRules, rankGroupQualifiers } from '../../utils/drawQualification.js';
import { areGroupMatchesComplete } from '../../utils/nativeDrawStandings.js';
import { generateKnockoutDraft } from '../../utils/nativeDrawGenerator.js';
import { routeIds } from '../../utils/drawBackplates.js';

const inScope = (query, signal) => signal ? query.abortSignal(signal) : query;
const groupFormats = new Set(['group_knockout', 'group_only']);
const activeDrawStates = new Set(['draft', 'published', 'in_progress']);
const groupOf = match => match.group_id || match.group_key;
const versions = matches => Object.fromEntries(matches.map(match => [match.id, match.updated_at]));
const fixture = match => ({
  round_number: match.round_number, round_code: match.round_code, round_label: match.round_label, bracket_position: match.bracket_position,
});

export async function loadNativeGroupDraw({ client, event, division, drawId, expectedUserId, scopeId, signal }) {
  await verifyEventOperationAccess({ client, eventId: event.id, expectedUserId, scopeId, signal });
  const { data: draw, error } = await inScope(client.from('draws').select('*')
    .eq('id', drawId).eq('event_id', event.id).eq('division_id', division.id).single(), signal);
  if (error || !draw || !groupFormats.has(draw.format)) throw new Error('This group draw is no longer available.');
  const from = (table, columns, order) => readAll(() => client.from(table).select(columns).eq('draw_id', draw.id).order(order).order('id'), signal);
  const [entries, matchRows, groupRows, audit] = await Promise.all([
    from('draw_entries', '*', 'seed_number'),
    from('draw_matches', '*', 'round_number'),
    from('draw_groups', '*', 'display_order'),
    from('native_draw_edit_audit', 'id,action,undo_of,details,created_at,generation', 'created_at'),
  ]);
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  const matches = matchRows.map(row => ({ ...row, key: row.id, group_key: row.group_id,
    entry_one: entriesById.get(row.entry_one_id) || null, entry_two: entriesById.get(row.entry_two_id) || null,
    winner: entriesById.get(row.winner_entry_id) || null,
  }));
  const groups = groupRows.map(group => ({ ...group, entries: entries.filter(entry => entry.group_id === group.id) }));
  const matchIds = matchRows.filter(row => row.stage === 'group').map(row => row.id);
  const matchSets = [];
  for (let offset = 0; offset < matchIds.length; offset += 100) {
    matchSets.push(...await readAll(() => client.from('draw_match_sets').select('*')
      .in('match_id', matchIds.slice(offset, offset + 100)).order('match_id').order('set_number'), signal));
  }
  return { draw, groups, entries, matches, audit, matchSets };
}

export function previewNativeGroupEdit(snapshot, source, target) {
  if (!activeDrawStates.has(snapshot.draw.status) || snapshot.matches.some(match => match.stage !== 'group')) {
    throw new Error('The group draw is locked.');
  }
  const minimum = Number(snapshot.draw.advancers_per_group) || 1;
  const next = editGroupTeams(snapshot, source, target, minimum);
  const groups = [source.groupKey, target.groupKey];
  const belongs = match => groups.includes(groupOf(match));
  return {
    warnings: groupSwapWarnings(snapshot, next, groups),
    args: {
      p_draw: snapshot.draw.id, p_expected: snapshot.draw.updated_at,
      p_versions: versions(snapshot.matches.filter(belongs)),
      p_two_groups: groups, p_source: source.entry.id, p_target: target.entry?.id || null,
      p_fixtures: next.matches.filter(belongs).map(match => ({
        ...fixture(match), id: match.id || null, group_id: groupOf(match),
        entry_one_id: drawTeamKey(match.entry_one), entry_two_id: drawTeamKey(match.entry_two),
      })),
    },
  };
}

export function latestUndoableGroupEdit(snapshot) {
  if (hasGroupPlayStarted(snapshot.matches) || snapshot.matches.some(match => match.stage !== 'group')) return null;
  const audit = snapshot.audit.filter(entry => entry.generation === snapshot.draw.generated_at);
  const undone = new Set(audit.map(entry => entry.undo_of));
  const previous = audit.findLast(entry => entry.action === 'group_edit' && !undone.has(entry.id));
  if (!previous?.details?.source || !previous.details.target) return null;
  const findSlot = (side, name) => {
    const group = snapshot.groups.find(group => group.name === name);
    if (!group) return null;
    return { groupKey: group.id, position: group.name, entry: group.entries.find(entry => side.registration
      ? entry.source_registration_id === side.registration : drawTeamKey(entry) === side.id) };
  };
  const source = findSlot(previous.details.source, previous.details.target.group);
  const target = findSlot(previous.details.target, previous.details.source.group);
  return source?.entry && target && (!previous.details.target.name || target.entry) ? { source, target, undoOf: previous.id } : null;
}

export function currentGroupQualification(snapshot, overrideIds) {
  if (snapshot.draw.format !== 'group_knockout' || !['published', 'in_progress'].includes(snapshot.draw.status)
      || !snapshot.groups.length || snapshot.matches.some(match => match.stage !== 'group')
      || snapshot.groups.some(group => group.entries.length !== 1 && !areGroupMatchesComplete(snapshot.matches, group.id))) return null;
  const config = snapshot.draw.scoring_rules?.qualification;
  const rules = qualificationRules(config?.rules);
  const result = rankGroupQualifiers({ ...snapshot, mode: config?.mode || 'fixed', rules,
    places: Number(snapshot.draw.advancers_per_group) || 1, extras: Number(config?.extras) || 0, drawId: snapshot.draw.id, overrideIds });
  return result.advancing.length >= 2 ? { ...result, rules } : null;
}

export function prepareGroupElimination(snapshot, qualification, reason, newId = () => crypto.randomUUID()) {
  const knockout = generateKnockoutDraft(qualification.advancing, {
    seedingMethod: 'manual', placementPlayoff: snapshot.draw.scoring_rules?.playoff_mode || 'none',
    plateMode: snapshot.draw.scoring_rules?.plate_mode || 'none', separateGroups: true,
  });
  const ids = new Map(knockout.matches.map(match => [match.key, newId()]));
  const routes = routeIds(knockout.matches, match => ids.get(match.key));
  return {
    p_draw: snapshot.draw.id, p_expected: snapshot.draw.updated_at,
    p_versions: versions(snapshot.matches.filter(match => match.stage === 'group')),
    p_matches: knockout.matches.map(match => ({
      ...fixture(match), ...routes.get(match.key), id: ids.get(match.key), stage: match.stage,
      entry_one_id: match.entry_one?.id || null, entry_two_id: match.entry_two?.id || null,
      winner_entry_id: match.winner?.id || null, result_type: match.result_type,
    })),
    p_qualification: {
      advancing: qualification.advancing.map(entry => entry.id), bracket: knockout.draw_size,
      comparison: qualification.comparison, rules: qualification.rules, reason: reason || null,
    },
  };
}
