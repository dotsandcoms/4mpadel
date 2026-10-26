/* eslint-disable react-hooks/set-state-in-effect -- reset asynchronous authorised query state on identity change */
import React, { useEffect, useState } from 'react';
import RecordLoading from './RecordLoading';
import { loadClubGroupDirectory, safeClubRelationshipImage } from './clubRelationships.js';
import { clubStatusLabel } from './clubsData.js';
import { safeClubWebsite } from './clubDetailsData.js';

export default function ClubGroupsView({ client, session, scopeId, onOpenClub }) {
  const [state, setState] = useState(null), [query, setQuery] = useState(''), [revision, setRevision] = useState(0);
  const context = `${session?.user?.id}:${scopeId}`;
  useEffect(() => {
    const controller = new AbortController(); setState({ context, client, loading: true });
    const timer = setTimeout(() => { controller.abort(); setState({ context, client, error: 'Loading timed out. Refresh groups to try again.' }); }, 20000);
    loadClubGroupDirectory({ client, userId: session?.user?.id, scopeId, signal: controller.signal })
      .then(rows => { if (!controller.signal.aborted) setState({ context, client, rows }); })
      .catch(error => { if (!controller.signal.aborted) setState({ context, client, error: error.message }); }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, context, session?.user?.id, scopeId, revision]);
  const current = state?.context === context && state.client === client ? state : null;
  const rows = (current?.rows || []).filter(group => [group.name, group.short_name, group.city, ...group.venues.map(club => club.name)].some(text => String(text || '').toLowerCase().includes(query.trim().toLowerCase())));
  return <section className="clubs-groups ap-section"><h2>Club groups</h2><p>Brand groups and their linked venues. Group creation, editing, membership and branding cascades are not connected in this interface yet.</p><div className="fo-report-actions"><label className="fo-search"><input aria-label="Search club groups" placeholder="Search group or venue…" value={query} onChange={event => setQuery(event.target.value)}/></label><button className="ap-secondary" disabled={current?.loading} onClick={() => setRevision(value => value + 1)}>Refresh groups</button></div>
    {!current || current.loading ? <RecordLoading label="Loading club groups…"/> : current.error ? <p role="alert">{current.error}</p> : <><p role="status">{rows.length} matching groups</p>{rows.map(group => <details key={group.id} className="clubs-group"><summary>{safeClubRelationshipImage(group.logo_url) && <img src={safeClubRelationshipImage(group.logo_url)} alt="" width="44" height="44" loading="lazy" referrerPolicy="no-referrer"/>}<strong>{group.name}</strong><span>{group.venues.length} venues · {clubStatusLabel(group.status)}</span></summary><p>{group.about || 'No group description recorded.'}</p><p>{[group.city, group.province].filter(Boolean).join(', ')}</p><dl className="clubs-fields"><dt>Shared logo</dt><dd>{group.share_logo ? 'Inherited by linked venues' : 'Venue-specific'}</dd><dt>Shared website</dt><dd>{group.share_website ? 'Inherited by linked venues' : 'Venue-specific'}</dd></dl>{safeClubWebsite(group.website_url) && <a href={safeClubWebsite(group.website_url)} target="_blank" rel="noopener noreferrer">Visit group website ↗</a>}<ul className="clubs-management-list">{group.venues.map(club => <li key={club.id}><div><strong>{club.name}</strong><p>{club.city || 'City not recorded'}</p></div><button className="ap-secondary" onClick={() => onOpenClub(club)}>View club</button></li>)}</ul>{!group.venues.length && <p>No venues linked.</p>}</details>)}</>}
  </section>;
}
