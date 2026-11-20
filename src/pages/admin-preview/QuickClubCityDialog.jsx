import { useEffect, useRef, useState } from 'react';
import { Dialog, Facts } from './PlayersWorkspace.jsx';
import RecordLoading from './RecordLoading.jsx';
import { clubCityPatch, loadClubCityEditor, saveClubCity } from './fullClubProfile.js';

export default function QuickClubCityDialog({ club, client, scopeId, userId, onClose, onSaved }) {
  const [record, setRecord] = useState(null);
  const [city, setCity] = useState('');
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const request = useRef(null);
  const saving = useRef(false);

  useEffect(() => {
    const result = { active: true };
    request.current = result;
    loadClubCityEditor(client, scopeId, club.id, userId).then(current => {
      if (result.active) { setRecord(current); setCity(current.city ?? ''); }
    }).catch(error => { if (result.active) setError(error.message); });
    return () => { result.active = false; };
  }, [client, scopeId, club.id, userId]);

  async function submit(event) {
    event.preventDefault();
    if (!record || blocked || saving.current) return;
    setError('');
    if (!review) {
      const patch = clubCityPatch(record, city);
      if (!Object.hasOwn(patch, 'city')) { setError('Enter a different city to review.'); return; }
      setReview(patch);
      return;
    }
    const current = request.current;
    saving.current = true;
    setBusy(true);
    try {
      const { record: saved } = await saveClubCity({ client, scopeId, expectedUserId: userId, original: record, city: review.city ?? '' });
      if (current.active) onSaved(saved);
    } catch (failure) {
      if (current.active) {
        setError(failure.message || 'The city could not be saved.');
        setBlocked(true);
      }
    } finally {
      saving.current = false;
      if (current.active) setBusy(false);
    }
  }

  return <Dialog title={`Edit city for ${record?.name || club.name || 'club'}`} kicker="4M Padel · Club profile"
    onClose={() => { if (!saving.current) onClose(); }} busy={busy} className="clubs-full-dialog clubs-city-dialog">
    <form className="clubs-full-form" onSubmit={submit}>
      {error && <p role="alert" className="clubs-full-error">{error}</p>}
      {!record && !error && <RecordLoading label="Loading club city…"/>}
      {record && (review ? <section className="clubs-full-review">
        <h3>Review city change</h3>
        <Facts entries={[['Current city', record.city], ['Updated city', review.city]]}/>
      </section> : <label className="ap-full-club-field"><span>City</span>
        <input name="city" autoComplete="address-level2" value={city} onChange={event => { setCity(event.target.value); setError(''); }}/>
      </label>)}
      <footer className="clubs-full-footer">
        <button type="button" className="ap-secondary" disabled={busy} onClick={onClose}>{blocked ? 'Close editor' : 'Cancel'}</button>
        {review && !blocked && <button type="button" className="ap-secondary" disabled={busy} onClick={() => setReview(null)}>Back to editing</button>}
        {record && <button type="submit" className="ap-primary" disabled={busy || blocked}>
          {busy ? 'Saving city…' : review ? 'Confirm city change' : 'Review city change'}
        </button>}
      </footer>
    </form>
  </Dialog>;
}
