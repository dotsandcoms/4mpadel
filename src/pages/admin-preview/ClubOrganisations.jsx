/* eslint-disable react-hooks/set-state-in-effect -- clear reviewed snapshots whenever authorised query context changes */
import React, { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import RecordLoading from './RecordLoading';
import { loadClubOrganisations, reviewClubOrganisation, safeClubRelationshipImage, saveClubOrganisation } from './clubRelationships.js';

export default function ClubOrganisations({ club, client, session, scopeId }) {
  const [opened, setOpened] = useState(false), [revision, setRevision] = useState(0);
  const [state, setState] = useState(null), [choice, setChoice] = useState(''), [review, setReview] = useState(null);
  const [result, setResult] = useState(null);
  const pending = useRef(null);
  const context = `${session?.user?.id}:${scopeId}:${club.id}`;
  useEffect(() => {
    setChoice(''); setReview(null);
    if (!opened) return;
    const controller = new AbortController();
    setState({ context, client, loading: true });
    const timer = setTimeout(() => { controller.abort(); setState({ context, client, error: 'Loading timed out. Refresh organisations to try again.' }); }, 20000);
    loadClubOrganisations({ client, userId: session?.user?.id, scopeId, clubId: club.id, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ context, client, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ context, client, error: error.message }); })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [opened, revision, client, context, session?.user?.id, scopeId, club.id]);
  useEffect(() => () => pending.current?.abort(), [client, context]);
  const current = state?.context === context && state.client === client ? state : null;
  const inspect = (organisationId, action) => {
    setResult(null);
    setReview({ context, client, value: reviewClubOrganisation({ club, snapshot: current.data, organisationId, action }) });
  };
  const visibleReview = review?.context === context && review.client === client ? review.value : null;
  const busy = result?.pending === true;
  const confirm = async () => {
    if (!visibleReview || pending.current || result?.error) return;
    const controller = new AbortController();
    pending.current = controller;
    setResult({ pending: true });
    try {
      await saveClubOrganisation({ client, clubId: club.id, scopeId, userId: session?.user?.id, signal: controller.signal }, visibleReview);
      if (controller.signal.aborted) return;
      setReview(null);
      setResult({ message: visibleReview.action === 'link' ? 'Organisation linked.' : 'Organisation unlinked.' });
      setRevision(value => value + 1);
    } catch (error) {
      if (!controller.signal.aborted) setResult({ error: error.message });
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  };
  return <section className="clubs-relationships"><h3>Linked organisations</h3><p className="fo-note">Linked organisation owners and admins can gain club management access.</p>
    {result?.message && <p role="status">{result.message}</p>}
    {result?.error && <p role="alert">{result.error}</p>}
    {!opened ? <button className="ap-secondary" onClick={() => setOpened(true)}>Load linked organisations</button> : !current || current.loading ? <RecordLoading label="Loading linked organisations…"/> : current.error ? <p role="alert">{current.error}</p> : <>
      <ul className="clubs-management-list">{current.data.links.map(link => <li key={link.id}><div className="fo-player">{safeClubRelationshipImage(link.organisations?.logo_url) && <img src={safeClubRelationshipImage(link.organisations.logo_url)} width="44" height="44" loading="lazy" referrerPolicy="no-referrer" alt=""/>}<div><strong>{link.organisations?.name || 'Organisation unavailable'}</strong><p>{link.organisations?.status || link.organisation_id}</p></div></div><button className="ap-secondary" disabled={busy} onClick={() => inspect(link.organisation_id, 'unlink')}>Review unlink</button></li>)}</ul>
      {!current.data.links.length && <p>No organisations linked.</p>}
      <div className="clubs-relationship-picker"><label>Approved organisation<SearchableDropdown value={choice} disabled={busy} onChange={event => { setChoice(event.target.value); setReview(null); }}><option value="">Choose an organisation</option>{current.data.organisations.filter(org => !current.data.links.some(link => link.organisation_id === org.id)).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</SearchableDropdown></label><button className="ap-secondary" disabled={!choice || busy} onClick={() => inspect(choice, 'link')}>Review link</button></div>
      {visibleReview && <section className="clubs-relationship-review" aria-label="Organisation relationship review"><h4>{visibleReview.action === 'link' ? 'Link organisation' : 'Unlink organisation'}</h4><p>{visibleReview.organisation.name} · {visibleReview.club.name}</p><p>{visibleReview.action === 'link' ? 'This would allow the organisation’s owners and admins to manage this club through the existing permission rules.' : 'This would remove this association-based management route. Separately granted access is not removed.'}</p><button className="ap-primary" type="button" disabled={busy || Boolean(result?.error)} onClick={confirm}>{busy ? 'Saving…' : visibleReview.action === 'link' ? 'Confirm link' : 'Confirm unlink'}</button> <button className="ap-secondary" disabled={busy} onClick={() => setReview(null)}>Close review</button></section>}
    </>}
    {opened && <button className="ap-secondary" disabled={current?.loading || busy} onClick={() => { setResult(null); setRevision(value => value + 1); }}>Refresh organisations</button>}
  </section>;
}
