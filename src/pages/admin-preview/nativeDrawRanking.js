import { deriveKnockoutPlacementProposals } from '../../utils/nativeDrawPlacements.js';
import { buildRankingAwardRows, pricePlacement } from '../../utils/matchResult.js';
import { readAll } from './playersData.js';

const rankedDraw = draw => draw.draw_kind === 'main' && draw.status === 'completed' && ['knockout', 'group_knockout'].includes(draw.format);

export { rankedDraw as canReviewNativeRanking };

async function getRow(query) {
  const { data, error } = await query.single();
  if (error || !data) throw error || new Error('The record is no longer available.');
  return data;
}

export async function readNativeRankingReview({ client, event, draw, signal }) {
  if (!rankedDraw(draw)) throw new Error('Complete the main knockout draw before reviewing ranking points.');
  const [division, checkedEvent] = await Promise.all([
    getRow(client.from('tournament_divisions').select('id,event_id,ranking_tier_id,ranking_category').eq('id', draw.division_id).eq('event_id', event.id)),
    getRow(client.from('calendar').select('id,start_date').eq('id', event.id)),
  ]);
  if (!division.ranking_tier_id || !division.ranking_category) return { issue: 'Set this division’s ranking tier and category in Event Builder first.' };

  const [tier, rules, entries, matches, existing] = await Promise.all([
    getRow(client.from('ranking_tiers').select('id,code,name').eq('id', division.ranking_tier_id)),
    readAll(() => client.from('ranking_points_table').select('id,round_code,round_label,points,display_order')
      .eq('tier_id', division.ranking_tier_id).eq('category', Number(division.ranking_category)).order('display_order'), signal),
    readAll(() => client.from('draw_entries').select('id,team_name,player_one_id,player_one_name,player_two_id,player_two_name').eq('draw_id', draw.id).order('id'), signal),
    readAll(() => client.from('draw_matches').select('id,stage,round_code,round_number,status,winner_entry_id,loser_entry_id').eq('draw_id', draw.id).order('id'), signal),
    readAll(() => client.from('player_ranking_points').select('id,player_id').eq('event_id', event.id).eq('division_id', draw.division_id).order('id'), signal),
  ]);
  if (matches.some(match => !['completed', 'walkover', 'retired', 'cancelled'].includes(match.status))) return { issue: 'Resolve the remaining match results before awarding ranking points.' };
  if (!rules.length) return { issue: 'The selected ranking tier has no points rules for this category.' };
  const proposals = deriveKnockoutPlacementProposals({ entries, matches, tierCode: tier.code })
    .map(proposal => pricePlacement(proposal, rules, draw.scoring_rules?.ranking_points));
  if (!proposals.length) return { issue: 'This draw has no final knockout placements to review.' };
  return { event: checkedEvent, draw, division, tier, rules, proposals, existing };
}

export function planNativeRankingAwards(snapshot, overrides, awardedAt) {
  if (snapshot.issue) return { issue: snapshot.issue, rows: [], proposals: [] };
  const rules = new Map(snapshot.rules.map(rule => [rule.round_code, rule]));
  const awarded = new Set(snapshot.existing.map(row => String(row.player_id)));
  const selected = snapshot.proposals.map(proposal => {
    const override = proposal.requiresManualPlacement && overrides[proposal.entry_id];
    const current = override ? { ...proposal, selectedRoundCode: override, pointsRule: rules.get(override) } : proposal;
    const players = [
      { id: current.entry.player_one_id, name: current.entry.player_one_name },
      { id: current.entry.player_two_id, name: current.entry.player_two_name },
    ].filter(player => player.name || player.id).map(player => ({ ...player, awarded: awarded.has(String(player.id)) }));
    return { ...current, players };
  });
  const missing = selected.flatMap(item => item.players.filter(player => !player.id).map(player => player.name));
  const pending = selected.flatMap(proposal => proposal.players.filter(player => player.id && !player.awarded).map(player => ({ ...player, proposal })));
  let issue;
  if (missing.length) issue = 'Link the 4M profiles before awarding points for ' + missing.join(', ') + '.';
  else if (selected.some(item => !item.selectedRoundCode || !item.pointsRule)) issue = 'Review a points rule for every placement.';
  else if (new Set(pending.map(row => String(row.id))).size !== pending.length) issue = 'A player appears in multiple placements. Review the draw first.';
  const rows = issue ? [] : buildRankingAwardRows({
    playerRows: pending, event: snapshot.event, draw: snapshot.draw, divisionId: snapshot.division.id,
    tier: snapshot.tier, category: snapshot.division.ranking_category, awardedAt,
  });
  return { issue, proposals: selected, rows };
}

export async function insertReviewedNativeAwards({ client, event, draw, operation, isCurrent, onAttempt, signal }) {
  const fresh = await readNativeRankingReview({ client, event, draw, signal });
  const plan = planNativeRankingAwards(fresh, operation.overrides, operation.awardedAt);
  if (plan.issue || !plan.rows.length || !isCurrent() || JSON.stringify(plan.rows) !== JSON.stringify(operation.rows)) {
    throw new Error(plan.issue || 'The placements, rules or award ledger changed. Reopen the review before awarding points.');
  }
  onAttempt();
  const { data, error } = await client.from('player_ranking_points').insert(plan.rows).select('id,player_id');
  if (error) throw error;
  const returned = new Set(data?.filter(row => row.id).map(row => String(row.player_id)));
  if (returned.size !== plan.rows.length || !plan.rows.every(row => returned.has(String(row.player_id)))) {
    throw new Error('The ranking ledger response could not verify every reviewed award.');
  }
  return plan.rows.length + (plan.rows.length === 1 ? ' player award recorded.' : ' player awards recorded.');
}
