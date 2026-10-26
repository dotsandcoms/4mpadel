import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import useProExplore from '../../hooks/useProExplore';
export default function PlayerDirectorySelect({ player, category, excludeId, label, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const root = useRef(null);
  const trigger = useRef(null);
  const state = useProExplore('search', { category, q: query, page }, open, 300);
  useEffect(() => {
    const close = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown',close);
    return () => document.removeEventListener('pointerdown',close);
  }, []);
  return <div className="pro-directory-select" ref={root} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} className="pro-directory-trigger" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>{player.rank ? `#${player.rank} · ` : ''}{player.name}<ChevronDown size={18} /></button>
    {open && <div className="pro-directory-dropdown"><label className="pro-search"><Search size={16} /><span className="sr-only">Search {label.toLowerCase()} across all players</span><input autoFocus value={query} placeholder="Search all players…" onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
      <div className="pro-directory-options" aria-busy={state.loading}>{state.loading ? <p role="status">Searching all players…</p> : state.error ? <div role="alert"><p>{state.error}</p><button onClick={state.retry}>Retry search</button></div> : <>{state.data?.players?.filter(p => p.id !== excludeId).map(option => <button key={option.id} onClick={() => { onSelect(option); setOpen(false); trigger.current?.focus(); }}>{option.rank ? `#${option.rank} · ` : ''}{option.name}</button>)}{!state.data?.players?.length && <p>No players found.</p>}</>}</div>
      {state.data && <div className="pro-directory-pages"><button disabled={page <= 1 || state.loading} onClick={() => setPage(page-1)}>Previous</button><span>{state.data.total.toLocaleString()} players · {page}/{state.data.pages}</span><button disabled={page >= state.data.pages || state.loading} onClick={() => setPage(page+1)}>Next</button></div>}
    </div>}
  </div>;
}
