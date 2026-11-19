import { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import RecordLoading from './RecordLoading';
import { readAll } from './playersData';
import { coachProfilePatch, createCoachDraft, loadCoachProfile, saveCoachProfile } from './coachProfileEdit';

const labels = { firstName: 'Name', lastName: 'Surname', full_name: 'Full name', email: 'Email address', contact_number: 'Contact number', city: 'City', gender: 'Gender', coaching_location: 'Coaching clubs', website_link: 'Website link', instagram_link: 'Instagram link', youtube_link: 'YouTube link', bio: 'Coaching bio' };
export default function CoachProfileEditForm({ row, client, scopeId, onCancel, onSaved, onBusyChange }) {
  const [original, setOriginal] = useState(null), [draft, setDraft] = useState(null), [clubs, setClubs] = useState([]), [clubError, setClubError] = useState('');
  const [file, setFile] = useState(null), [preview, setPreview] = useState(''), [review, setReview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false);
  const generation = useRef(0), lock = useRef(false), busyCallback = useRef(onBusyChange); busyCallback.current = onBusyChange;
  useEffect(() => {
    const current = ++generation.current;
    lock.current = false; setBusy(false);
    setOriginal(null); setDraft(null); setError(''); setReview(null); setFile(null); setBlocked(false);
    loadCoachProfile(client, row.id, scopeId).then(async value => {
      if (generation.current !== current) return;
      setOriginal(value); setDraft(createCoachDraft(value));
      try {
        const values = await readAll(() => client.from('clubs').select('id,name').not('status', 'in', '(pending,rejected,in_review)').order('name'));
        if (generation.current === current) { setClubs(values); setClubError(''); }
      } catch { if (generation.current === current) setClubError('Club directory unavailable. Existing club names are retained; reopen to retry.'); }
    }).catch(err => { if (generation.current === current) setError(err.message); });
    return () => { generation.current++; busyCallback.current?.(false); };
  }, [client, row.id, scopeId]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); if (lock.current || blocked || !draft) return;
    const current = generation.current;
    try {
      const patch = coachProfilePatch(original, draft);
      if (!review) { if (!Object.keys(patch).length && !file) throw new Error('No changes to save.'); setReview(patch); setError(''); return; }
      lock.current = true; setBusy(true); busyCallback.current?.(true); setError('');
      const saved = await saveCoachProfile(client, original, draft, scopeId, { file });
      if (generation.current === current) onSaved(saved);
    } catch (err) { if (generation.current === current) { setError(err.message); if (lock.current) setBlocked(true); } }
    finally { if (generation.current === current) { lock.current = false; setBusy(false); busyCallback.current?.(false); } }
  };
  const input = (key, type = 'text') => <label key={key}>{labels[key]}<input name={key} type={type} value={draft[key]} onChange={event => change(key, event.target.value)}/></label>;
  return <form className="pp-action-form pp-coach-edit" onSubmit={submit}>
    <h3>Edit coach information</h3>
    {error && <p className="pp-notice" role="alert">{error}</p>}
    {!draft && !error && <RecordLoading label="Loading coach profile…"/>}
    {draft && (review ? <section><h4>Review changes</h4><dl className="pp-facts">{Object.entries(review).map(([key, value]) => <div key={key}><dt>{labels[key] || key}</dt><dd>{original[key] || 'Not set'} → {value || 'Not set'}</dd></div>)}</dl>{file && <div><p>Replace profile photo after confirmation</p><img src={preview} width="96" height="96" alt="New coach photo preview"/></div>}<p>Only these profile changes are saved. Application status is unchanged. The previous photo will be retained.</p></section> : <fieldset disabled={busy}>
      <div className="pp-form-grid">{input('firstName')}{input('lastName')}{input('email', 'email')}{input('contact_number', 'tel')}{input('city')}<label>Gender<SearchableDropdown name="gender" value={draft.gender} onChange={event => change('gender', event.target.value)}><option value="">Select gender</option>{draft.gender && !['Male', 'Female'].includes(draft.gender) && <option>{draft.gender}</option>}<option>Male</option><option>Female</option></SearchableDropdown></label></div>
      <section><h4>Clubs you coach at · {draft.clubs.length}/3</h4><div className="pp-actions">{draft.clubs.map((name, index) => <button className="ap-secondary" type="button" key={`${name}-${index}`} aria-label={`Remove ${name}`} onClick={() => change('clubs', draft.clubs.filter((_, i) => i !== index))}>{name} ×</button>)}</div><label>Add coaching club<SearchableDropdown value="" disabled={draft.clubs.length >= 3 || !!clubError} onChange={event => { const club = clubs.find(value => String(value.id) === event.target.value); if (club && draft.clubs.length < 3 && !draft.clubs.some(name => name.toLowerCase() === club.name.toLowerCase())) change('clubs', [...draft.clubs, club.name]); }}><option value="">Search and select a club</option>{clubs.filter(club => !draft.clubs.some(name => name.toLowerCase() === club.name.toLowerCase())).map(club => <option key={club.id} value={club.id}>{club.name}</option>)}</SearchableDropdown></label>{clubError && <p role="status">{clubError}</p>}</section>
      <div className="pp-form-grid">{input('website_link', 'url')}{input('instagram_link', 'url')}{input('youtube_link', 'url')}</div>
      <label>Coaching bio<textarea name="bio" rows={6} value={draft.bio} onChange={event => change('bio', event.target.value)}/></label>
      <section><h4>Profile photo</h4>{(preview || original.profile_pic_url) && <img src={preview || original.profile_pic_url} alt="Coach photo preview" width="96" height="96"/>}<label>Choose replacement photo<input type="file" accept="image/*" onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ''; if (!chosen) return; if (!chosen.type.startsWith('image/') || !chosen.size) { setError('Choose a non-empty image file.'); return; } setFile(chosen); setError(''); }}/></label>{file && <button type="button" className="ap-secondary" onClick={() => setFile(null)}>Keep current photo</button>}<p>The photo is previewed locally and uploaded only after you confirm the changes.</p></section>
    </fieldset>)}
    <footer className="pp-actions"><button type="button" className="ap-secondary" disabled={busy} onClick={() => { if (!lock.current) onCancel(); }}>Cancel</button>{review && <button type="button" className="ap-secondary" disabled={busy || blocked} onClick={() => setReview(null)}>Back to editing</button>}<button className="ap-primary" disabled={!draft || busy || blocked}>{busy ? 'Saving…' : review ? 'Confirm coach changes' : 'Review changes'}</button></footer>
  </form>;
}
