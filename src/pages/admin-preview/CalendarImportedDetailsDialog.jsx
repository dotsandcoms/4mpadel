import { useEffect, useId, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useEventOperation } from './useEventOperation.js';
import {
  importedCalendarDraft, importedCalendarFields, importedCalendarOptions, loadImportedCalendarEditor,
  reviewImportedCalendarChanges, saveImportedCalendarChanges,
} from './calendarImportedEditing.js';
import './EventPaymentDialog.css';

const labels = Object.fromEntries(Object.values(importedCalendarFields).flat().map(([key, label]) => [key, label]));

function MetadataField({ definition, draft, organisations, change }) {
  const [key, label, type] = definition;
  const value = draft[key];
  const input = { name: key, value, onChange: event => change(key, event.target.value) };
  if (type === 'checkbox') return <label className="cw-checkbox"><input name={key} type="checkbox"
    checked={value} onChange={event => change(key, event.target.checked)} />{label}</label>;
  if (type === 'organisation') return <label>{label}<SearchableDropdown {...input}>
    <option value="">No linked organisation</option>
    {value && !organisations.some(org => org.id === value) && <option value={value}>Currently linked organisation</option>}
    {organisations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
  </SearchableDropdown></label>;
  if (importedCalendarOptions[type]) return <label>{label}<SearchableDropdown {...input}>
    <option value="">No {type} recorded</option>
    {value && !importedCalendarOptions[type].includes(value) && <option value={value}>{value}</option>}
    {importedCalendarOptions[type].map(option => <option key={option}>{option}</option>)}
  </SearchableDropdown></label>;
  return <label>{label}{type === 'textarea' ? <textarea {...input} rows={4} maxLength={12000} /> :
    <input {...input} type={type} required={key === 'event_name'} min={type === 'number' ? 0 : undefined}
      step={type === 'number' ? key === 'points' ? 1 : 0.01 : type === 'time' ? 1 : undefined} />}</label>;
}

export default function CalendarImportedDetailsDialog({ client, event, session, scopeId, initialSection, onClose }) {
  const title = useId();
  const expectedUserId = session?.user?.id;
  const [load, setLoad] = useState({ pending: true });
  const [draft, setDraft] = useState(null);
  const [section, setSection] = useState(() => initialSection === 'Publishing' ? initialSection : 'Event details');
  const [retry, setRetry] = useState(0);
  const [review, setReview] = useState(null);
  const [validation, setValidation] = useState('');
  const { bindDialog, busy, error, result, close, run } = useEventOperation({
    client, event, session, scopeId, onClose: outcome => onClose({ ...outcome, eventId: event.id }),
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ pending: true });
    loadImportedCalendarEditor({ client, event, expectedUserId, scopeId, signal: controller.signal }).then(source => {
      if (controller.signal.aborted) return;
      setDraft(importedCalendarDraft(source.record));
      setLoad({ source });
    }).catch(failure => {
      if (!controller.signal.aborted) setLoad({ error: failure.message || 'The calendar event could not be loaded.' });
    });
    return () => controller.abort();
  }, [client, event, expectedUserId, scopeId, retry]);

  function change(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
    setValidation('');
  }
  function submit(submission) {
    submission.preventDefault();
    if (review) {
      return run(checks => saveImportedCalendarChanges({ client, event, expectedUserId, scopeId, source: load.source, changes: review, ...checks }));
    }
    try {
      const changes = reviewImportedCalendarChanges(load.source.record, draft, load.source.organisations);
      if (!Object.keys(changes).length) { setValidation('Change an event field before reviewing.'); return; }
      setReview(changes);
    } catch (failure) { setValidation(failure.message); }
  }
  function summary(key, value) {
    if (key === 'organisation_id' && value) {
      return load.source.organisations.find(org => org.id === value)?.name || event._organisation?.name || 'Currently linked organisation';
    }
    return value == null || value === '' ? 'Not recorded' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  }

  return <dialog ref={bindDialog} className="ap-payment-dialog cw-imported-editor" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{load.source?.record.event_name || event.event_name}</p><h2 id={title}>Edit imported event</h2></div>
      <button type="button" className="ap-icon-button" disabled={busy} aria-label="Close imported event editor" onClick={close}>×</button></header>
    <form className="cw-editor" onSubmit={submit}>
      {load.pending && <p role="status">Checking the event and organisation directory…</p>}
      {load.error && <div role="alert"><p>{load.error}</p><button type="button" className="ap-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
      {result ? <p role="status">{result.message}</p> : load.source && (review ? <>
        <h3>Review calendar changes</h3>
        <dl className="ap-details-list">{Object.entries(review).map(([key, value]) => <div key={key}>
          <dt>{labels[key]}</dt><dd>{summary(key, load.source.record[key])} → {summary(key, value)}</dd>
        </div>)}</dl>
      </> : <>
        {load.source.record.rankedin_id && <p>RankedIn event {load.source.record.rankedin_id}</p>}
        <nav className="pp-tabs" aria-label="Imported event settings">{Object.keys(importedCalendarFields).map(name =>
          <button key={name} type="button" aria-current={name === section ? 'page' : undefined} onClick={() => setSection(name)}>{name}</button>)}</nav>
        <div className="pp-form-grid">{importedCalendarFields[section].map(definition => <MetadataField key={definition[0]}
          definition={definition} draft={draft} organisations={load.source.organisations} change={change} />)}</div>
      </>)}
      {(error || validation) && <p role="alert">{error || validation}</p>}
      <footer>
        <button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>
        {review && !result && !error && <button type="button" className="ap-secondary" disabled={busy} onClick={() => setReview(null)}>Back to editing</button>}
        {load.source && !result && <button type="submit" className="ap-primary" disabled={busy || Boolean(error)}>
          {busy ? 'Saving…' : review ? 'Confirm calendar changes' : 'Review changes'}</button>}
      </footer>
    </form>
  </dialog>;
}
