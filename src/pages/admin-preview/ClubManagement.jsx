import React, { useEffect, useState } from 'react';
import RecordLoading from './RecordLoading.jsx';
import { loadClubManagement } from './clubManagementData.js';
import ClubApplicationDecision from './ClubApplicationDecision.jsx';
import { clubDecisionApi } from './clubDecisionRpc.js';
import ClubMemberDecision from './ClubMemberDecision.jsx';
import { clubMemberApi } from './clubMemberRpc.js';
import ClubMemberAdd from './ClubMemberAdd.jsx';
import { clubMemberAddApi } from './clubMemberAdd.js';

export default function ClubManagement({ client, session, permissions, scopeId, clubId, onBusyChange, onDecisionSaved, decisionApi = clubDecisionApi, memberApi = clubMemberApi, addApi = clubMemberAddApi }) {
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState(false), [state, setState] = useState({ loading: true }), [reload, setReload] = useState(0);
  const [tab, setTab] = useState('members'), [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null), [busy, setBusy] = useState(false);
  const enabled = decisionApi.enabled(client);
  useEffect(() => { if (selected || tab !== 'members') setAdding(false); }, [selected, tab]);
  useEffect(() => { setSelected(null); setAdding(false); }, [clubId, client, session?.user?.id, scopeId]);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setState({ loading: true });
    const timer = setTimeout(() => { controller.abort(); setState({ error: 'Loading took too long. Try again.' }); }, 20000);
    loadClubManagement(client, session, permissions, scopeId, clubId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data }); })
      .catch(err => { if (!controller.signal.aborted) setState({ error: err.message }); })
      .finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [opened, client, session?.user?.id, permissions?.role, scopeId, clubId, reload]);
  const rows = (state.data?.[tab] || []).filter(row => [row.players?.name, row.full_name, row.user_email, row.requester_email, row.role, row.status].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(rows.length / 5)), current = Math.min(page, pages);
  return <section className="clubs-management"><h3>Members & claims</h3><p className="fo-note">Member changes: {memberApi.enabled(client) ? 'staging confirmation available' : 'local preview only; no access changes'}. Claim decisions: {enabled ? 'staging confirmation available' : 'local preview only; no access changes'}.</p>
    {!opened ? <button className="ap-secondary" onClick={() => setOpened(true)}>Load members and claims</button> : state.loading ? <section className="ap-section"><RecordLoading label="Loading members and claims…" detail="Reading records linked to this club only."/></section> : state.error ? <div role="alert"><p>{state.error}</p><button className="ap-secondary" onClick={() => setReload(n => n + 1)}>Retry members and claims</button></div> : <>
      <div className="fo-report-actions">{['members','claims'].map(value => <button key={value} className="ap-secondary" disabled={busy} aria-pressed={tab===value} onClick={() => { setTab(value); setPage(1); setQuery(''); setSelected(null); if (value === 'members' && enabled) setReload(n => n + 1); }}>{value === 'members' ? 'Members' : 'Claims'} ({state.data[value].length})</button>)}</div>
      <label className="fo-search"><input disabled={busy} aria-label="Search members or claims" placeholder="Search name, email, role or status…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label>
      {tab === 'members' && <button type="button" className="ap-secondary" disabled={busy || adding} onClick={() => { setSelected(null); setAdding(true); }}>{addApi.enabled(client) ? 'Add member' : 'Preview adding member'}</button>}
      {adding && tab === 'members' && <ClubMemberAdd clubId={clubId} members={state.data.members} client={client} session={session} scopeId={scopeId} addApi={addApi} onBusyChange={value => { setBusy(value); onBusyChange?.(value); }} onCancel={needsReload => { setAdding(false); if (needsReload) setReload(n => n + 1); }} onSaved={outcome => { setState(previous => ({ ...previous, data: { ...previous.data, members: [...previous.data.members.filter(row => row.id !== outcome.member.id), outcome.member] } })); setQuery(''); setPage(1); }}/ >}
      <ul className="clubs-management-list">{rows.slice((current-1)*5,current*5).map(row => <li key={row.id}><div><strong>{row.players?.name || row.full_name || row.user_email || row.requester_email || 'Name unavailable'}</strong><p>{row.user_email || row.requester_email}</p><span className="ap-status ap-status--neutral">{tab==='members' ? row.role : row.status}</span></div>{tab === 'members' && <button className="ap-secondary" disabled={busy} onClick={() => setSelected(row)}>{memberApi.enabled(client) ? 'Manage member' : 'Preview member change'}</button>}{tab==='claims' && row.status==='pending' && <button className="ap-secondary" disabled={busy} onClick={() => setSelected(row)}>{enabled ? 'Review claim' : 'Preview decision'}</button>}</li>)}</ul>
      {!rows.length && <p>No {tab} match this view.</p>}
      <nav className="fo-pagination" aria-label="Member and claim pages"><span>{rows.length ? (current-1)*5+1 : 0}–{Math.min(current*5,rows.length)} of {rows.length}</span><button className="ap-secondary" disabled={busy || current===1} onClick={()=>setPage(current-1)}>Previous records</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={busy || current===pages} onClick={()=>setPage(current+1)}>Next records</button></nav>
      {selected && tab === 'members' && <ClubMemberDecision key={selected.id} record={selected} ownerCount={state.data.members.filter(row => row.role === 'owner').length} client={client} session={session} scopeId={scopeId} memberApi={memberApi} onCancel={needsReload => { setSelected(null); if (needsReload) setReload(n => n + 1); }} onBusyChange={value => { setBusy(value); onBusyChange?.(value); }} onSaved={outcome => { setState(previous => ({ ...previous, data: { ...previous.data, members: outcome.removed ? previous.data.members.filter(row => row.id !== outcome.member_id) : previous.data.members.map(row => row.id === outcome.member_id ? { ...row, role: outcome.role } : row) } })); }}/ >}
      {selected && tab === 'claims' && <ClubApplicationDecision key={selected.id} kind="claim" record={selected} client={client} session={session} scopeId={scopeId} decisionApi={decisionApi} onCancel={() => setSelected(null)} onBusyChange={value => { setBusy(value); onBusyChange?.(value); }} onSaved={outcome => { setState(previous => ({ ...previous, data: { ...previous.data, claims: previous.data.claims.map(row => row.id === selected.id ? { ...row, status: outcome.status } : row) } })); onDecisionSaved?.(outcome); }}/ >}
    </>}
  </section>;
}
