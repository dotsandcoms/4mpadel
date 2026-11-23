import { useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { canScheduleNativeMatch, nativeCourtDateInput, planNativeMatchSchedule } from './nativeMatchScheduling.js';

const bulkInitial = { scope: 'missing', court: '', start: '', intervalMinutes: 60, overwriteCourts: false, overwriteTimes: false };
const bulkScopes = { missing: 'Missing a court or time', group: 'Group matches', elimination: 'Elimination and placement', all: 'All playable matches' };

export default function NativeDrawCourtSetup({ match, snapshot, previousReview, onReview }) {
  const [mode, setMode] = useState(previousReview?.mode || null);
  const [draft, setDraft] = useState(previousReview?.form || null);
  const [error, setError] = useState('');
  const playable = snapshot.matches.some(canScheduleNativeMatch);
  if (!playable) return null;

  const enter = nextMode => {
    setMode(nextMode);
    setDraft(nextMode === 'individual'
      ? { matchId: match.id, court: match.court_name || '', start: nativeCourtDateInput(match.scheduled_start) }
      : { ...bulkInitial });
    setError('');
  };
  const change = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const review = () => {
    try {
      const plan = planNativeMatchSchedule(snapshot.matches, snapshot.playDays, mode, draft);
      if (!plan.length) throw new Error('No matches need the selected changes.');
      setError('');
      onReview({
        type: 'schedule', mode, form: { ...draft }, plan,
        heading: mode === 'individual' ? 'Review match court setup' : 'Review bulk court setup',
        summary: plan.length + (plan.length === 1 ? ' match will be updated.' : ' matches will be updated.'),
      });
    } catch (issue) { setError(issue.message); }
  };

  return <section className="ap-native-court-setup" aria-label="Court setup">
    <div className="ap-modal-actions">
      {canScheduleNativeMatch(match) && <button type="button" className="ap-secondary" onClick={() => enter('individual')}>Match court setup</button>}
      <button type="button" className="ap-secondary" onClick={() => enter('bulk')}>Bulk court setup</button>
    </div>
    {draft && <>
      {mode === 'bulk' && <label>Matches to update<SearchableDropdown value={draft.scope} onChange={event => change('scope', event.target.value)}>
        {Object.entries(bulkScopes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </SearchableDropdown></label>}
      <label>Court name<input value={draft.court} onChange={event => change('court', event.target.value)} placeholder="Court 1" /></label>
      <label>{mode === 'individual' ? 'Scheduled start (SAST)' : 'First scheduled start (SAST)'}<input type="datetime-local" value={draft.start} onChange={event => change('start', event.target.value)} /></label>
      {mode === 'bulk' && <>
        <label>Minutes between match starts<input type="number" min="1" value={draft.intervalMinutes} onChange={event => change('intervalMinutes', event.target.value)} /></label>
        <label className="ap-draw-pinned"><input type="checkbox" checked={draft.overwriteCourts} onChange={event => change('overwriteCourts', event.target.checked)} />Overwrite existing courts</label>
        <label className="ap-draw-pinned"><input type="checkbox" checked={draft.overwriteTimes} onChange={event => change('overwriteTimes', event.target.checked)} />Overwrite existing start times</label>
      </>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="ap-secondary" onClick={review}>Review court changes</button>
    </>}
  </section>;
}

export function NativeDrawCourtReview({ plan }) {
  return <ol className="ap-native-court-review">{plan.map(({ match, fields }) => {
    const court = 'court_name' in fields ? fields.court_name : match.court_name;
    const start = 'scheduled_start' in fields ? fields.scheduled_start : match.scheduled_start;
    return <li key={match.id}><strong>{match.label}</strong><p>{court || 'No court'} · {nativeCourtDateInput(start).replace('T', ' ') || 'No start time'}{start && ' SAST'}</p></li>;
  })}</ol>;
}
