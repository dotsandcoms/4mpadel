import React, { useEffect, useRef, useState } from 'react';
import './EventAttentionList.css';

export default function EventAttentionList({ rows, onOpen, onBack, solo = false }) {
  const [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const heading = useRef(null);
  useEffect(() => { heading.current.focus({ preventScroll: true }); heading.current.scrollIntoView({ block: 'nearest' }); }, []);
  const matching = rows.filter(row => `${row.name} ${row.partner} ${row.division} ${row.issue}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(matching.length / 10)), current = Math.min(page, pages);
  return <section className="ap-section ap-attention-list">
    <header><div><h2 ref={heading} tabIndex={-1}>{solo ? 'Solo entries' : 'Registrations needing attention'}</h2><p>{rows.length} {solo ? 'solo entries without a recorded partner. Select a player to inspect their registration, payment and eligibility.' : 'affected registrations. Select any record to inspect its team, payment and eligibility details.'}</p></div><button className="ap-secondary" onClick={onBack}>Back to overview</button></header>
    <label className="ap-filter-search"><span className="ap-visually-hidden">{solo ? 'Search solo entries' : 'Search registration issues'}</span><input placeholder="Search player, partner, division or issue…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label>
    <ul>{matching.slice((current-1)*10,current*10).map(row => <li key={row.id}><div><strong>{row.name}</strong><p>{row.partner ? `Partner: ${row.partner}` : 'Partner not recorded'} · {row.division}</p><span className="ap-status ap-status--warning">{row.issue}</span><p>Eligibility: {row.eligibility}</p></div><button className="ap-secondary" onClick={() => onOpen(row.id)} aria-label={`View details for ${row.name}`}>View details →</button></li>)}</ul>
    {!matching.length && <p role="status">{rows.length ? 'No entries match this search.' : solo ? 'No solo entries in the loaded records.' : 'No registration issues in the loaded records.'}</p>}
    <nav className="ap-pagination" aria-label={solo ? 'Solo entry pages' : 'Registration issue pages'}><span role="status">{matching.length ? (current-1)*10+1 : 0}–{Math.min(current*10,matching.length)} of {matching.length} registrations</span><div><button className="ap-secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></div></nav>
  </section>;
}
