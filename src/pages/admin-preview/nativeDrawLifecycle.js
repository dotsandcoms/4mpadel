const completeStatuses = ['completed', 'walkover', 'retired', 'cancelled'];

export function canCompleteNativeDraw(draw, matches) {
  return ['published', 'in_progress'].includes(draw.status) && draw.format !== 'americano'
    && (draw.format !== 'group_knockout' || matches.some(match => match.stage === 'knockout'))
    && matches.some(match => match.entry_one_id && match.entry_two_id)
    && matches.every(match => completeStatuses.includes(match.status));
}

export function nativeCompletionReview(matches) {
  return matches.map(match => [match.id, match.status, match.updated_at]);
}

export async function completeReviewedNativeDraw({ client, event, draw, reviewed, matches, isCurrent, onAttempt }) {
  if (!isCurrent() || !canCompleteNativeDraw(draw, matches) || JSON.stringify(nativeCompletionReview(matches)) !== JSON.stringify(reviewed)) {
    throw new Error('The reviewed results changed or the draw still has unresolved matches.');
  }
  const completedAt = new Date().toISOString();
  onAttempt();
  const { data, error } = await client.from('draws').update({ status:'completed', completed_at:completedAt, updated_at:completedAt })
    .eq('id', draw.id).eq('event_id', event.id).eq('division_id', draw.division_id)
    .eq('status', draw.status).eq('updated_at', draw.updated_at).select('id,status').single();
  if (error || data?.id !== draw.id || data.status !== 'completed') throw error || new Error('Could not confirm completion of the selected draw.');
  return 'Draw marked complete.';
}
