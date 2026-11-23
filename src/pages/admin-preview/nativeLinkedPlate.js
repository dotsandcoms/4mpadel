const resolvedOpeningStatus = ['completed', 'walkover', 'retired'];
const published = ['published', 'in_progress', 'completed'];

export function canEnableSilverPlate(draw, matches, eventDraws) {
  const rules = draw.scoring_rules;
  const plateMode = rules?.plate_mode ?? 'none';
  return draw.draw_kind === 'main' && ['knockout', 'group_knockout'].includes(draw.format)
    && published.includes(draw.status) && Boolean(draw.updated_at) && draw.tournament_divisions?.is_active !== false
    && rules && typeof rules === 'object' && !Array.isArray(rules) && (plateMode === 'none' || Array.isArray(plateMode) && plateMode.length === 0)
    && matches.some(match => match.stage === 'knockout')
    && !matches.some(match => match.round_code?.startsWith('places_'))
    && !eventDraws.some(item => item.division_id === draw.division_id && item.draw_kind === 'silver');
}

export function linkedPlateKind(draw, matches) {
  if (!published.includes(draw.status) || draw.tournament_divisions?.is_active === false) return null;
  const mode = draw.scoring_rules?.plate_mode;
  if (draw.draw_kind === 'silver' && draw.format === 'knockout' && mode === 'triple') return 'bronze';
  if (draw.draw_kind === 'main' && ['knockout', 'group_knockout'].includes(draw.format) && ['double', 'triple'].includes(mode)
    && !matches.some(match => match.stage === 'placement' && match.round_code?.startsWith('places_'))) return 'silver';
  return null;
}

export function prepareLinkedPlate(draw, matches, entries) {
  const kind = linkedPlateKind(draw, matches);
  if (!kind) return null;
  const knockout = matches.filter(match => match.stage === 'knockout');
  const firstRound = Math.min(...knockout.map(match => Number(match.round_number)));
  const opening = knockout.filter(match => Number(match.round_number) === firstRound);
  if (!opening.length || opening.some(match => !resolvedOpeningStatus.includes(match.status)
    || !match.winner_entry_id || ![match.entry_one_id, match.entry_two_id].includes(match.winner_entry_id) || !match.updated_at)) {
    return { kind, issue: 'Complete every opening-round result before creating the linked plate.' };
  }
  const losers = new Set(opening.filter(match => match.entry_one_id && match.entry_two_id)
    .map(match => match.winner_entry_id === match.entry_one_id ? match.entry_two_id : match.entry_one_id));
  const entrants = entries.filter(entry => losers.has(entry.id) && entry.status !== 'withdrawn');
  if (entrants.length < 2 || losers.size !== entrants.length) {
    return { kind, issue: 'At least two eligible opening-round losing teams are required.' };
  }
  return {
    kind,
    teams: entrants.map(entry => entry.team_name),
    versions: Object.fromEntries(opening.map(match => [match.id, match.updated_at])),
  };
}
