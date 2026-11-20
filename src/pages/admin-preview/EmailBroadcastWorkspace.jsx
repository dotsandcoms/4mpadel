import React, { useEffect, useMemo, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import EventRichTextEditor from '../../components/admin/EventRichTextEditor';
import { sanitizeHtml, safeUrl } from '../../utils/sanitizeHtml';
import RecordLoading from './RecordLoading';
import { canReviewBroadcast, verifyBroadcastAccess, loadBroadcastEvents, loadBroadcastAudience, parseBroadcastEmails, combineBroadcastAudience, emailBroadcastCapability, sendReviewedBroadcastBatch } from './emailBroadcastData.js';
import './EmailBroadcastWorkspace.css';

const empty = { events: [], payment: 'all', partner: 'all', manual: false, manualText: '', subject: '', html: '', tests: '', excluded: [] };
export default function EmailBroadcastWorkspace({ client, session, permissions, scopeId = 'all', refreshRevision = 0 }) {
  const [draft, setDraft] = useState(empty), [catalog, setCatalog] = useState({ loading: true }), [audience, setAudience] = useState({ emails: [] });
  const [search, setSearch] = useState(''), [list, setList] = useState(false), [review, setReview] = useState(null), [error, setError] = useState(''), [checking, setChecking] = useState(false), [resetting, setResetting] = useState(false), [revision, setRevision] = useState(0);
  const [url, setUrl] = useState(''), [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false), [deliveryStatus, setDeliveryStatus] = useState('');
  const deliveryAttempts = useRef(new Map());
  const latest = useRef(null), pending = useRef(null), guard = useRef(false), reviewRef = useRef(null);
  const userId = session?.user?.id, userEmail = session?.user?.email, allowed = scopeId === 'all' && canReviewBroadcast(permissions);
  latest.current = { client, userId, userEmail, scopeId, draft };
  const change = (key, value) => { setDraft(old => ({ ...old, [key]: value })); setReview(null); setError(''); setDeliveryStatus(''); };
  const changed = JSON.stringify(draft) !== JSON.stringify(empty) || Boolean(url || caption);
  useEffect(() => {
    if (!changed) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed]);
  useEffect(() => { setDraft(empty); setReview(null); setError(''); setSearch(''); setUrl(''); setCaption(''); setDeliveryStatus(''); setSending(false); deliveryAttempts.current.clear(); pending.current?.abort(); return () => pending.current?.abort(); }, [client, userId, userEmail, scopeId]);
  useEffect(() => {
    const abort = new AbortController(); setCatalog({ loading: true });
    if (!allowed) { setCatalog({ error: 'Platform Email Broadcast permission is required.' }); return () => abort.abort(); }
    const timer = setTimeout(() => { abort.abort(); setCatalog({ error: 'Event loading timed out. Retry when ready.' }); }, 20000);
    loadBroadcastEvents({ client, userId, scopeId, signal: abort.signal }).then(events => { if (!abort.signal.aborted) setCatalog({ events }); }).catch(err => { if (!abort.signal.aborted) setCatalog({ error: err.message }); }).finally(() => clearTimeout(timer));
    return () => { abort.abort(); clearTimeout(timer); };
  }, [client, userId, scopeId, allowed, revision, refreshRevision]);
  useEffect(() => {
    const abort = new AbortController(); setAudience({ loading: true, emails: [] }); setReview(null);
    if (!allowed) { setAudience({ emails: [] }); return () => abort.abort(); }
    const timer = setTimeout(() => { abort.abort(); setAudience({ emails: [], error: 'Audience loading timed out. Retry events.' }); }, 20000);
    loadBroadcastAudience({ client, userId, scopeId, eventIds: draft.events, payment: draft.payment, partner: draft.partner, signal: abort.signal }).then(emails => { if (!abort.signal.aborted) setAudience({ emails }); }).catch(err => { if (!abort.signal.aborted) setAudience({ emails: [], error: err.message }); }).finally(() => clearTimeout(timer));
    return () => { abort.abort(); clearTimeout(timer); };
  }, [client, userId, scopeId, allowed, draft.events, draft.payment, draft.partner, revision, refreshRevision]);
  const manual = useMemo(() => parseBroadcastEmails(draft.manual ? draft.manualText : ''), [draft.manual, draft.manualText]);
  const pool = combineBroadcastAudience(audience.emails, manual.emails);
  const activeExcluded = draft.excluded.filter(email => pool.includes(email));
  const recipients = combineBroadcastAudience(audience.emails, manual.emails, activeExcluded);
  const eventAudienceError = draft.events.length > 0 && (audience.error || catalog.error);
  const eventAudienceUnavailable = Boolean(eventAudienceError || (draft.events.length > 0 && audience.loading));
  useEffect(() => { if (!audience.loading && !audience.error) setDraft(old => { const excluded = old.excluded.filter(email => pool.includes(email)); return excluded.length === old.excluded.length ? old : { ...old, excluded }; }); }, [audience, manual]);
  const buildReview = async kind => {
    if (guard.current || !allowed) return;
    setError(''); setReview(null); setDeliveryStatus('');
    const clean = sanitizeHtml(draft.html), text = document.createElement('div'); text.innerHTML = clean;
    const tests = parseBroadcastEmails(draft.tests);
    if (!draft.subject.trim() || (!text.textContent.trim() && !text.querySelector('img'))) { setError('Enter a subject and message before reviewing.'); return; }
    if ((kind === 'broadcast' && manual.invalid.length) || (kind === 'test' && (tests.invalid.length || !tests.emails.length))) { setError('Correct the invalid email addresses before reviewing.'); return; }
    const identity = latest.current, abort = new AbortController(); pending.current = abort; guard.current = true; setChecking(true);
    const current = () => !abort.signal.aborted && ['client','userId','userEmail','scopeId','draft'].every(key => latest.current[key] === identity[key]);
    let timer;
    try {
      const read = kind === 'test' ? verifyBroadcastAccess(client, userId, scopeId, abort.signal).then(() => []) : loadBroadcastAudience({ client, userId, scopeId, eventIds: draft.events, payment: draft.payment, partner: draft.partner, signal: abort.signal });
      const emails = await Promise.race([read, new Promise((_, reject) => { abort.signal.addEventListener('abort', () => reject(new Error('Review cancelled.')), { once: true }); timer = setTimeout(() => { reject(new Error('Review timed out. Please try again.')); abort.abort(); }, 20000); })]);
      if (!current()) return;
      const final = kind === 'test' ? tests.emails : combineBroadcastAudience(emails, manual.emails, draft.excluded);
      if (!final.length) throw new Error('Select at least one recipient before reviewing.');
      let delivery, unavailable;
      try { delivery = await emailBroadcastCapability(client, abort.signal); }
      catch (issue) { unavailable = issue.message; }
      if (!current()) return;
      if (kind === 'broadcast') setAudience({ emails });
      setReview({ kind, recipients: final, count: final.length, subject: draft.subject.trim() + (kind === 'test' ? ' (TEST)' : ''), html: clean, delivery, unavailable });
      requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    } catch (err) { if (latest.current === identity || ['client','userId','userEmail','scopeId','draft'].every(key => latest.current[key] === identity[key])) setError(err.message); }
    finally { clearTimeout(timer); guard.current = false; setChecking(false); }
  };
  const sendReview = async () => {
    if (guard.current || !allowed || !review?.delivery) return;
    const identity = latest.current, abort = new AbortController();
    const current = () => !abort.signal.aborted && ['client','userId','userEmail','scopeId','draft'].every(key => latest.current[key] === identity[key]);
    pending.current = abort;
    guard.current = true;
    setSending(true); setError(''); setDeliveryStatus('');
    const batchSize = review.delivery.batchSize;
    const signature = JSON.stringify([review.kind, review.subject, review.html, [...review.recipients].sort()]);
    let attempt = deliveryAttempts.current.get(signature);
    try {
      const signedIn = await verifyBroadcastAccess(client, userId, scopeId, abort.signal);
      if (signedIn.email !== userEmail?.trim().toLowerCase() || !current()) throw new Error('The signed-in account changed. Reopen the review.');
      if (review.kind === 'broadcast' && draft.events.length) {
        let emails;
        try {
          emails = await loadBroadcastAudience({ client, userId, scopeId, eventIds: draft.events,
            payment: draft.payment, partner: draft.partner, signal: abort.signal });
        } catch (issue) {
          if (current()) {
            setReview(null);
            setAudience({ emails: [], error: issue.message });
          }
          throw issue;
        }
        if (!current()) return;
        const checkedRecipients = new Set(combineBroadcastAudience(emails, manual.emails, draft.excluded));
        if (checkedRecipients.size !== review.recipients.length || review.recipients.some(email => !checkedRecipients.has(email))) {
          setReview(null);
          setAudience({ emails });
          throw new Error('The event audience changed. Review the updated recipients before sending.');
        }
      }
      await emailBroadcastCapability(client, abort.signal);
      if (!current()) return;
      if (!deliveryAttempts.current.has(signature)) {
        const batches = [];
        for (let index = 0; index < review.recipients.length; index += batchSize) {
          batches.push({ id: crypto.randomUUID(), emails: review.recipients.slice(index, index + batchSize) });
        }
        deliveryAttempts.current.set(signature, { batches, completed: 0, startedAt: Date.now() });
      }
      attempt = deliveryAttempts.current.get(signature);
      if (Date.now() - attempt.startedAt > 23 * 60 * 60 * 1000) throw new Error('This delivery review expired. Check the original delivery result before sending again.');
      for (const batch of attempt.batches.slice(attempt.completed)) {
        if (!current()) return;
        await sendReviewedBroadcastBatch(client, { signal: abort.signal, requestId: batch.id, emails: batch.emails, subject: review.subject, html: review.html });
        if (!current()) return;
        attempt.completed++;
      }
      deliveryAttempts.current.delete(signature);
      setDeliveryStatus(`Email accepted by the provider for ${review.count} recipient${review.count === 1 ? '' : 's'}.`);
      setReview(null);
      if (review.kind === 'broadcast') setDraft(empty);
    } catch (issue) {
      if (current()) setError(`${issue.message}${attempt?.completed ? ` The provider accepted ${attempt.completed} earlier batch${attempt.completed === 1 ? '' : 'es'}.` : ''}`);
    } finally {
      if (pending.current === abort) {
        pending.current = null; guard.current = false;
        if (!abort.signal.aborted) setSending(false);
      }
    }
  };
  const insertMedia = image => {
    const href = safeUrl(url); if (!href) { setError('Enter a valid http or https URL.'); return; }
    const node = document.createElement(image ? 'img' : 'a');
    if (image) { node.src = href; node.alt = caption || ''; } else { node.href = href; node.textContent = caption || href; node.rel = 'noopener noreferrer'; }
    change('html', draft.html + `<p>${node.outerHTML}</p>`); setUrl(''); setCaption('');
  };
  if (!allowed) return <div className="email-broadcast"><h1>Email broadcast</h1><p role="alert">Platform Email Broadcast access is required. Scoped event access does not grant broadcast access.</p></div>;
  return <div className="email-broadcast"><header><h1>Email broadcast</h1><p className="fo-note">Build a BCC audience from event registrations or a manual list, then review the message before sending.</p></header>
    <fieldset className="email-broadcast-grid" disabled={sending}><div className="email-broadcast-stack">
      <section><h2>Audience</h2><p className="fo-note">Choose events. Duplicate email addresses are counted once, ignoring case and surrounding spaces.</p>
        <label>Search events<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Event name…"/></label>
        {catalog.loading ? <RecordLoading label="Loading events…"/> : catalog.error ? <p role="alert">{catalog.error}</p> : <div className="email-broadcast-events">{catalog.events.filter(event => String(event.event_name || '').toLowerCase().includes(search.toLowerCase())).map(event => <label className="email-broadcast-check" key={event.id}><input type="checkbox" checked={draft.events.includes(String(event.id))} onChange={e => change('events', e.target.checked ? [...draft.events, String(event.id)] : draft.events.filter(id => id !== String(event.id)))}/><span>{event.event_name || 'Unnamed event'}<small>{event.start_date || 'Date not set'}</small></span></label>)}</div>}
        <div className="email-broadcast-filters"><label>Payment<SearchableDropdown value={draft.payment} onChange={e => change('payment', e.target.value)}><option value="all">All payments</option><option value="paid">Paid</option><option value="pending">Pending / not paid</option></SearchableDropdown></label><label>Partner<SearchableDropdown value={draft.partner} onChange={e => change('partner', e.target.value)}><option value="all">All entries</option><option value="has_partner">Has partner</option><option value="solo">Solo / no partner</option></SearchableDropdown></label></div>
        {(draft.payment !== 'all' || draft.partner !== 'all') && <p className="fo-note">Filters use site registrations only. Rankedin participants have no payment or partner state and are excluded while filters are active.</p>}
        {audience.error && <p role="alert">{audience.error} No partial audience is usable.</p>}<button type="button" className="ap-secondary" onClick={() => setRevision(n => n + 1)}>Reload events and audience</button>
      </section>
      <section><h2>Manual recipients</h2><label className="email-broadcast-check"><input type="checkbox" checked={draft.manual} onChange={e => change('manual', e.target.checked)}/>Include a manual email list</label>{draft.manual && <label>Email addresses<textarea rows={3} value={draft.manualText} onChange={e => change('manualText', e.target.value)} placeholder="Comma or newline separated…"/></label>}{manual.invalid.length > 0 && <p role="alert">{manual.invalid.length} invalid address(es). Correct these before review.</p>}</section>
      <section><h2>Message</h2><label>Subject<input value={draft.subject} onChange={e => change('subject', e.target.value)} placeholder="Your announcement…"/></label><p className="fo-note">The existing broadcast template wraps this content as an “Important Announcement”. The preview below shows the message body, not the final email template.</p><div inert={sending || undefined}><EventRichTextEditor theme="preview" value={draft.html} onChange={html => change('html', html)} label="Broadcast message" minHeight={240}/></div><div className="email-broadcast-urls"><label>Link or image URL<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…"/></label><label>Link text / image description<input value={caption} onChange={e => setCaption(e.target.value)}/></label><div className="email-broadcast-actions"><button className="ap-secondary" type="button" onClick={() => insertMedia(false)}>Add link</button><button className="ap-secondary" type="button" onClick={() => insertMedia(true)}>Add image preview</button></div></div></section>
    </div><aside className="email-broadcast-stack">
      <section>
        <h2>Audience summary</h2>
        <p className="email-broadcast-count" role="status">{eventAudienceUnavailable ? audience.loading ? 'Loading…' : 'Unavailable' : recipients.length}</p>
        <p>Unique recipients · BCC</p>
        <p className="fo-note">{audience.emails.length} event addresses + {manual.emails.length} manual · {activeExcluded.length} removed</p>
        <button type="button" className="ap-secondary" disabled={eventAudienceUnavailable} onClick={() => setList(!list)}>{list ? 'Hide recipients' : 'Review recipients'}</button>
        {list && !eventAudienceUnavailable && <ul className="email-broadcast-recipient-list">{recipients.map(email => <li key={email}><span>{email}</span><button className="ap-secondary" type="button" aria-label={`Remove ${email}`} onClick={() => change('excluded', [...draft.excluded, email])}>Remove</button></li>)}</ul>}
        {activeExcluded.length > 0 && <button type="button" className="ap-secondary" onClick={() => change('excluded', [])}>Restore removed recipients</button>}
        {eventAudienceError && <button type="button" className="ap-secondary" onClick={() => change('events', [])}>Clear selected events</button>}
        <p className="fo-note">No recipient export is available.</p>
        <button type="button" className="ap-primary" disabled={checking || eventAudienceUnavailable} onClick={() => buildReview('broadcast')}>{checking ? 'Checking access…' : 'Review broadcast'}</button>
      </section>
      <section><h2>Test review</h2><label>Test email addresses<textarea rows={2} value={draft.tests} onChange={e => change('tests', e.target.value)} placeholder="Comma or newline separated…"/></label><p className="fo-note">Test subjects end with “(TEST)”.</p><button type="button" className="ap-secondary" disabled={checking} onClick={() => buildReview('test')}>Review test</button></section>
      <section><h2>Draft controls</h2>{resetting ? <><p>Discard this local draft, audience and exclusions?</p><div className="email-broadcast-actions"><button type="button" className="ap-danger-button" onClick={() => { pending.current?.abort(); setDraft(empty); setReview(null); setError(''); setResetting(false); setUrl(''); setCaption(''); }}>Discard draft</button><button type="button" className="ap-secondary" onClick={() => setResetting(false)}>Keep draft</button></div></> : <button type="button" className="ap-secondary" onClick={() => setResetting(true)}>Reset draft</button>}</section>
    </aside></fieldset>
    {error && <p role="alert">{error}</p>}{deliveryStatus && <p role="status">{deliveryStatus}</p>}
    {review && <section ref={reviewRef} className="email-broadcast-review" aria-label="Broadcast review"><h2>{review.kind === 'test' ? 'Test review' : 'Broadcast review'}</h2><p><strong>{review.subject}</strong></p><p>{review.count} recipient(s) · {review.kind === 'test' ? 'test list' : 'BCC audience'}</p><div className="email-broadcast-preview" dangerouslySetInnerHTML={{ __html: review.html }}/>{review.unavailable && <p className="fo-note" role="status">{review.unavailable}</p>}
      <div className="email-broadcast-actions">
        <button type="button" className="ap-secondary" disabled={sending} onClick={() => setReview(null)}>Back to draft</button>
        {review.delivery
          ? <button type="button" className="ap-primary" disabled={sending} onClick={sendReview}>{sending ? 'Sending…' : review.kind === 'test' ? 'Send test email' : 'Send broadcast'}</button>
          : <button type="button" className="ap-secondary" disabled={checking} onClick={() => void buildReview(review.kind)}>Check delivery access</button>}
      </div></section>}
  </div>;
}
