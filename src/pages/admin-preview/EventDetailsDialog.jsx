import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { eventDetailsPatch, divisionDetailsPatch, newDivisionRecord, eventDetailsUnavailable, loadEventDetails, loadEventEditorDivisions, saveEventDetails } from './saveEventDetails';
import { EVENT_EDITOR_SECTIONS, DIVISION_EDITOR_FIELDS, PLAYER_GIFT_OPTIONS, eventEditorDraft, editorValue, fieldLabel } from './eventEditorFields';
import RecordLoading from './RecordLoading';
import EventRichTextEditor from '../../components/admin/EventRichTextEditor';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import EventLocationFields from './EventLocationFields';
import EventMediaFields, { EventMediaPreview } from './EventMediaFields';
import './EventPaymentDialog.css';
import './EventDetailsDialog.css';

export function Field({ field, type, value, onChange }) {
  if (type === 'richtext') return <div className="ap-editor-rich-field"><span>{fieldLabel(field)}</span><EventRichTextEditor theme="preview" label={fieldLabel(field)} value={value} onChange={onChange}/></div>;
  if (type === 'gifts') return <fieldset className="ap-editor-gifts"><legend>Player gifts</legend>{Object.entries(PLAYER_GIFT_OPTIONS).map(([key, label]) => <label className="ap-editor-checkbox" key={key}>{label}<input type="checkbox" checked={(value || []).includes(key)} onChange={e => onChange(e.target.checked ? [...(value || []), key] : (value || []).filter(item => item !== key))}/></label>)}</fieldset>;
  const input = { value: value ?? '', onChange: e => onChange(type === 'checkbox' ? e.target.checked : e.target.value) };
  return <label className={type === 'checkbox' ? 'ap-editor-checkbox' : ['textarea', 'lines'].includes(type) ? 'ap-editor-wide' : ''}>{fieldLabel(field)}{type === 'checkbox' ? <input type="checkbox" checked={Boolean(value)} onChange={input.onChange}/> : Array.isArray(type) ? <SearchableDropdown {...input}><option value="">Not set</option>{!type.includes(value) && value && <option value={value}>{value}</option>}{type.map(option => <option key={option}>{option}</option>)}</SearchableDropdown> : ['textarea', 'lines'].includes(type) ? <textarea {...input} rows={type === 'lines' ? 3 : 5}/> : <input {...input} type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? 'any' : undefined}/>}</label>;
}

const MEDIA_FIELDS = ['custom_image_url', 'poster_image_url', 'poster_document_url', 'organiser_kit_url', 'organiser_logo_url', 'media_gallery_urls', 'sponsor_logos'];
export function ReviewValue({ field, value }) {
  if (MEDIA_FIELDS.includes(field)) return <EventMediaPreview field={field} value={value}/>;
  if (['description', 'rules_regs', 'withdrawal_substitution', 'points_breakdown', 'details'].includes(field)) return <div className="ap-rich-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(value || '') || 'Not recorded' }}/>;
  if (field === 'prize_money_breakdown' && Array.isArray(value)) return <ul>{value.map((row, index) => <li key={index}>{row.label}: R {row.amount}</li>)}</ul>;
  return <span>{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value ?? '') || 'Not recorded'}</span>;
}

export default function EventDetailsDialog({ event, onClose, save = saveEventDetails, load = loadEventDetails, loadDivisions = loadEventEditorDivisions, client = supabase, locationProps = {}, mediaProps = {} }) {
  const node = useRef(null), lock = useRef(false), attempted = useRef(false), title = useId();
  const [record, setRecord] = useState(null), [loading, setLoading] = useState(true), [draft, setDraft] = useState({});
  const [divisions, setDivisions] = useState([]), [divisionDrafts, setDivisionDrafts] = useState([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [section, setSection] = useState('Details'), [review, setReview] = useState(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (node.current) node.current.scrollTop = 0; }, [section, review]);
  const unavailable = record ? eventDetailsUnavailable(record) : '';
  const close = () => { if (!lock.current && !uploadBusy) onClose({ refresh: attempted.current }); };
  useEffect(() => { const dialog = node.current, trigger = document.activeElement, overflow = document.body.style.overflow; dialog.showModal(); document.body.style.overflow = 'hidden'; return () => { dialog.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); }; }, []);
  useEffect(() => {
    let current = true;
    Promise.all([load({ client, event }), loadDivisions({ client, event })]).then(([data, rows]) => {
      if (!current) return; setRecord(data); setDraft(eventEditorDraft(data)); setDivisions(rows);
      setDivisionDrafts(rows.map(row => ({ id: row.id, ...Object.fromEntries(Object.entries(DIVISION_EDITOR_FIELDS).map(([field, type]) => [field, editorValue(row[field], type)])) })));
    }).catch(err => { if (current) setError(err.message || 'Event settings could not be loaded.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, event.id, load, loadDivisions]);
  const submit = async e => {
    e.preventDefault(); if (lock.current || uploadBusy || unavailable || done || !record || loading || (attempted.current && error)) return;
    if (!review) {
      try {
        const patch = eventDetailsPatch(record, draft);
        const entries = Object.entries(patch).map(([field, value]) => ({ field, label: fieldLabel(field), old: record[field], value }));
        divisions.forEach((row, index) => Object.entries(divisionDetailsPatch(row, divisionDrafts[index])).forEach(([field, value]) => entries.push({ field, label: `${row.name} · ${fieldLabel(field)}`, old: row[field], value })));
        divisionDrafts.filter(row => !row.id).forEach(row => { const added = newDivisionRecord(row, draft.scoring_point || 'golden'); entries.push({ label: `New division · ${added.name}`, old: 'Not created', value: `${added.gender} · ${added.format} · R ${added.entry_fee} per player` }); });
        if (!entries.length) return onClose({ refresh: false });
        setError(''); setReview(entries);
      } catch (err) { setError(err.message); }
      return;
    }
    lock.current = true; attempted.current = true; setBusy(true);
    try { await save({ client, event: record, draft, divisions, divisionDrafts }); setDone(true); }
    catch (err) { setError(err.message || 'Could not confirm the save. Close and refresh before retrying.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <dialog ref={node} className="ap-payment-dialog ap-event-details-dialog" aria-labelledby={title} onCancel={e => { e.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Edit event</h2></div><button className="ap-icon-button" disabled={busy || uploadBusy} onClick={close} aria-label="Close event editor"><X size={20}/></button></header>
    <form onSubmit={submit}>
      {loading ? <RecordLoading label="Loading event settings…" detail="Reading the complete calendar and division records before editing."/> : !record ? <p role="alert">{error}</p> : done ? <p role="status">Event settings saved. Close to refresh the event.</p> : unavailable ? <p role="status">{unavailable}</p> : <>
        {review ? <><h3>Review changes</h3><dl className="ap-event-details-review">{review.map(({ field, label, old, value }) => <div key={label}><dt>{label}</dt><dd><section><small>Before</small><ReviewValue field={field} value={old}/></section><section><small>After</small><ReviewValue field={field} value={value}/></section></dd></div>)}</dl><p className="ap-payment-live-note">Confirming updates the live event and changed divisions. Existing payments are not recalculated, and no emails are sent. Saves use multiple requests: if interrupted, close and refresh before retrying.</p>{(review.some(item => /fee/i.test(item.label) && Number(item.value) > 0 && Number(item.value) < 50) || divisionDrafts.some(row => !row.id && Number(row.entry_fee) > 0 && Number(row.entry_fee) < 50)) && <p className="ap-editor-warning">A fee is below R50. Confirm that this low fee is intentional before saving.</p>}</> : <>
          <nav className="ap-editor-sections" aria-label="Event settings sections">{[...Object.keys(EVENT_EDITOR_SECTIONS), 'Divisions'].map(name => <button type="button" key={name} aria-current={section === name ? 'page' : undefined} disabled={uploadBusy} onClick={() => setSection(name)}>{name}</button>)}</nav>
          <p className="ap-payment-live-note">Changes remain unsaved until you review and confirm. Sanctioning, publishing, organisation ownership, RankedIn linking and weekly-series settings retain their existing workflows.</p>
          
          {section === 'Divisions' ? <div className="ap-editor-divisions"><p className="ap-payment-live-note">Edit or add divisions. Existing names and RankedIn links are preserved. Cancelling divisions is a separate action.</p>{divisionDrafts.length ? divisionDrafts.map((division, index) => <details key={division.id || division._key} open={!division.id || undefined}><summary>{division.name || 'Unnamed division'}</summary><div className="ap-event-details-fields">{Object.entries(DIVISION_EDITOR_FIELDS).filter(([field]) => field !== 'name' || !division.id).map(([field, type]) => <Field key={field} field={field} type={type} value={division[field]} onChange={value => { setDivisionDrafts(previous => previous.map((row, i) => i === index ? { ...row, [field]: value } : row)); setError(''); }}/>)}</div>{!division.id && <button type="button" className="ap-secondary" onClick={() => setDivisionDrafts(previous => previous.filter(row => row._key !== division._key))}>Remove draft division</button>}</details>) : <p>No divisions recorded for this event.</p>}<button type="button" className="ap-secondary" onClick={() => setDivisionDrafts(previous => [...previous, { _key: crypto.randomUUID(), name: '', entry_fee: '', format: 'Knockout', gender: '', scoring_point: draft.scoring_point || 'golden', license_required: Boolean(draft.license_required_default) }])}>Add division</button></div> : <div className="ap-event-details-fields">{Object.entries(EVENT_EDITOR_SECTIONS[section]).filter(([field]) => !MEDIA_FIELDS.includes(field) && !['venues', 'address', 'city'].includes(field)).map(([field, type]) => <Field key={field} field={field} type={type} value={draft[field]} onChange={value => { setDraft(previous => ({ ...previous, [field]: value })); setError(''); }}/>)}</div>}
          {section === 'Details' && <EventLocationFields {...locationProps} draft={draft} onChange={patch => { setDraft(previous => ({ ...previous, ...patch })); setError(''); }}/>}
          {section === 'Media & branding' && <EventMediaFields {...mediaProps} draft={draft} onChange={patch => { setDraft(previous => ({ ...previous, ...patch })); setError(''); }} onBusyChange={setUploadBusy} disabled={busy}/>}
        </>}
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy || uploadBusy} onClick={close}>{done || unavailable ? 'Close' : 'Cancel'}</button>{review && !busy && !error && !done && <button type="button" className="ap-secondary" onClick={() => setReview(null)}>Back</button>}{record && !loading && !done && !unavailable && <button type="submit" className="ap-primary" disabled={busy || uploadBusy || (attempted.current && Boolean(error))}>{busy ? 'Saving…' : review ? 'Confirm changes' : 'Review changes'}</button>}</footer>
    </form>
  </dialog>;
}
