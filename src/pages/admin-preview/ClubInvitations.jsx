import React, { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { loadClubInvitations, prepareClubInvitationPreview, searchClubInvitationPlayers } from './clubInvitations.js';
import { clubInvitationCreationApi, clubInvitationCreationArguments } from './clubInvitationCreation.js';

const api = { load: loadClubInvitations, prepare: prepareClubInvitationPreview, search: searchClubInvitationPlayers };
const dateLabel = value => {
  const date = value && new Date(value);
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(date) : 'Not recorded';
};

// Creation is separately gated to staging. There is no provider/OTP capability;
// history and receipts are metadata only, never bearer tokens.
export default function ClubInvitations({ client, scopeId, session, clubId, onBusyChange, invitationApi = api, creationApi = clubInvitationCreationApi, timeoutMs = 20000 }) {
  const [opened, setOpened] = useState(false), [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true }), [filter, setFilter] = useState('all'), [page, setPage] = useState(1);
  const [email, setEmail] = useState(''), [review, setReview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null), [search, setSearch] = useState({ rows: [] });
  const [saved, setSaved] = useState(null), [uncertain, setUncertain] = useState(false);
  const request = useRef(null), locked = useRef(false), latest = useRef(null), generation = useRef(0), createdRows = useRef([]);
  // Keep newly created metadata when an older read finishes, but never replace
  // an authoritative recorded status with the original pending creation receipt.
  const mergeCreated = rows => [...createdRows.current.filter(created => !rows.some(row => row.id === created.id)), ...rows];
  latest.current = { client, scopeId, userId: session?.user?.id, clubId, onBusyChange };
  useEffect(() => {
    generation.current++; createdRows.current = []; setReview(null); setEmail(''); setSelectedPlayer(null); setSearch({ rows: [] }); setError(''); setPage(1); setFilter('all'); setSaved(null); setUncertain(false);
    return () => { generation.current++; request.current?.abort(); };
  }, [client, scopeId, session?.user?.id, clubId]);
  useEffect(() => {
    const controller = new AbortController(); let timeout;
    setSearch({ rows: [] });
    if (!opened || selectedPlayer || busy || review || email.trim().length < 2) return () => controller.abort();
    const timer = setTimeout(async () => {
      setSearch({ rows: [], loading: true });
      timeout = setTimeout(() => { if (!controller.signal.aborted) setSearch({ rows: [], error: 'Player search took too long. Change the search to try again.' }); controller.abort(); }, timeoutMs);
      try {
        const rows = await invitationApi.search({ client, scopeId, userId: session?.user?.id, clubId, query: email, signal: controller.signal });
        if (!controller.signal.aborted) setSearch({ rows });
      } catch (err) { if (!controller.signal.aborted) setSearch({ rows: [], error: err.message }); }
      finally { clearTimeout(timeout); }
    }, 350);
    return () => { clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [opened, email, selectedPlayer, busy, review, client, scopeId, session?.user?.id, clubId, invitationApi, timeoutMs]);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setState({ loading: true });
    const timeout = setTimeout(() => { controller.abort(); setState({ error: 'Loading invitations took too long. Try again.' }); }, 20000);
    invitationApi.load({ client, scopeId, userId: session?.user?.id, clubId, signal: controller.signal })
      .then(rows => { if (!controller.signal.aborted) setState({ rows: mergeCreated(rows) }); })
      .catch(err => { if (!controller.signal.aborted) setState({ error: err.message }); })
      .finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [opened, revision, client, scopeId, session?.user?.id, clubId, invitationApi]);
  const enabled = creationApi.enabled(client);
  const prepare = async event => {
    event.preventDefault();
    if (locked.current || uncertain || saved) return;
    const identity = latest.current, token = generation.current, controller = new AbortController(); request.current = controller;
    const current = () => token === generation.current && ['client', 'scopeId', 'userId', 'clubId'].every(key => identity[key] === latest.current[key]);
    locked.current = true; setBusy(true); onBusyChange?.(true); setError(''); setReview(null);
    let timeout;
    const stopped = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Profile lookup was cancelled. Try again.')), { once: true });
      timeout = setTimeout(() => { reject(new Error('Profile lookup took too long. Try again.')); controller.abort(); }, timeoutMs);
    });
    try {
      const result = await Promise.race([(enabled ? creationApi : invitationApi).prepare({ client, scopeId, userId: identity.userId, clubId, email, signal: controller.signal }), stopped]);
      if (current()) setReview(enabled ? { ...result, args: clubInvitationCreationArguments(result, crypto.randomUUID()) } : result);
    } catch (err) { if (current()) setError(err.message); }
    finally { clearTimeout(timeout); locked.current = false; setBusy(false); latest.current.onBusyChange?.(false); }
  };
  const confirm = async () => {
    if (!enabled || !review?.args || locked.current || saved) return;
    const identity = latest.current, token = generation.current, controller = new AbortController(); request.current = controller;
    const current = () => token === generation.current && ['client', 'scopeId', 'userId', 'clubId'].every(key => identity[key] === latest.current[key]);
    locked.current = true; setBusy(true); onBusyChange?.(true); setError('');
    let timeout;
    const stopped = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Invitation request interrupted.')), { once: true });
      timeout = setTimeout(() => { reject(new Error('The invitation response timed out.')); controller.abort(); }, timeoutMs);
    });
    try {
      const result = await Promise.race([creationApi.submit({ client, scopeId, userId: identity.userId, args: review.args, isCurrent: () => current() && !controller.signal.aborted }), stopped]);
      if (current()) {
        setSaved(result); setUncertain(false);
        if (result.already_applied) {
          // An idempotent receipt describes creation, not today's status. The
          // recipient may already have accepted; only refresh this history.
          setRevision(value => value + 1);
        } else {
          createdRows.current = [{ id: result.invite_id, club_id: result.club_id, email: result.email, status: result.status, created_at: result.created_at }, ...createdRows.current.filter(row => row.id !== result.invite_id)];
          setState(previous => ({ ...previous, rows: mergeCreated(previous.rows || []) }));
        }
        setFilter('all'); setPage(1);
      }
    } catch (err) { if (current()) { setUncertain(true); setError(`${err.message} The outcome is not confirmed. Retry this same request to check or complete it without creating another invitation.`); } }
    finally { clearTimeout(timeout); locked.current = false; setBusy(false); latest.current.onBusyChange?.(false); }
  };
  const rows = (state.rows || []).filter(row => filter === 'all' || row.status === filter);
  const pages = Math.max(1, Math.ceil(rows.length / 5)), currentPage = Math.min(page, pages);
  const duplicate = review && state.rows?.some(row => row.status === 'pending' && row.email?.trim().toLowerCase() === review.normalizedEmail);
  return <section className="clubs-management" aria-label="Club invitations">
    <h3>Claim invitations</h3>
    <p className="fo-note">An invitation asks someone to claim owner access; it does not add them as a member immediately. {enabled ? 'Staging creation only; email delivery and profile-setup emails are not connected.' : 'Invitation sending is not enabled in this UI.'}</p>
    {!opened ? <button type="button" className="ap-secondary" onClick={() => setOpened(true)}>Load claim invitations</button> : <>
      {state.loading ? <p role="status">Loading claim invitations…</p> : state.error ? <div role="alert"><p>{state.error}</p><button type="button" className="ap-secondary" onClick={() => setRevision(value => value + 1)}>Retry invitations</button></div> : <>
        <label className="fo-status-filter">Invitation status<SearchableDropdown value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option>{['pending', 'accepted', 'declined', 'expired'].map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</SearchableDropdown></label>
        <ul className="clubs-management-list">{rows.slice((currentPage - 1) * 5, currentPage * 5).map(row => <li key={row.id}><div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{row.email}</strong><p>Created {dateLabel(row.created_at)}{row.accepted_at ? ` · Accepted ${dateLabel(row.accepted_at)}` : ''}</p><span className="ap-status ap-status--neutral">{row.status}</span></div></li>)}</ul>
        {!rows.length && <p>No invitations match this view.</p>}
        <nav className="fo-pagination" aria-label="Invitation pages"><span>{rows.length ? (currentPage - 1) * 5 + 1 : 0}–{Math.min(currentPage * 5, rows.length)} of {rows.length}</span><button type="button" className="ap-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous invitations</button><button type="button" className="ap-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next invitations</button></nav>
        <p className="fo-note">These are recorded invitation statuses, not confirmation of email delivery. Pending invitations are not marked expired based on age.</p>
      </>}
      <form onSubmit={prepare} className="clubs-draft" style={{ padding: 20, display: 'grid', gap: 16, minWidth: 0, marginTop: 20 }}>
        <h4 style={{ fontSize: 18, margin: 0 }}>Review a claim invitation</h4>
        <p className="fo-note">{enabled ? 'Review the recipient before creating a pending invitation in staging. No email or owner access will be created.' : 'Local review only. No invitation, profile email or owner access will be created.'}</p>
        <label className="clubs-feedback">Find a recipient by name or email<input type="search" required autoComplete="off" spellCheck={false} maxLength={254} disabled={busy || uncertain || Boolean(saved)} value={email} onChange={event => { setEmail(event.target.value); setSelectedPlayer(null); setReview(null); setError(''); }} placeholder="Search players or enter an email…"/></label>
        {selectedPlayer ? <div><strong>{selectedPlayer.name || 'Name unavailable'}</strong><p>{selectedPlayer.email}</p></div> : !review && <>
          <p className="fo-note" role="status">{email.trim().length < 2 ? 'Type at least 2 characters to search existing players, or enter a complete email address.' : search.loading ? 'Searching players…' : search.error ? '' : search.rows.length ? `${search.rows.length} matching players` : 'No matching players shown. You can still review a complete email address; we will check whether a profile exists.'}</p>
          {search.error && <p role="alert">{search.error}</p>}
          <ul className="clubs-management-list">{search.rows.map(player => <li key={player.id}><div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{player.name || 'Name unavailable'}</strong><p>{player.email}</p></div><button type="button" className="ap-secondary" disabled={busy} onClick={() => { setSelectedPlayer(player); setEmail(player.email.trim()); setReview(null); setError(''); }}>Select recipient</button></li>)}</ul>
        </>}
        {!saved && <button type="submit" className="ap-secondary" disabled={busy || uncertain}>{busy && !review ? 'Checking profile…' : 'Review invitation'}</button>}
        {error && <p role="alert">{error}</p>}
        {review?.expectedClub && !saved && <p>Club: <strong>{review.expectedClub.name}</strong></p>}
        {review && !saved && <div role="status" style={{ display: 'grid', gap: 12, overflowWrap: 'anywhere' }}><strong>{review.normalizedEmail}</strong><p>{review.profileSetupRequired ? 'No player profile was found. The live workflow sends both a claim invitation and a profile-setup email.' : 'An existing player profile was found. The live workflow sends a claim invitation.'}</p><p>Owner access follows acceptance of the invitation, using the matching email and a player profile.</p>{duplicate && <p>There is already a pending invitation for this email. A new confirmed request creates another invitation, as on the live site.</p>}{!uncertain && <p>Nothing has been sent or saved.</p>}{enabled && <button type="button" className="ap-primary" disabled={busy} onClick={confirm}>{busy ? 'Creating staging invitation…' : uncertain ? 'Retry same staging invitation' : 'Confirm staging invitation'}</button>}<button type="button" className="ap-secondary" disabled={busy || uncertain} onClick={() => { setReview(null); setEmail(''); setSelectedPlayer(null); }}>Discard invitation review</button></div>}
        {saved && <div role="status"><strong>{saved.already_applied ? 'Previous staging invitation confirmed — no duplicate created.' : 'Pending invitation created in staging.'}</strong><p>This creation request queued a notification only; it did not send email or grant owner access. Recorded invitation status is shown in the history above.</p>{saved.profile_setup_required && <p>Profile-setup email is still unconnected. This recipient cannot complete the full invitation workflow yet.</p>}<button type="button" className="ap-secondary" onClick={() => { setSaved(null); setReview(null); setEmail(''); setSelectedPlayer(null); setError(''); }}>Review another invitation</button></div>}
      </form>
    </>}
  </section>;
}
