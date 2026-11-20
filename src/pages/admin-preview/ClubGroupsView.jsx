/* eslint-disable react-hooks/set-state-in-effect -- reset asynchronous authorised query state on identity change */
import React, { useEffect, useState } from 'react';
import RecordLoading from './RecordLoading';
import { loadClubGroupDirectory, safeClubRelationshipImage } from './clubRelationships.js';
import { clubStatusLabel } from './clubsData.js';
import { safeClubWebsite } from './clubDetailsData.js';
import ClubGroupMembership from './ClubGroupMembership.jsx';
import ClubGroupTeamDialog from './ClubGroupTeamDialog.jsx';
import { clubGroupTeamAvailable } from './clubGroupTeam.js';
import ClubGroupProfileDialog from './ClubGroupProfileDialog.jsx';
import { reviewClubGroupBranding } from './clubGroupProfile.js';

export default function ClubGroupsView({ client, session, scopeId, onOpenClub }) {
  const [state, setState] = useState(null), [query, setQuery] = useState(''), [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState(null);
  const [membership, setMembership] = useState(null), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
  const context = `${session?.user?.id}:${scopeId}`;
  useEffect(() => {
    const controller = new AbortController(); setMembership(null); setEditor(null); setState({ context, client, loading: true });
    const timer = setTimeout(() => { controller.abort(); setState({ context, client, error: 'Loading timed out. Refresh groups to try again.' }); }, 20000);
    const options={client,userId:session?.user?.id,scopeId,signal:controller.signal};
    Promise.all([loadClubGroupDirectory({...options,includeCandidates:true}),clubGroupTeamAvailable(options).catch(()=>false)])
      .then(([directory,canAssignTeam])=>{if(!controller.signal.aborted)setState({context,client,...directory,canAssignTeam});})
      .catch(error => { if (!controller.signal.aborted) setState({ context, client, error: error.message }); }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, context, session?.user?.id, scopeId, revision]);
  const current = state?.context === context && state.client === client ? state : null;
  const rows = (current?.rows || []).filter(group => [group.name, group.short_name, group.city, ...group.venues.map(club => club.name)].some(text => String(text || '').toLowerCase().includes(query.trim().toLowerCase())));
  return <section className="clubs-groups ap-section"><h2>Club groups</h2><p>Brand groups and their linked venues.</p><div className="fo-report-actions"><label className="fo-search"><input aria-label="Search club groups" placeholder="Search group or venue…" value={query} onChange={event => setQuery(event.target.value)}/></label><button className="ap-secondary" disabled={current?.loading || saving} onClick={() => { setNotice(''); setRevision(value => value + 1); }}>Refresh groups</button>{current&&!current.loading&&!current.error&&<button className="ap-primary" type="button" disabled={saving} onClick={()=>setEditor({group:null})}>Create club group</button>}</div>{notice && <p role="status">{notice}</p>}
    {!current || current.loading ? <RecordLoading label="Loading club groups…"/> : current.error ? <p role="alert">{current.error}</p> : <><p role="status">{rows.length} matching groups</p>{rows.map(group => <details key={group.id} className="clubs-group"><summary>{safeClubRelationshipImage(group.logo_url) && <img src={safeClubRelationshipImage(group.logo_url)} alt="" width="44" height="44" loading="lazy" referrerPolicy="no-referrer"/>}<strong>{group.name}</strong><span>{group.venues.length} venues · {clubStatusLabel(group.status)}</span></summary><p>{group.about || 'No group description recorded.'}</p><p>{[group.city, group.province].filter(Boolean).join(', ')}</p><dl className="clubs-fields"><dt>Shared logo</dt><dd>{group.share_logo ? 'Inherited by linked venues' : 'Venue-specific'}</dd><dt>Shared website</dt><dd>{group.share_website ? 'Inherited by linked venues' : 'Venue-specific'}</dd></dl>{safeClubWebsite(group.website_url) && <a href={safeClubWebsite(group.website_url)} target="_blank" rel="noopener noreferrer">Visit group website ↗</a>}<ul className="clubs-management-list">{group.venues.map(club => <li key={club.id}><div><strong>{club.name}</strong><p>{club.city || 'City not recorded'}</p></div><div className="fo-report-actions"><button className="ap-secondary" disabled={saving} onClick={() => onOpenClub(club)}>View club</button><button className="ap-secondary" disabled={saving} onClick={() => setMembership({ groupId: group.id, venue: club })}>Unlink venue</button></div></li>)}</ul>{!group.venues.length && <p>No venues linked.</p>}<div className="fo-report-actions"><button className="ap-secondary" disabled={saving} onClick={() => setMembership({ groupId: group.id, venue: null })}>Link venue</button>
      <button type="button" className="ap-secondary" disabled={saving} onClick={()=>setEditor({group})}>Edit club group</button>
      {current.canAssignTeam&&group.venues.length>0&&<button type="button" className="ap-secondary" disabled={saving}
        onClick={()=>setEditor({group,team:true})}>Assign team access</button>}
      {reviewClubGroupBranding(group).venues.length>0&&<button type="button" className="ap-secondary" disabled={saving} onClick={()=>setEditor({group,branding:reviewClubGroupBranding(group)})}>Review shared branding</button>}</div>
      {membership?.groupId === group.id && <ClubGroupMembership key={membership.venue?.id || 'link'} client={client} session={session} scopeId={scopeId} group={group} groups={current.rows}
        clubs={current.clubs} selectedVenue={membership.venue} onBusyChange={setSaving} onCancel={refresh => { setMembership(null); if (refresh) setRevision(value => value + 1); }}
        onSaved={(venue, action) => { setNotice(`${venue.name} ${action === 'link' ? 'linked to' : 'unlinked from'} ${group.name}.`); setRevision(value => value + 1); }}/>}</details>)}</>}
    {editor&&(editor.team?<ClubGroupTeamDialog key={editor.group.id} client={client} session={session} scopeId={scopeId} group={editor.group} onBusyChange={setSaving}
      onSaved={saved=>setNotice(`Group access updated for ${saved.changed.length} venues.`)}
      onClose={({refresh})=>{setEditor(null);if(refresh)setRevision(value=>value+1);}}/>
      : <ClubGroupProfileDialog key={editor.group?.id||'create'} client={client} session={session} scopeId={scopeId} {...editor} onBusyChange={setSaving}
        onSaved={setNotice} onClose={({refresh})=>{setEditor(null);if(refresh)setRevision(value=>value+1);}}/>)}
  </section>;
}
