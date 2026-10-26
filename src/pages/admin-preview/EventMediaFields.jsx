import React, { useRef, useState } from 'react';
import { uploadToGallery, uploadEventAsset } from '../../utils/eventMedia';
import './EventMediaFields.css';

const imageAccept = 'image/*';
const asList = value => (Array.isArray(value) ? value : String(value || '').split('\n')).map(value => value.trim()).filter(Boolean);
const previewUrl = value => /^(https?:\/\/|blob:|data:image\/)/i.test(String(value || '')) ? value : '';

function UploadButton({ label, accept = imageAccept, multiple = false, disabled, onFiles }) {
  const input = useRef(null);
  return <><button type="button" className="ap-secondary" disabled={disabled} onClick={() => input.current.click()}>{label}</button><input ref={input} className="ap-media-file-input" type="file" accept={accept} multiple={multiple} tabIndex={-1} aria-label={label} disabled={disabled} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) onFiles(files); }} /></>;
}

function Preview({ url, label, logo = false }) {
  const [failed, setFailed] = useState('');
  const safeUrl = previewUrl(url);
  return <div className={`ap-media-preview${logo ? ' is-logo' : ''}`}>{safeUrl && failed !== url ? <img src={safeUrl} alt={`${label} preview`} onError={() => setFailed(url)} /> : <span>{url ? 'Preview unavailable' : `No ${label.toLowerCase()} uploaded`}</span>}</div>;
}

export function EventMediaPreview({ field, value }) {
  const values = asList(value);
  if (!values.length) return <span>No media</span>;
  const document = field === 'poster_document_url' || field === 'organiser_kit_url';
  const label = field === 'poster_document_url' ? 'Poster document' : 'Organiser kit';
  return <div className="ap-event-media ap-media-review">{values.map((url, index) => document
    ? <div key={`${url}-${index}`}>{previewUrl(url) ? <a href={previewUrl(url)} target="_blank" rel="noreferrer">{label} ↗</a> : <span>Document link unavailable</span>}</div>
    : <Preview key={`${url}-${index}`} url={url} label={`${field.replaceAll('_', ' ')} ${index + 1}`} logo={field === 'sponsor_logos' || field === 'organiser_logo_url'} />)}</div>;
}

export default function EventMediaFields({ draft, onChange, onBusyChange = () => {}, disabled = false, uploadImage = uploadToGallery, uploadAsset = uploadEventAsset }) {
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState('');
  const lock = useRef(false), latest = useRef(draft);
  latest.current = draft;
  const blocked = disabled || Boolean(busy);
  function change(patch) { latest.current = { ...latest.current, ...patch }; onChange(patch); }
  async function upload(label, files, operation) {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(label); setError(''); setStatus(''); onBusyChange(true);
    let completed = 0;
    try {
      for (const file of files) { await operation(file); completed += 1; }
      setStatus(`${label} uploaded. Review and save the event to publish this change.`);
    } catch (err) {
      setError(`${err?.message || 'Upload failed.'}${completed ? ` ${completed} file(s) were uploaded and kept in this draft.` : ''}`);
    } finally { lock.current = false; setBusy(''); onBusyChange(false); }
  }
  function singleImage(field, prefix, label, file) {
    return upload(label, [file], async chosen => change({ [field]: await uploadImage(chosen, prefix) }));
  }
  function listUpload(field, prefix, label, files, replaceIndex) {
    return upload(label, files, async file => {
      const url = await uploadImage(file, prefix), values = asList(latest.current[field]);
      if (replaceIndex == null) values.push(url); else values[replaceIndex] = url;
      change({ [field]: values.join('\n') });
    });
  }
  function removeList(field, index) { change({ [field]: asList(latest.current[field]).filter((_, i) => i !== index).join('\n') }); }
  const sponsors = asList(draft.sponsor_logos), gallery = asList(draft.media_gallery_urls);
  return <section className="ap-event-media" aria-label="Event images and documents" aria-busy={Boolean(busy)}>
    <div className="ap-media-intro"><h3>Images & documents</h3><p>Choose a file to upload it immediately. Images and documents are linked to this event only after you review and save. Removing an item here does not delete the stored file.</p></div>
    {busy && <p role="status">Uploading {busy.toLowerCase()}… Please keep the editor open.</p>}{error && <p role="alert">{error}</p>}{status && !busy && <p role="status">{status}</p>}
    <div className="ap-media-primary-grid">
      <article className="ap-media-card"><h4>Cover photo</h4><Preview url={draft.custom_image_url} label="Cover photo" /><div className="ap-media-actions"><UploadButton label={draft.custom_image_url ? 'Replace cover' : 'Upload cover'} disabled={blocked} onFiles={files => singleImage('custom_image_url', 'covers', 'Cover photo', files[0])} />{draft.custom_image_url && <button type="button" disabled={blocked} className="ap-secondary" onClick={() => change({ custom_image_url: '' })}>Remove cover</button>}</div></article>
      <article className="ap-media-card"><h4>Event poster</h4>{draft.poster_document_url ? <div className="ap-media-document"><strong>PDF poster</strong>{previewUrl(draft.poster_document_url) ? <a href={previewUrl(draft.poster_document_url)} target="_blank" rel="noreferrer">View poster document ↗</a> : <span>Document link unavailable</span>}</div> : <Preview url={draft.poster_image_url} label="Event poster" />}<div className="ap-media-actions"><UploadButton label={draft.poster_image_url || draft.poster_document_url ? 'Replace poster' : 'Upload poster'} accept="image/jpeg,image/png,application/pdf" disabled={blocked} onFiles={files => upload('Event poster', [files[0]], async file => {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) change({ poster_document_url: await uploadAsset(file, 'event-posters'), poster_image_url: '' });
        else change({ poster_image_url: await uploadImage(file, 'posters'), poster_document_url: '' });
      })} />{(draft.poster_image_url || draft.poster_document_url) && <button type="button" disabled={blocked} className="ap-secondary" onClick={() => change({ poster_image_url: '', poster_document_url: '' })}>Remove poster</button>}</div><small>Image or PDF · documents up to 10 MB</small></article>
      <article className="ap-media-card"><h4>Organiser logo</h4><Preview url={draft.organiser_logo_url} label="Organiser logo" logo /><div className="ap-media-actions"><UploadButton label={draft.organiser_logo_url ? 'Replace organiser logo' : 'Upload organiser logo'} disabled={blocked} onFiles={files => singleImage('organiser_logo_url', 'org-logos', 'Organiser logo', files[0])} />{draft.organiser_logo_url && <button type="button" disabled={blocked} className="ap-secondary" onClick={() => change({ organiser_logo_url: '' })}>Remove logo</button>}</div></article>
      <article className="ap-media-card"><h4>Organiser kit</h4><div className="ap-media-document"><strong>{draft.organiser_kit_url ? 'Organiser document' : 'No organiser kit uploaded'}</strong>{draft.organiser_kit_url && (previewUrl(draft.organiser_kit_url) ? <a href={previewUrl(draft.organiser_kit_url)} target="_blank" rel="noreferrer">Open organiser kit ↗</a> : <span>Document link unavailable</span>)}</div><div className="ap-media-actions"><UploadButton label={draft.organiser_kit_url ? 'Replace organiser kit' : 'Upload organiser kit'} accept="application/pdf,.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={blocked} onFiles={files => upload('Organiser kit', [files[0]], async file => change({ organiser_kit_url: await uploadAsset(file, 'event-kits') }))} />{draft.organiser_kit_url && <button type="button" disabled={blocked} className="ap-secondary" onClick={() => change({ organiser_kit_url: '' })}>Remove kit</button>}</div><small>Documents up to 10 MB</small></article>
    </div>
    <section className="ap-media-collection"><div className="ap-media-collection-heading"><div><h4>Sponsor logos</h4><p>The first logo is the main sponsor. Transparency is preserved.</p></div><UploadButton label="Add sponsor logos" multiple disabled={blocked} onFiles={files => listUpload('sponsor_logos', 'sponsors', 'Sponsor logos', files)} /></div>{sponsors.length ? <div className="ap-media-thumbnails">{sponsors.map((url, index) => <article className="ap-media-card" key={`${url}-${index}`}><strong>{index === 0 ? 'Main sponsor' : `Sponsor ${index + 1}`}</strong><Preview url={url} label={`Sponsor ${index + 1}`} logo /><div className="ap-media-actions"><UploadButton label={`Replace sponsor ${index + 1}`} disabled={blocked} onFiles={files => listUpload('sponsor_logos', 'sponsors', 'Sponsor logo', [files[0]], index)} /><button type="button" className="ap-secondary" disabled={blocked} onClick={() => removeList('sponsor_logos', index)}>Remove sponsor {index + 1}</button>{index > 0 && <button type="button" className="ap-secondary" disabled={blocked} onClick={() => { const values = asList(latest.current.sponsor_logos); [values[index - 1], values[index]] = [values[index], values[index - 1]]; change({ sponsor_logos: values.join('\n') }); }}>Move earlier</button>}</div></article>)}</div> : <p>No sponsor logos added.</p>}</section>
    <section className="ap-media-collection"><div className="ap-media-collection-heading"><div><h4>Event gallery</h4><p>Images for the event’s media gallery.</p></div><UploadButton label="Add gallery images" accept="image/jpeg,image/png" multiple disabled={blocked} onFiles={files => listUpload('media_gallery_urls', 'event-media', 'Gallery images', files)} /></div>{gallery.length ? <div className="ap-media-thumbnails">{gallery.map((url, index) => <article className="ap-media-card" key={`${url}-${index}`}><Preview url={url} label={`Gallery image ${index + 1}`} /><div className="ap-media-actions"><UploadButton label={`Replace gallery image ${index + 1}`} accept="image/jpeg,image/png" disabled={blocked} onFiles={files => listUpload('media_gallery_urls', 'event-media', 'Gallery image', [files[0]], index)} /><button type="button" className="ap-secondary" disabled={blocked} onClick={() => removeList('media_gallery_urls', index)}>Remove image {index + 1}</button></div></article>)}</div> : <p>No gallery images added.</p>}</section>
  </section>;
}
