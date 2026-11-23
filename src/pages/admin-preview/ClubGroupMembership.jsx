import React, { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { reviewClubGroupMembership, saveClubGroupMembership } from './clubGroupMembership.js';

export default function ClubGroupMembership({ client, session, scopeId, group, clubs, groups, selectedVenue, onCancel, onSaved, onBusyChange }) {
  const [venueId, setVenueId] = useState(selectedVenue?.id || '');
  const [review, setReview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false);
  const lock = useRef(false);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const context = useRef(null);
  context.current = { client, scopeId, userId: session?.user?.id, group };
  const venue = clubs.find(club => club.id === venueId);
  const previousGroup = groups.find(row => row.id === venue?.group_id);
  const action = selectedVenue ? 'unlink' : 'link';
  const reviewChange = () => {
    try { setReview(reviewClubGroupMembership(group, venue, action)); setError(''); }
    catch (failure) { setError(failure.message); }
  };
  const save = async () => {
    if (lock.current || blocked || !review) return;
    const initial = context.current;
    const isCurrent = () => active.current && Object.keys(initial).every(key => initial[key] === context.current[key]);
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      const saved = await saveClubGroupMembership(client, scopeId, initial.userId, review, isCurrent);
      if (isCurrent()) onSaved(saved, action);
    } catch (failure) {
      if (isCurrent()) { setError(failure.message); setBlocked(true); }
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  return <section className="clubs-draft" aria-label="Review group membership">
    <h3>{selectedVenue ? 'Unlink venue' : 'Link a venue'}</h3>
    {!selectedVenue && <label className="fo-status-filter">Venue<SearchableDropdown value={venueId} disabled={busy || blocked} onChange={event => { setVenueId(event.target.value); setReview(null); setError(''); }}><option value="">Choose a club</option>{clubs.filter(club => club.group_id !== group.id).map(club => <option key={club.id} value={club.id}>{club.name}{club.city ? ` · ${club.city}` : ''}</option>)}</SearchableDropdown></label>}
    {review ? <p role="status">{selectedVenue ? `Unlink ${venue.name} from ${group.name}. Current venue branding stays in place.` : `${previousGroup ? `Move ${venue.name} from ${previousGroup.name} to ` : `Link ${venue.name} to `}${group.name}.`}
      {review.patch.logo_url && ' The group logo will be copied to the venue.'}{review.patch.website_url && ' The group website will be copied to the venue.'}</p> : null}
    {error && <p role="alert">{error}</p>}
    <div className="fo-report-actions">
      {review ? <button type="button" className="ap-primary" disabled={busy || blocked} onClick={save}>{busy ? 'Saving…' : selectedVenue ? 'Confirm unlink venue' : 'Confirm link venue'}</button>
        : <button type="button" className="ap-secondary" disabled={!venue || busy} onClick={reviewChange}>Review group membership</button>}
      <button type="button" className="ap-secondary" disabled={busy} onClick={() => onCancel(blocked)}>{blocked ? 'Close and refresh groups' : 'Discard membership change'}</button>
    </div>
  </section>;
}
