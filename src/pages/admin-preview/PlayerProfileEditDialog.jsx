import SearchableDropdown from "../../components/SearchableDropdown";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from './PlayersWorkspace';
import RecordLoading from './RecordLoading';
import { readAll } from './playersData';
import { createPlayerProfileDraft, loadEditablePlayer, profilePatch, savePlayerProfile, verifyPlayerEditAccess } from './playerProfileEdit';
import { uploadPlayerProfilePhoto } from './playerProfilePhoto';
import './PlayerProfileEditDialog.css';
import { createPlayerAccountProfile, playerCreationPayload, verifyPlayerAccountAccess } from './playerAccountActions';

// Exact control values from the existing PlayerManager editor.
const BRANDS = ['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux'];
const REGIONS = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'];
const CATEGORIES = { "Men's": ["Men's Open (Pro/Elite)", "Men's Advanced", "Men's Intermediate", "Men's 35+", "Men's Juniors"], Ladies: ['Ladies Open (Pro/Elite)', 'Ladies Advanced', 'Ladies Intermediate', 'Ladies 35+', 'Ladies Juniors'] };
const labels = { playing_hand: 'Playing hand', court_side: 'Court side', name: 'Full name', email: 'Email', contact_number: 'Contact number', nationality: 'Nationality', racket_brand: 'Racket brand', bio: 'Biography', rank_label: 'Rank label', points: 'Points', win_rate: 'Win rate', age_group: 'Age group', category: 'Category', region: 'Region', level: 'Level', home_club: 'Home club', club_id: 'Club link', gender: 'Gender', sponsors: 'Sponsors', image_url: 'Player photo', approved: 'Approved', license_type: 'Licence status', paid_registration: 'Paid registration' };
const display = value => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '') || 'Not set';

export default function PlayerProfileEditDialog({ player, client, onClose, onSaved, creating = false, userId, scopeId }) {
  const [original, setOriginal] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState(''), [review, setReview] = useState(false), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false);
  const [clubs, setClubs] = useState([]), [clubError, setClubError] = useState(''), [uploading, setUploading] = useState(false), [photoNotice, setPhotoNotice] = useState('');
  const lock = useRef(false), mounted = useRef(false);
  const operationContext = useMemo(() => ({ active: true, userId, scopeId, isCurrent() { return this.active; } }), [client, userId, scopeId, player?.id]);
  useLayoutEffect(() => { operationContext.active = true; return () => { operationContext.active = false; }; }, [operationContext]);
  useEffect(() => {
    let active = true; mounted.current = true;
    const context = { userId, scopeId, isCurrent: () => active };
    (creating ? verifyPlayerAccountAccess(client, context).then(() => ({})) : (async () => {
      if (!operationContext.userId) {
        const actor = await verifyPlayerEditAccess(client);
        if (!active || !operationContext.active) throw new Error('The editing context changed.');
        operationContext.userId = actor.id;
      }
      return loadEditablePlayer(client, player.id, operationContext);
    })()).then(async row => {
      if (!active) return;
      setOriginal(row); setDraft(createPlayerProfileDraft(row));
      try {
        const rows = await readAll(() => client.from('clubs').select('id,name').not('status', 'in', '(pending,rejected,in_review)').order('name'));
        if (active) setClubs(rows);
      } catch { if (active) setClubError('Club directory could not be loaded. Existing club is preserved; reopen to retry.'); }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; mounted.current = false; };
  }, [client, player?.id, creating, userId, scopeId]);
  const close = () => { if (!lock.current) onClose(); };
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const upload = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || lock.current) return;
    lock.current = true; setUploading(true); setError('');
    try { const url = await uploadPlayerProfilePhoto(client, player.id, file, operationContext); if (mounted.current && operationContext.active) { change('image_url', url); setPhotoNotice('Photo uploaded. Save the profile to apply it. Closing without saving leaves the uploaded file unused.'); } }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { lock.current = false; if (mounted.current) setUploading(false); }
  };
  const submit = async event => {
    event.preventDefault(); if (lock.current || blocked) return;
    try {
      const patch = creating ? playerCreationPayload(draft, clubs) : profilePatch(original, draft, clubs);
      if (!Object.keys(patch).length) { setError('No profile changes to save.'); return; }
      if (!review) { setError(''); setReview(true); return; }
      lock.current = true; setBusy(true); setError('');
      const saved = creating ? await createPlayerAccountProfile(client, draft, clubs, { userId, scopeId, isCurrent: () => operationContext.active && mounted.current }) : await savePlayerProfile(client, original, draft, clubs, operationContext);
      if (mounted.current && operationContext.active) onSaved(saved);
    } catch (err) { if (mounted.current) { setError(err.message); if (lock.current) setBlocked(true); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const input = (key, type = 'text') => <label key={key}>{labels[key]}<input name={key} required={key === 'name'} type={type} value={draft[key] ?? ''} onChange={e => change(key, e.target.value)}/></label>;
  const select = (key, values, placeholder = 'Select') => <label>{labels[key]}<SearchableDropdown name={key} value={draft[key] || ''} onChange={e => change(key, e.target.value)}><option value="">{placeholder}</option>{draft[key] && !values.includes(draft[key]) && <option value={draft[key]}>{draft[key]}</option>}{values.map(value => <option key={value}>{value}</option>)}</SearchableDropdown></label>;
  const patch = review ? (creating ? playerCreationPayload(draft, clubs) : profilePatch(original, draft, clubs)) : {};
  return <Dialog title={creating ? 'Add player profile' : `Edit ${player.name || 'player'} profile`} onClose={close} kicker="4M Padel · Profile editing" busy={busy || uploading}><form className="pp-action-form pp-full-profile" onSubmit={submit}>
    {creating && <p className="pp-notice">Creates a player profile only. No sign-in account, invitation or licence is created. Upload a photo after saving the profile.</p>}
    {error && <p className="pp-notice" role="alert">{error}</p>}
    {!draft && !error && <RecordLoading label="Loading editable profile…"/>}
    {draft && (review ? <><h3>Review changes</h3><dl className="pp-facts">{Object.entries(patch).filter(([key, value]) => !creating || ['points', 'approved'].includes(key) || (value !== '' && value != null && value !== '[]')).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{key === 'image_url' ? value ? <img src={value} width="96" height="96" alt="New player photo"/> : 'Remove player photo' : creating ? display(value) : <>{display(original[key])} → {display(value)}</>}</dd></div>)}</dl>
      {!creating && 'email' in patch && <p className="pp-notice">This changes the player record email only, as in the existing admin. It does not migrate their sign-in account or email-linked registrations.</p>}
      <p>Confirm saves only the changes shown above.</p></> : <fieldset disabled={busy || uploading}>
      <section><h3>Personal details</h3><div className="pp-form-grid">{input('name')}{input('email', 'email')}{input('contact_number', 'tel')}{input('nationality')}{select('gender', ['Male', 'Female'])}{input('age_group')}</div></section>
      <section><h3>Playing profile</h3><div className="pp-form-grid">
        <label>Category<SearchableDropdown name="category" value={draft.category || ''} onChange={e => change('category', e.target.value)}><option value="">Select Category</option>{draft.category && !Object.values(CATEGORIES).flat().includes(draft.category) && <option>{draft.category}</option>}{Object.entries(CATEGORIES).map(([group, values]) => <optgroup label={group} key={group}>{values.map(value => <option key={value}>{value}</option>)}</optgroup>)}</SearchableDropdown></label>
        {select('region', REGIONS, 'Select Region')}{input('level')}
        <label>Playing hand<SearchableDropdown value={draft.playing_hand || ''} onChange={e => change('playing_hand', e.target.value)}><option value="">Not set</option><option value="right">Right-handed</option><option value="left">Left-handed</option></SearchableDropdown></label>
        <label>Court side<SearchableDropdown value={draft.court_side || ''} onChange={e => change('court_side', e.target.value)}><option value="">Not set</option><option value="left">Left</option><option value="right">Right</option><option value="either">Either</option></SearchableDropdown></label>
        <div><label>Racket brand<SearchableDropdown name="racket_brand" value={BRANDS.includes(draft.racket_brand) ? draft.racket_brand : draft.racket_brand ? 'Other' : ''} onChange={e => change('racket_brand', e.target.value)}><option value="">Select Brand</option>{[...BRANDS, 'Other'].map(value => <option key={value}>{value}</option>)}</SearchableDropdown></label>{draft.racket_brand && !BRANDS.includes(draft.racket_brand) && <label>Specify brand<input required name="custom_racket_brand" value={draft.racket_brand === 'Other' ? '' : draft.racket_brand} onChange={e => change('racket_brand', e.target.value || 'Other')}/></label>}</div>
        <div className="pp-wide"><label>Home club<SearchableDropdown name="club_id" disabled={!!clubError} value={draft.club_id || (draft.home_club ? 'Other' : '')} onChange={e => { const selected = clubs.find(club => String(club.id) === e.target.value); setDraft(current => ({ ...current, club_id: selected?.id ?? e.target.value, home_club: e.target.value ? current.home_club : '' })); }}><option value="">Select club</option>{draft.club_id && draft.club_id !== 'Other' && !clubs.some(club => String(club.id) === String(draft.club_id)) && <option value={draft.club_id}>{original.home_club || 'Current club'}</option>}{clubs.map(club => <option value={club.id} key={club.id}>{club.name}</option>)}<option value="Other">Other (Type your own)</option></SearchableDropdown></label>{clubError && <p role="status">{clubError}</p>}{(draft.club_id === 'Other' || (!draft.club_id && draft.home_club)) && <label>Specify club name<input required name="home_club" value={draft.home_club || ''} onChange={e => setDraft(current => ({ ...current, club_id: 'Other', home_club: e.target.value }))}/></label>}</div>
      </div></section>
      <section><h3>Rankings</h3><div className="pp-form-grid">{input('rank_label')}{input('points', 'number')}{input('win_rate')}</div></section>
      <section><h3>Photo & biography</h3><div className="pp-profile-photo">{draft.image_url ? <img src={draft.image_url} width="96" height="96" alt="Player photo preview"/> : <span>No photo</span>}<div><label>{uploading ? 'Uploading photo…' : 'Upload photo'}<input type="file" accept="image/*" disabled={creating} onChange={upload}/></label>{draft.image_url && <button type="button" className="ap-secondary" onClick={() => change('image_url', '')}>Remove photo</button>}</div></div><label>Photo URL<input name="image_url" type="url" value={draft.image_url || ''} onChange={e => change('image_url', e.target.value)}/></label>{photoNotice && <p role="status">{photoNotice}</p>}<label>Sponsors (comma separated)<input name="sponsors" value={draft.sponsors || ''} onChange={e => change('sponsors', e.target.value)}/></label><label>Biography<textarea name="bio" rows={4} value={draft.bio || ''} onChange={e => change('bio', e.target.value)}/></label></section>
      <section><h3>Account approval</h3><label className="pp-profile-checkbox"><input type="checkbox" name="approved" checked={draft.approved} onChange={e => change('approved', e.target.checked)}/>Approved</label><p>Licence coverage is managed separately in the licence register, not by changing player profile flags.</p>{!creating && <a href={`/admin-preview/licenses?license_player=${encodeURIComponent(player.id)}`}>Open player licences</a>}</section>
    </fieldset>)}
    <footer className="pp-actions"><button type="button" className="ap-secondary" disabled={busy || uploading} onClick={close}>Close</button>{review && !blocked && <button type="button" className="ap-secondary" disabled={busy} onClick={() => setReview(false)}>Back to editing</button>}<button className="ap-primary" disabled={!draft || busy || uploading || blocked}>{busy ? 'Saving…' : review ? (creating ? 'Create player profile' : 'Confirm profile changes') : 'Review changes'}</button></footer>
  </form></Dialog>;
}
