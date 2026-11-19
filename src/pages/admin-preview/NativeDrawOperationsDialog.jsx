import { useEffect, useId, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { useEventOperation } from './useEventOperation.js';
import {
  canReopenNativeDraw, canUpdateNativeMatches, listNativeDrawOperations, loadNativeDrawOperations,
  saveNativeDrawOperation, validNativeLiveMatch,
} from './nativeDrawOperations.js';
import './EventPaymentDialog.css';

const blankAnnouncement = { scope: 'draw', title: '', message: '', pinned: false };
const drawLabel = draw => {
  const kind = { main: 'Main draw', silver: 'Silver plate', bronze: 'Bronze plate' }[draw.draw_kind] || 'Draw';
  return (draw.tournament_divisions?.name || 'Division') + ' · ' + kind + ' · ' + draw.status;
};

export default function NativeDrawOperationsDialog({ client, session, scopeId, event, onClose }) {
  const title = useId();
  const userId = session?.user?.id;
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });
  const [draws, setDraws] = useState(null);
  const [drawId, setDrawId] = useState('');
  const [stored, setStored] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [matchId, setMatchId] = useState('');
  const [form, setForm] = useState(blankAnnouncement);
  const [review, setReview] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setDraws(null);
    listNativeDrawOperations({ client, event, expectedUserId: userId, scopeId, signal: controller.signal, isCurrent: () => !controller.signal.aborted })
      .then(rows => {
        if (controller.signal.aborted) return;
        const next = rows.filter(draw => draw.status !== 'archived');
        setDraws(next);
        setDrawId(next[0]?.id || '');
      })
      .catch(issue => { if (!controller.signal.aborted) setLoadError(issue.message); });
    return () => controller.abort();
  }, [client, event.id, scopeId, userId]);

  useEffect(() => {
    if (!drawId) return;
    const controller = new AbortController();
    loadNativeDrawOperations({ client, event, drawId, expectedUserId: userId, scopeId, signal: controller.signal, isCurrent: () => !controller.signal.aborted })
      .then(snapshot => { if (!controller.signal.aborted) setStored(snapshot); })
      .catch(issue => { if (!controller.signal.aborted) setLoadError(issue.message); });
    return () => controller.abort();
  }, [client, event.id, drawId, scopeId, userId]);

  const selected = stored?.draw.id === drawId ? stored : null;
  const match = selected?.matches.find(row => row.id === matchId);
  const updateForm = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const changeDraw = id => {
    setDrawId(id);
    setMatchId('');
    setStored(null);
    setLoadError('');
  };
  const confirm = formEvent => {
    formEvent.preventDefault();
    if (!review || !selected) return;
    run(checks => saveNativeDrawOperation({
      client, event, draw: selected.draw, operation: review, expectedUserId: userId, scopeId, ...checks,
    }));
  };
  const reviewMatch = (type, heading) => setReview({ type, match, heading, summary: match.label });
  const matchLive = match?.status === 'in_progress';
  const announcementScope = { event: 'Whole event', division: 'This division', draw: 'This draw only' };

  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Native draw operations</h2></div><button type="button" className="ap-icon-button" disabled={busy} aria-label="Close native draw operations" onClick={close}>×</button></header>
    <form onSubmit={confirm}>
      {result ? <p role="status">{result}</p> : review ? <>
        <h3>{review.heading}</h3><p>{review.summary}</p>
        {review.type === 'reopen' && <p className="ap-payment-live-note">The draw returns to a draft and stays private until it is published again. Recorded play can prevent reopening.</p>}
        {review.type === 'announce' && <p className="ap-payment-live-note">{announcementScope[review.scope]}{review.pinned ? ' · Pinned announcement' : ''}. Confirming publishes this message on the public draw.</p>}
        {error && <p role="alert">{error}</p>}
      </> : <>
        {loadError && <p role="alert">{loadError}</p>}
        {!loadError && !draws && <p role="status">Loading event draws…</p>}
        {draws?.length === 0 && <p>Save a draw in Tournament Manager to manage live matches and announcements.</p>}
        {draws?.length > 0 && <label>Draw<SearchableDropdown value={drawId} onChange={event => changeDraw(event.target.value)}>
          {draws.map(draw => <option key={draw.id} value={draw.id}>{drawLabel(draw)}</option>)}
        </SearchableDropdown></label>}
        {drawId && !selected && !loadError && <p role="status">Loading draw matches…</p>}
        {selected && <>
          {canReopenNativeDraw(selected.draw) && <button type="button" className="ap-secondary" onClick={() => setReview({ type: 'reopen', heading: 'Reopen draw for corrections', summary: drawLabel(selected.draw) })}>Reopen draw for corrections</button>}
          {canUpdateNativeMatches(selected.draw) && selected.matches.length > 0 && <>
            <label>Match<SearchableDropdown value={matchId} onChange={event => setMatchId(event.target.value)}><option value="">Choose a match</option>
              {selected.matches.map(row => <option key={row.id} value={row.id}>{row.round_label} · {row.label}{row.is_featured ? ' · Featured' : ''}</option>)}
            </SearchableDropdown></label>
            {match && <div className="ap-modal-actions">
              {validNativeLiveMatch(match) && <button type="button" className="ap-secondary" onClick={() => reviewMatch('live', matchLive ? 'Clear live status' : 'Mark match live')}>{matchLive ? 'Clear live status' : 'Mark match live'}</button>}
              {selected.featuredAvailable && <button type="button" className="ap-secondary" onClick={() => reviewMatch('feature', match.is_featured ? 'Remove featured match' : 'Feature match')}>{match.is_featured ? 'Remove featured match' : 'Feature match'}</button>}
            </div>}
            {!selected.featuredAvailable && <p>Featured-match controls are unavailable on this connection.</p>}
          </>}
          {selected.announcements ? <section className="ap-draw-announcements">
            <h3>Public announcements</h3>
            {selected.announcements.length > 0 && <ul>{selected.announcements.map(item => <li key={item.id}>
              <strong>{item.title || item.message}</strong>{item.title && <p>{item.message}</p>}
              <button type="button" className="ap-text-button" onClick={() => setReview({ type: 'remove-announcement', announcement: item, heading: 'Remove public announcement', summary: item.message })}>Remove announcement</button>
            </li>)}</ul>}
            <label>Audience<SearchableDropdown value={form.scope} onChange={event => updateForm('scope', event.target.value)}>
              {Object.entries(announcementScope).map(([scope, label]) => <option key={scope} value={scope}>{label}</option>)}
            </SearchableDropdown></label>
            <label>Announcement title<input value={form.title} onChange={event => updateForm('title', event.target.value)} /></label>
            <label>Announcement message<textarea value={form.message} onChange={event => updateForm('message', event.target.value)} /></label>
            <label className="ap-draw-pinned"><input type="checkbox" checked={form.pinned} onChange={event => updateForm('pinned', event.target.checked)} />Pin announcement</label>
            <button type="button" className="ap-secondary" disabled={!form.message.trim()} onClick={() => setReview({ ...form, type: 'announce', heading: form.title.trim() || 'Review public announcement', summary: form.message.trim() })}>Review announcement</button>
          </section> : <p>Public announcements are unavailable on this connection.</p>}
        </>}
      </>}
      <footer>
        {review && !result && <button type="button" className="ap-secondary" disabled={busy || Boolean(error)} onClick={() => setReview(null)}>Back</button>}
        <button type="button" className="ap-secondary" onClick={close} disabled={busy}>{result ? 'Done' : 'Close'}</button>
        {review && !result && <button type="submit" className="ap-primary" disabled={busy || Boolean(error)}>{busy ? 'Saving…' : 'Confirm draw action'}</button>}
      </footer>
    </form>
  </dialog>;
}
