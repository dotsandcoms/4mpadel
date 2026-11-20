import { useState } from 'react';
import { matchScoreText, prepareMatchResult } from '../../utils/matchResult.js';
import { hasNativePlateResult } from './nativeDrawOperations.js';

const outcomes = { played: 'Played', walkover: 'Walkover', retirement: 'Retirement', withdrawal: 'Withdrawal' };
const emptySet = () => ({ games: ['', ''], tiebreak: ['', ''], duration: '' });
const defaults = match => ({
  kind: Object.hasOwn(outcomes, match.result_type) ? match.result_type : 'played',
  winner: match.winner_entry_id === match.entry_one_id ? '1' : match.winner_entry_id === match.entry_two_id ? '2' : '',
  detailed: Boolean(match.score_sets?.length || !match.result_summary),
  totals: match.result_summary || ['', ''],
  sets: [...(match.score_sets || [])].sort((a, b) => a.set_number - b.set_number).map(row => ({
    games: [row.entry_one_games, row.entry_two_games],
    tiebreak: [row.entry_one_tiebreak ?? '', row.entry_two_tiebreak ?? ''],
    duration: row.duration_minutes ?? '',
  })),
  reason: '',
});

export default function NativePlateResult({ draw, match, entries, previous, onReview, onCancel }) {
  const [draft, setDraft] = useState(() => previous || defaults(match));
  const [error, setError] = useState('');
  const correcting = hasNativePlateResult(match);
  const setsToWin = Number(draw.scoring_rules?.sets_to_win ?? 2);
  const matchTiebreak = Boolean(draw.scoring_rules?.match_tiebreak);
  const teams = [match.entry_one_id, match.entry_two_id].map(id => entries.find(entry => entry.id === id));
  if (teams.some(team => !team)) return <p role="alert">The match teams could not be loaded.</p>;
  if (!Number.isInteger(setsToWin) || setsToWin < 1 || setsToWin > 5) return <p role="alert">This match format is unsupported.</p>;

  const showScore = draft.kind === 'played' || draft.kind === 'retirement';
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const setRows = Array.from({ length: Math.max(setsToWin, draft.sets.length) }, (_, index) => draft.sets[index] || emptySet());
  const updateSet = (index, values) => update('sets', setRows.map((row, i) => i === index ? { ...row, ...values } : row));
  const reviewScore = kind => {
    try {
      const winner = ['played', 'live'].includes(kind) ? null : draft.winner;
      const score = prepareMatchResult({ ...draft, kind, winner, setsToWin, matchTiebreak });
      score.winner = score.winner ? teams[score.winner - 1].id : null;
      if (correcting) {
        if (!draft.reason.trim()) throw new Error('Enter a correction reason.');
        if (draw.status === 'completed' && score.winner !== match.winner_entry_id) throw new Error('Keep the original winner when correcting a completed draw.');
        score.reason = draft.reason.trim();
      }
      onReview({ type: 'plate-result', match, score, draft, heading: kind === 'live' ? 'Review live score' : correcting ? 'Review result correction' : 'Review plate result', summary: match.label });
    } catch (issue) {
      setError(issue.message);
    }
  };

  return <section className="ap-plate-score" aria-label={correcting ? 'Correct plate result' : 'Enter plate result'}>
    <h3>{correcting ? 'Correct result' : 'Enter result'}</h3>
    <label>Match outcome<select value={draft.kind} onChange={event => update('kind', event.target.value)}>
      {Object.entries(outcomes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {draft.kind !== 'played' && <label>Winning team<select value={draft.winner} onChange={event => update('winner', event.target.value)}>
      <option value="">Choose a team</option>
      {teams.map((team, index) => <option key={team.id} value={index + 1}>{team.team_name}</option>)}
    </select></label>}
    {showScore && <>
      <label>Score detail<select value={draft.detailed ? 'games' : 'sets'} onChange={event => update('detailed', event.target.value === 'games')}>
        <option value="games">Games per set</option><option value="sets">Set totals only</option>
      </select></label>
      {draft.detailed ? <>
        {setRows.map((row, index) => <fieldset key={index}>
          <legend>{matchTiebreak && index === setsToWin * 2 - 2 ? 'Match tiebreak' : 'Set ' + (index + 1)}</legend>
          <div className="ap-plate-score-pair">{teams.map((team, side) => <label key={team.id}>
            {team.team_name} games<input type="number" inputMode="numeric" min="0" value={row.games[side]}
              onChange={event => updateSet(index, { games: row.games.map((value, i) => i === side ? event.target.value : value) })} />
          </label>)}</div>
          <details open={row.tiebreak.some(value => value !== '') || row.duration !== '' ? true : undefined}>
            <summary>Tiebreak and duration</summary>
            <div className="ap-plate-score-pair">{teams.map((team, side) => <label key={team.id}>
              {team.team_name} tiebreak<input type="number" inputMode="numeric" min="0" value={row.tiebreak[side]}
                onChange={event => updateSet(index, { tiebreak: row.tiebreak.map((value, i) => i === side ? event.target.value : value) })} />
            </label>)}</div>
            <label>Minutes<input type="number" inputMode="numeric" min="0" value={row.duration}
              onChange={event => updateSet(index, { duration: event.target.value })} /></label>
          </details>
        </fieldset>)}
        {setRows.length < setsToWin * 2 - 1 && <button type="button" className="ap-secondary" onClick={() => update('sets', [...setRows, emptySet()])}>Add set</button>}
      </> : <div className="ap-plate-score-pair">{teams.map((team, index) => <label key={team.id}>
        {team.team_name} sets won<input type="number" inputMode="numeric" min="0" max={setsToWin} value={draft.totals[index]}
          onChange={event => update('totals', draft.totals.map((value, i) => i === index ? event.target.value : value))} />
      </label>)}</div>}
    </>}
    {correcting && <label>Correction reason<textarea value={draft.reason} onChange={event => update('reason', event.target.value)} /></label>}
    {error && <p role="alert">{error}</p>}
    <div className="ap-modal-actions">
      <button type="button" className="ap-secondary" onClick={onCancel}>Cancel score entry</button>
      {!correcting && draft.kind === 'played' && <button type="button" className="ap-secondary" onClick={() => reviewScore('live')}>Review live score</button>}
      <button type="button" className="ap-primary" onClick={() => reviewScore(draft.kind)}>{correcting ? 'Review correction' : 'Review result'}</button>
    </div>
  </section>;
}

export function NativePlateResultReview({ action, entries }) {
  const { match, score } = action;
  const scoreText = matchScoreText({ id: match.id, result_summary: score.summary, result_type: score.kind }, score.sets.map((set, index) => ({
    match_id: match.id, set_number: index + 1, entry_one_games: set.games[0], entry_two_games: set.games[1],
    entry_one_tiebreak: set.tiebreak?.[0], entry_two_tiebreak: set.tiebreak?.[1],
  })));
  const winner = entries.find(entry => entry.id === score.winner)?.team_name;
  return <>
    {winner && <p>Winner · {winner}</p>}
    {scoreText && <p>{scoreText}</p>}
    {score.reason && <p>Correction reason · {score.reason}</p>}
  </>;
}
