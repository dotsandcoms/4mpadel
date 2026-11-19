import React, { useEffect, useId, useState } from 'react';
import { supabase } from '../../supabaseClient';
import EventPlayerAvatar from './EventPlayerAvatar';
import './EventPlayerSearch.css';

export async function searchEventPlayers(query, signal) {
  const q = query.trim().replace(/[,()%_*"\\]/g, ' ').trim();
  if (q.length < 2) return [];
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error('Sign in to search the player directory.');
  const { data, error } = await supabase.from('players').select('id,name,email,image_url')
    .or(`name.ilike.%${q}%,email.ilike.%${q}%`).not('email', 'is', null)
    .order('name').limit(12).abortSignal(signal);
  if (error) throw new Error('Player search failed. Please try again.');
  return (data || []).filter(player => player.email?.trim());
}

export default function EventPlayerSearch({ selected, onSelect, search = searchEventPlayers }) {
  const id = useId();
  const [query, setQuery] = useState(''), [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setRows([]); setError('');
    if (selected || query.trim().length < 2) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(async () => {
      const timeout = setTimeout(() => controller.abort(), 15000);
      try { const results = await search(query, controller.signal); if (active) setRows(results); }
      catch (err) { if (active) setError(controller.signal.aborted ? 'Search timed out. Please try again.' : err.message); }
      finally { clearTimeout(timeout); if (active) setBusy(false); }
    }, 300);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query, selected, search]);
  return <div className="ap-event-player-search">
    <label htmlFor={id}>Find a player</label>
    <input id={id} type="search" autoComplete="off" placeholder="Search by name or email…" value={query}
      onChange={event => { onSelect(null); setQuery(event.target.value); }}/>
    {selected ? <div className="ap-selected-player"><EventPlayerAvatar player={selected} name={selected.name}/><span><b>{selected.name || selected.email}</b><small>{selected.email}</small></span><button type="button" className="ap-secondary" onClick={() => { onSelect(null); setQuery(''); }}>Change player</button></div>
      : <><p role="status">{busy ? 'Searching players…' : query.trim().length < 2 ? 'Type at least 2 characters to search the player directory.' : error || (rows.length ? `${rows.length} players found${rows.length === 12 ? ' — refine your search for more specific results' : ''}.` : 'No matching players found.')}</p>
        <ul aria-label="Matching players">{rows.map(player => <li key={player.id}><button type="button" onClick={() => onSelect(player)}><EventPlayerAvatar player={player} name={player.name}/><span><b>{player.name || player.email}</b><small>{player.email}</small></span><span>Select</span></button></li>)}</ul></>}
  </div>;
}
