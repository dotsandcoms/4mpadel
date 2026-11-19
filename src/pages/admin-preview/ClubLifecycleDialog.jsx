import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { reviewClubLifecycle, saveClubLifecycle } from './clubLifecycle.js';
import { useEventOperation } from './useEventOperation.js';

const counters = [['players', 'Players'], ['events', 'Events'], ['members', 'Members'], ['organisations', 'Organisation links'],
  ['claims', 'Claim requests'], ['invitations', 'Invitations'], ['favourites', 'App favourites'], ['places', 'Places matches']];

function Impact({ source, target }) {
  return <table className="fo-detail-table">
    <thead><tr><th scope="col">Linked records</th><th scope="col">{source.name}</th>{target && <th scope="col">{target.name}</th>}</tr></thead>
    <tbody>{counters.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td>{source[key]}</td>{target && <td>{target[key]}</td>}</tr>)}</tbody>
  </table>;
}

export default function ClubLifecycleDialog({ kind, club, directory, client, session, scopeId, onClose, onComplete, onBusyChange }) {
  const title = useId();
  const [query, setQuery] = useState(''), [target, setTarget] = useState(null);
  const [response, setResponse] = useState(null), [reload, setReload] = useState(0), [confirmation, setConfirmation] = useState('');
  const userId = session?.user?.id;
  const { bindDialog, busy, error, result, close, run } = useEventOperation({
    client, event: club, session, scopeId, onBusyChange,
    onClose: ({ refresh }) => { if (result || refresh) onComplete(); else onClose(); },
  });
  const merging = kind === 'merge';
  const targetId = target?.id ?? null;
  const key = JSON.stringify([club.id, targetId, userId, scopeId, reload]);
  const reply = response?.key === key ? response : null;
  const review = reply?.review;
  const blocked = !merging && review?.source.players > 0;
  const needle = query.trim().toLowerCase();
  const candidates = needle.length >= 2 ? directory.filter(row => row.id !== club.id
    && [row.name, row.city, row.short_name].some(value => value?.toLowerCase().includes(needle))).slice(0, 8) : [];

  useEffect(() => {
    if (merging && !targetId) return;
    const controller = new AbortController();
    reviewClubLifecycle({ client, session: { user: { id: userId } }, scopeId, sourceId: club.id, targetId, signal: controller.signal })
      .then(review => { if (!controller.signal.aborted) setResponse({ key, review, requestId: crypto.randomUUID() }); })
      .catch(issue => { if (!controller.signal.aborted) setResponse({ key, error: issue.message }); });
    return () => controller.abort();
  }, [client, scopeId, club.id, targetId, merging, userId, key]);

  const selectTarget = value => { setTarget(value); setResponse(null); setConfirmation(''); setQuery(''); };
  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{club.name}</p><h2 id={title}>{merging ? 'Merge duplicate club' : 'Delete club'}</h2></div>
      <button type="button" className="ap-icon-button" aria-label="Close club review" disabled={busy} onClick={close}><X size={20}/></button></header>
    <form onSubmit={event => {
      event.preventDefault();
      if (!review || confirmation !== review.source.name || blocked || busy || error || result) return;
      run(({ isCurrent, onAttempt }) => {
        onAttempt();
        return saveClubLifecycle({ client, session, scopeId, review, confirmation, requestId: reply.requestId, isCurrent });
      });
    }}>
      {result ? <p role="status">{merging ? `Merged ${result.source_name} into ${result.target_name}.` : `Deleted ${result.source_name}.`}</p> : <>
        {merging && !target && <label>Search for the destination club<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>}
        {merging && !target && needle.length >= 2 && (candidates.length ? <ul>{candidates.map(row => <li key={row.id}>
          <button type="button" className="ap-secondary" onClick={() => selectTarget(row)}>{[row.name, row.city].filter(Boolean).join(' · ')}</button></li>)}</ul> : <p>No matching clubs.</p>)}
        {target && <p>Destination <strong>{target.name}</strong> <button type="button" className="ap-secondary" disabled={busy || Boolean(error)} onClick={() => selectTarget(null)}>Change destination</button></p>}
        {(target || !merging) && !reply && <p role="status">Loading linked records…</p>}
        {reply?.error && <p role="alert">{reply.error} <button type="button" className="ap-secondary" onClick={() => setReload(value => value + 1)}>Retry review</button></p>}
        {review && <>
          <Impact source={review.source} target={review.target}/>
          <p>{merging ? 'Players, events, memberships, organisation links, claims, invitations and app favourites move to the destination. Existing destination records take precedence. The source and its Places match are removed.'
            : 'This permanently removes the club and its memberships, organisation links, claims, invitations, app favourites and Places matches. Linked events remain and lose the club association.'}</p>
          {blocked ? <p role="alert">This club has linked players. Merge it into the correct club first.</p>
            : <label>Type {review.source.name} to confirm<input autoComplete="off" value={confirmation} disabled={busy || Boolean(error)} onChange={event => setConfirmation(event.target.value)} /></label>}
        </>}
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>
        {!result && <button type="submit" className="ap-danger-button" disabled={!review || confirmation !== review.source.name || blocked || busy || Boolean(error)}>
          {busy ? 'Saving…' : merging ? 'Confirm club merge' : 'Confirm club deletion'}</button>}</footer>
    </form>
  </dialog>;
}
