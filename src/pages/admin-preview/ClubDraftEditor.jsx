import React, { useId, useRef, useState } from 'react';
import { createClubDraft, reviewClubDraft } from './clubDraft.js';
import { editableClubProfileFields } from './saveClubProfile.js';

export default function ClubDraftEditor({ record, save, onSaved, onBusy = () => {} }) {
  const [draft, setDraft] = useState(() => createClubDraft(record));
  const [mode, setMode] = useState('closed'), [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const id = useId(), formRef = useRef(null), lock = useRef(false), attempted = useRef(false);
  const reviewed = reviewClubDraft(record, draft);
  const fields = new Set(editableClubProfileFields.map(([key]) => key));
  const errors = Object.fromEntries(Object.entries(reviewed.errors).filter(([key]) => fields.has(key)));
  const changes = reviewed.changes.filter(change => fields.has(change.key));
  const discard = () => { setDraft(createClubDraft(record)); setMode('closed'); setSubmitted(false); };
  async function confirm() {
    if (!save || lock.current || attempted.current || !changes.length || Object.keys(errors).length) return;
    lock.current = true; attempted.current = true; setBusy(true); onBusy(true);
    try {
      const result = await save({ original: record, draft });
      setMode('saved'); onSaved?.(result.record);
    } catch (err) { setError(err.message || 'Save could not be confirmed. Close and reload before trying again.'); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="clubs-draft">
    <h3>Edit club details</h3>
    <p className="fo-note">Update the club name, description, location and contact details. Website and media inheritance, approvals and member access are not changed.</p>
    {mode === 'saved' ? <p role="status">Club details saved.</p> : mode === 'closed' ? <button className="ap-secondary" onClick={() => setMode('edit')}>Edit club details</button> : <>
      {mode === 'review' ? <div><h4>Review {changes.length} changes</h4><dl className="clubs-fields">{changes.map(change => <React.Fragment key={change.key}><dt>{change.label}</dt><dd><small>Current</small><p>{change.before || 'Not recorded'}</p><small>New value</small><p>{change.after || 'Clear this field'}</p></dd></React.Fragment>)}</dl><p className="fo-note">Confirming updates this live club profile. No email is sent and no access is granted.</p>
        {error && <p role="alert">{error}</p>}
        <div className="fo-report-actions"><button className="ap-secondary" disabled={busy || Boolean(error)} onClick={() => setMode('edit')}>Back to editing</button><button className="ap-primary" disabled={!save || busy || Boolean(error)} onClick={confirm}>{busy ? 'Saving…' : 'Confirm club changes'}</button></div>
      </div> : <form ref={formRef} noValidate onSubmit={event => {
        event.preventDefault(); setSubmitted(true);
        if (Object.keys(errors).length) { formRef.current.elements.namedItem(Object.keys(errors)[0])?.focus(); return; }
        setMode('review');
      }}>
        <div className="clubs-draft-grid">{editableClubProfileFields.map(([key, label, limit]) => { const props = { id: id + '-' + key, name: key, value: draft[key], maxLength: limit, 'aria-invalid': submitted && Boolean(errors[key]), 'aria-describedby': submitted && errors[key] ? id + '-' + key + '-error' : undefined, onChange: event => setDraft(previous => ({ ...previous, [key]: event.target.value })) }; return <label key={key} className={key === 'about' ? 'clubs-draft-wide' : ''} htmlFor={props.id}>{label}{key === 'name' ? ' (required)' : ''}{key === 'about' ? <textarea {...props} rows={5}/> : <input {...props} type={key === 'contact_email' ? 'email' : 'text'}/>} {submitted && errors[key] && <span id={id + '-' + key + '-error'} className="clubs-field-error">{errors[key]}</span>}</label>; })}</div>
        <p role="status">{changes.length} changes</p><button className="ap-secondary" type="submit" disabled={!changes.length}>Review changes</button>
      </form>}
      {!error && <button className="ap-secondary" disabled={busy} onClick={() => setMode('discard')}>Discard changes</button>}
      {mode === 'discard' && <div role="alert"><p>Discard these {changes.length} changes?</p><div className="fo-report-actions"><button className="ap-secondary" onClick={() => setMode('edit')}>Keep editing</button><button className="ap-secondary" onClick={discard}>Confirm discard</button></div></div>}
    </>}
  </section>;
}
