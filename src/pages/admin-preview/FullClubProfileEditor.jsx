import React, { useEffect, useRef, useState } from 'react';
import { Dialog } from './PlayersWorkspace';
import RecordLoading from './RecordLoading';
import FullClubEditorFields from './FullClubEditorFields';
import { createFullClubDraft, fullClubProfilePatch, loadFullClubEditor, saveFullClubProfile, uploadFullClubImage } from './fullClubProfile';
import './FullClubProfileEditor.css';

const labels = { name: 'Club name', short_name: 'Short name', slug: 'Page URL', about: 'About the club', website_url: 'Website', brand_color: 'Brand colour', status: 'Club status', contact_email: 'Contact email', contact_phone: 'Contact phone', whatsapp_number: 'WhatsApp', city: 'City', address: 'Address', lat: 'Latitude', lng: 'Longitude', logo_url: 'Club logo', cover_image_url: 'Cover image', verified: 'Verified', sapa_registered: 'SAPA registered', federation_id: 'Federation', group_id: 'Club group', socials: 'Social media', contacts: 'Contacts', opening_hours: 'Opening hours', courts: 'Courts', services: 'Services', cafe: 'Café / restaurant', sponsors: 'Sponsors & partners', principal_sponsor: 'Principal sponsor', gallery: 'Gallery', stats: 'Statistics' };
const label = key => labels[key] || key.replaceAll('_', ' ');
const serialize = value => JSON.stringify(value);
const replaceUploads = (value, replacements) => {
  if (typeof value === 'string') return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map(item => replaceUploads(item, replacements));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceUploads(item, replacements)]));
  return value;
};
function ReviewValue({ value, field, image = false }) {
  if (value == null || value === '') return <span className="clubs-review-empty">Not set</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'string' && (image || ['logo_url', 'cover_image_url', 'image_url'].includes(field)) && /^(https?:|blob:|data:image\/)/i.test(value)) return <img src={value} alt={`${label(field)} preview`} width="120" height="90"/>;
  if (Array.isArray(value)) return value.length ? <ol>{value.map((item, index) => <li key={index}><ReviewValue value={item} field={field}/></li>)}</ol> : <span className="clubs-review-empty">None</span>;
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{label(key)}</dt><dd><ReviewValue value={item} field={key} image={field === 'gallery' && key === 'url'}/></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}

export default function FullClubProfileEditor({ record, client, scopeId, onClose, onSaved, onBusyChange }) {
  const [snapshot, setSnapshot] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState('');
  const [review, setReview] = useState(null), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [discard, setDiscard] = useState(false);
  const generation = useRef(0), lock = useRef(false), uploads = useRef(new Map()), form = useRef(null), busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    const current = ++generation.current;
    loadFullClubEditor(client, scopeId, record.id).then(value => {
      if (current !== generation.current) return;
      setSnapshot(value); setDraft(createFullClubDraft(value.record));
    }).catch(err => { if (current === generation.current) setError(err.message); });
    return () => { generation.current++; busyCallback.current?.(false); uploads.current.forEach((_, url) => URL.revokeObjectURL(url)); uploads.current.clear(); };
  }, [client, scopeId, record.id]);
  const dirty = Boolean(snapshot && draft && serialize(draft) !== serialize(createFullClubDraft(snapshot.record)));
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const close = () => { if (lock.current) return; if (dirty && !blocked) setDiscard(true); else onClose(); };
  const change = (field, value) => { if (!lock.current && !blocked) { setDraft(previous => ({ ...previous, [field]: value })); setError(''); } };
  const stageUpload = async (file, kind) => {
    if (lock.current || blocked) throw new Error('Please wait for the current operation.');
    if (!file?.size || !file.type?.startsWith('image/')) throw new Error('Choose a non-empty image file.');
    const url = URL.createObjectURL(file); uploads.current.set(url, { file, kind }); return url;
  };
  const submit = async event => {
    event.preventDefault(); if (!snapshot || lock.current || blocked) return;
    const current = generation.current;
    try {
      const patch = fullClubProfilePatch(snapshot.record, draft, snapshot.groups);
      if (!Object.keys(patch).length) throw new Error('No changes to save.');
      if (!review) { setReview(patch); setError(''); form.current?.closest('dialog')?.scrollTo({ top: 0 }); return; }
      lock.current = true; setBusy(true); busyCallback.current?.(true); setError('');
      const replacements = new Map(), proposed = serialize(patch);
      // Only upload images still referenced by the reviewed changes. Replaced
      // or removed local previews never reach storage.
      for (const [url, upload] of uploads.current) {
        if (!proposed.includes(JSON.stringify(url))) continue;
        const publicUrl = await uploadFullClubImage({ client, scopeId, original: snapshot.record, ...upload });
        if (current !== generation.current) return;
        replacements.set(url, publicUrl);
      }
      if (current !== generation.current) return;
      const result = await saveFullClubProfile({ client, scopeId, original: snapshot.record, draft: replaceUploads(draft, replacements), groups: snapshot.groups });
      if (current === generation.current) onSaved(result.record);
    } catch (err) {
      if (current === generation.current) {
        setError(`${err.message || 'The changes could not be saved.'}${lock.current ? ' Close and reload before trying again. Uploaded files may remain in storage; existing images have not been deleted.' : ''}`);
        if (lock.current) setBlocked(true);
      }
    } finally { if (current === generation.current) { lock.current = false; setBusy(false); busyCallback.current?.(false); } }
  };
  return <Dialog title={`Edit ${record.name || 'club'}`} kicker="4M Padel · Club profile" onClose={close} busy={busy} className="clubs-full-dialog">
    <form ref={form} className="clubs-full-form" onSubmit={submit}>
      {error && <p className="clubs-full-error" role="alert">{error}</p>}
      {!draft && !error && <RecordLoading label="Loading full club editor…" detail="Checking access and reading the current club, groups and federations."/>}
      {discard ? <section className="clubs-discard"><h3>Discard unsaved club changes?</h3><p>Your edits and image previews have not been saved.</p><div className="pp-actions"><button type="button" className="ap-secondary" onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="ap-danger" onClick={onClose}>Discard changes</button></div></section> : draft && (review ? <section className="clubs-full-review"><h3>Review club changes</h3><p>Confirming saves these changes to the live club. Status, verification and federation changes can affect its public listing. Status changes also affect existing members’ dashboard access. This does not grant memberships, approve claims or send emails.</p>{Object.entries(review).map(([field, value]) => <article key={field}><h4>{label(field)}</h4><div className="clubs-review-columns"><section><h5>Current</h5><ReviewValue field={field} value={snapshot.record[field]}/></section><section><h5>Updated</h5><ReviewValue field={field} value={value}/></section></div></article>)}<p>Selected images upload only after confirmation. Previous images remain in storage. If an upload or save fails, close and reload before retrying.</p></section> : <><p className="clubs-editor-intro">Edit the club profile, facilities and media using the live club fields. Review before saving; selected images stay local until you confirm.</p><fieldset disabled={busy || blocked}><FullClubEditorFields draft={draft} onChange={change} groups={snapshot.groups} federations={snapshot.federations} onUpload={stageUpload} uploading={busy}/></fieldset></>)}
      {!discard && <footer className="clubs-full-footer"><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{blocked ? 'Close editor' : 'Cancel'}</button>{review && <button type="button" className="ap-secondary" disabled={busy || blocked} onClick={() => { setReview(null); setError(''); }}>Back to editing</button>}{draft && <button className="ap-primary" disabled={busy || blocked}>{busy ? 'Saving club…' : review ? 'Confirm club changes' : 'Review changes'}</button>}</footer>}
    </form>
  </Dialog>;
}
