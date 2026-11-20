import { useEffect, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { loadNativeDrawRanking } from './nativeDrawOperations.js';
import { planNativeRankingAwards } from './nativeDrawRanking.js';

export default function NativeDrawRankingReview({ client, event, draw, session, scopeId, overrides, setOverrides, onReview }) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const userId = session?.user?.id;
  useEffect(() => {
    const controller = new AbortController();
    loadNativeDrawRanking({ client, event, draw, expectedUserId: userId, scopeId, signal: controller.signal, isCurrent: () => !controller.signal.aborted })
      .then(review => { if (!controller.signal.aborted) setSnapshot(review); })
      .catch(issue => { if (!controller.signal.aborted) setError(issue.message); });
    return () => controller.abort();
  }, [client, event, draw, scopeId, userId]);

  if (error) return <p role="alert">{error}</p>;
  if (!snapshot) return <p role="status">Checking final placements and recorded points…</p>;
  const plan = planNativeRankingAwards(snapshot, overrides, new Date().toISOString());
  const review = () => {
    const awardedAt = new Date().toISOString();
    const { rows } = planNativeRankingAwards(snapshot, overrides, awardedAt);
    if (rows.length) onReview({
      type: 'rank', rows, overrides, awardedAt, heading: 'Review ranking awards',
      summary: rows.length + (rows.length === 1 ? ' player will receive points.' : ' players will receive points.'),
    });
  };

  return <section className="ap-draw-announcements" aria-label="Final placements and points">
    <h3>Final placements and points</h3>
    {plan.proposals.length > 0 && <ol className="ap-native-court-review">
      {plan.proposals.map(proposal => <li key={proposal.entry_id}>
        <strong>{proposal.entry.team_name}</strong>
        <p>{proposal.placement} · {proposal.pointsRule ? proposal.pointsRule.points + ' points per player' : 'Needs review'}</p>
        <p>{proposal.players.map(player => player.name + (player.awarded ? ' (awarded)' : '')).join(' · ')}</p>
        {proposal.requiresManualPlacement && <label>Official placement for {proposal.entry.team_name}
          <SearchableDropdown value={overrides[proposal.entry_id] || ''} onChange={event => { const value = event.target.value; setOverrides(old => ({ ...old, [proposal.entry_id]: value })); }}>
            <option value="">Choose a points rule</option>
            {snapshot.rules.map(rule => <option key={rule.id} value={rule.round_code}>{rule.round_label} · {rule.points} points</option>)}
          </SearchableDropdown>
        </label>}
      </li>)}
    </ol>}
    {plan.issue ? <p role="status">{plan.issue}</p> : plan.rows.length > 0
      ? <button type="button" className="ap-secondary" onClick={review}>Review points to award</button>
      : <p>Points for these players are already recorded.</p>}
  </section>;
}

export function NativeDrawAwardReceiptReview({ rows }) {
  return <ol className="ap-native-court-review">{rows.map(row => <li key={row.player_id}>
    <strong>{row.config_snapshot.player_name}</strong><p>{row.config_snapshot.final_placement} · {row.points} points</p>
  </li>)}</ol>;
}
