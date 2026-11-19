import React, { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { CLUB_MEMBER_ROLES } from './clubMemberRpc.js';
import { clubMemberAddApi, clubMemberAddArguments } from './clubMemberAdd.js';

export default function ClubMemberAdd({ clubId, members, client, scopeId, session, onBusyChange, onSaved, onCancel, addApi = clubMemberAddApi }) {
  const [query, setQuery] = useState(''), [results, setResults] = useState([]), [searching, setSearching] = useState(false), [player, setPlayer] = useState(null), [role, setRole] = useState('owner');
  const [review, setReview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [saved, setSaved] = useState(null);
  const generation = useRef(0), lock = useRef(false), latest = useRef(null);
  latest.current = { clubId, client, scopeId, userId: session?.user?.id, onBusyChange, onSaved };
  useEffect(() => { generation.current++; setPlayer(null); setReview(null); setResults([]); setQuery(''); setSaved(null); setBlocked(false); setError(''); return () => { generation.current++; }; }, [clubId, client, scopeId, session?.user?.id]);
  useEffect(() => {
    const abort = new AbortController();
    setResults([]); setSearching(false);
    if (query.trim().length < 2 || player || busy || blocked || saved) return () => abort.abort();
    const timer = setTimeout(async () => {
      setSearching(true); setError('');
      try { const rows = await addApi.search({ client, scopeId, userId: session?.user?.id, query, members, signal: abort.signal }); if (!abort.signal.aborted) setResults(rows); }
      catch (err) { if (!abort.signal.aborted) setError(err.message); }
      finally { if (!abort.signal.aborted) setSearching(false); }
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, player, client, scopeId, session?.user?.id, members, addApi, busy, blocked, saved]);
  const enabled = addApi.enabled(client);
  const confirm = async () => {
    if (!enabled || !review || lock.current || blocked || saved) return;
    const token = generation.current, identity = latest.current;
    const isCurrent = () => token === generation.current && ['clubId', 'client', 'scopeId', 'userId'].every(key => latest.current[key] === identity[key]);
    lock.current = true; setBusy(true); latest.current.onBusyChange?.(true);
    try { const outcome = await addApi.submit({ client, scopeId, userId: session?.user?.id, args: review, isCurrent }); if (isCurrent()) { setSaved(outcome); latest.current.onSaved?.(outcome); } }
    catch (err) { if (isCurrent()) { setError(`${err.message} Reload members before trying again.`); setBlocked(true); } }
    finally { lock.current = false; setBusy(false); latest.current.onBusyChange?.(false); }
  };
  return <section className="clubs-draft" aria-label="Add club member" style={{ padding: 20, display: 'grid', gap: 16, minWidth: 0, overflowWrap: 'anywhere' }}>
    <h4 style={{ fontSize: 18, margin: 0 }}>Add club member</h4>
    <p className="fo-note">{enabled ? 'Staging only. Confirmation grants access immediately and queues a notification. No acceptance step is required.' : 'Local review preview only. Search existing players and review access; nothing is saved and no notification is queued.'}</p>
    {saved ? <p role="status">Member added — access granted. {saved.notification === 'pending' ? 'Notification queued; email delivery is not confirmed.' : 'Email delivery is not confirmed.'}</p> : <>
      <fieldset disabled={busy || blocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 16 }}>
        {player ? <div><strong>{player.name || 'Name unavailable'}</strong><p>{player.email}</p><button type="button" className="ap-secondary" onClick={() => { setPlayer(null); setReview(null); }}>Change player</button></div> : <>
          <label className="clubs-feedback">Search existing players<input type="search" value={query} placeholder="Name or email…" onChange={e => setQuery(e.target.value)} /></label>
          <p role="status">{query.trim().length < 2 ? 'Type at least 2 characters to search.' : searching ? 'Searching players…' : `${results.length} available players`}</p>
          <ul className="clubs-management-list">{results.map(row => <li key={row.id}><div><strong>{row.name || 'Name unavailable'}</strong><p>{row.email}</p></div><button type="button" className="ap-secondary" onClick={() => { setPlayer(structuredClone(row)); setReview(null); }}>Select player</button></li>)}</ul>
        </>}
        <label className="fo-status-filter">Member role<SearchableDropdown value={role} onChange={e => { setRole(e.target.value); setReview(null); }}>{CLUB_MEMBER_ROLES.map(value => <option key={value} value={value}>{value}</option>)}</SearchableDropdown></label>
        <button type="button" className="ap-secondary" disabled={!player} onClick={() => { try { setReview(clubMemberAddArguments(clubId, player, role, crypto.randomUUID())); setError(''); } catch (err) { setError(err.message); } }}>Review new member</button>
      </fieldset>
      {review && <div role="status" style={{ display: 'grid', gap: 16 }}><p>Grant <strong>{review.p_role}</strong> access to <strong>{review.p_expected_player.name || review.p_expected_player.email}</strong> ({review.p_expected_player.email}) for this club. Access begins immediately when confirmed.</p>{enabled ? <button type="button" className="ap-primary" disabled={busy || blocked} onClick={confirm}>{busy ? 'Adding member…' : 'Confirm staging member addition'}</button> : <p>Preview only — no access has been granted.</p>}</div>}
    </>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="ap-secondary" disabled={busy} onClick={() => onCancel?.(blocked)}>{blocked ? 'Close and reload members' : saved ? 'Close new member' : 'Discard new member'}</button>
  </section>;
}
