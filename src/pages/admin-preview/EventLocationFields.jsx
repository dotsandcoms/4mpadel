import React, { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useClubs } from '../../hooks/useClubs';
import { loadGoogleMaps } from '../../utils/googleMaps';
import { addEventVenue, eventPlacePatch, venueNames } from './eventLocationData';
import './EventLocationFields.css';

// Optional clubs/loadMaps injection keeps QA entirely local. Production reuses
// the same club hook and Maps loader as the existing EventBuilder.
export default function EventLocationFields(props) {
  return props.clubs !== undefined ? <LocationFields {...props}/> : <ConnectedLocationFields {...props}/>;
}
function ConnectedLocationFields(props) {
  const { clubs, loadingClubs } = useClubs();
  return <LocationFields {...props} clubs={clubs} loadingClubs={loadingClubs}/>;
}

function LocationFields({ draft, onChange, clubs = [], loadingClubs = false, loadMaps = loadGoogleMaps }) {
  const input = useRef(null), venueWrap = useRef(null), latest = useRef({ draft, onChange });
  latest.current = { draft, onChange };
  const listId = useId(), statusId = useId();
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(-1), [mapsStatus, setMapsStatus] = useState('Loading address suggestions…');
  const venues = venueNames(draft.venues), keys = new Set(venues.map(name => name.toLowerCase()));
  const matches = clubs.filter(club => !keys.has(String(club.name || '').toLowerCase()) && String(club.name || '').toLowerCase().includes(query.trim().toLowerCase()));
  const canAdd = query.trim() && !keys.has(query.trim().toLowerCase());
  const options = [...matches, ...(canAdd ? [query.trim()] : [])];
  const choose = value => { onChange(addEventVenue(draft, value)); setQuery(''); setOpen(false); setActive(-1); };
  useEffect(() => {
    const outside = event => { if (!venueWrap.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => {
    let cancelled = false, ac, listener, observer, googleApi;
    const owned = new Set(), field = input.current;
    const dialog = field?.closest('dialog');
    const before = new Set(document.querySelectorAll('.pac-container'));
    const position = () => {
      if (!field || !dialog) return;
      const rect = field.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const height = Math.max(100, Math.min(250, below < 150 ? rect.top - 12 : below));
      owned.forEach(container => {
        const styles = { position: 'fixed', left: `${rect.left}px`, top: `${below < 150 ? Math.max(4, rect.top - height - 4) : rect.bottom + 4}px`, width: `${rect.width}px`, maxHeight: `${height}px`, overflowY: 'auto', zIndex: '20' };
        for (const [key, value] of Object.entries(styles)) if (container.style[key] !== value) container.style[key] = value;
      });
    };
    const claim = (onlyFocused = false) => {
      if (!dialog || (onlyFocused && document.activeElement !== field)) return;
      document.querySelectorAll('.pac-container').forEach(container => {
        if (before.has(container) || owned.has(container)) return;
        owned.add(container); container.classList.add('ap-location-google'); dialog.appendChild(container);
        observer?.observe(container, { attributes: true, attributeFilter: ['style'] });
      });
      position();
    };
    loadMaps().then(google => {
      if (cancelled || !field) return;
      if (!google?.maps?.places?.Autocomplete) throw new Error('Places unavailable');
      googleApi = google;
      before.clear(); document.querySelectorAll('.pac-container').forEach(container => before.add(container));
      ac = new google.maps.places.Autocomplete(field, { fields: ['formatted_address', 'address_components', 'name'], types: ['establishment', 'geocode'], componentRestrictions: { country: 'za' } });
      listener = ac.addListener('place_changed', () => { const current = latest.current; current.onChange(eventPlacePatch(current.draft, ac.getPlace())); });
      claim();
      observer = new MutationObserver(() => { claim(true); position(); });
      observer.observe(document.body, { childList: true, subtree: true });
      // Google can rewrite its positioning after the node is moved into a
      // top-layer dialog. Keep only our own dropdown aligned with its input.
      owned.forEach(container => observer.observe(container, { attributes: true, attributeFilter: ['style'] }));
      setMapsStatus('Google address suggestions ready.');
      field.addEventListener('focus', position); window.addEventListener('resize', position); document.addEventListener('scroll', position, true);
    }).catch(() => { if (!cancelled) setMapsStatus('Google address suggestions are unavailable. You can still enter the address and city.'); });
    return () => {
      cancelled = true; observer?.disconnect();
      listener?.remove?.();
      // The legacy widget has no destroy method; clear instance listeners and
      // remove only dropdown nodes created by this instance, never other inputs.
      if (ac) googleApi?.maps?.event?.clearInstanceListeners?.(ac);
      owned.forEach(container => container.remove());
      field?.removeEventListener('focus', position); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true);
    };
  }, [loadMaps]);
  return <section className="ap-event-location" aria-label="Event venue and address">
    <div className="ap-location-venue" ref={venueWrap} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <label htmlFor={`${listId}-input`}>Venues / Clubs</label>
      {venues.length > 0 && <div className="ap-location-chips">{venues.map(name => <span key={name}>{name}<button type="button" aria-label={`Remove ${name}`} onClick={() => onChange({ venues: venues.filter(item => item !== name).join('\n') })}><X size={14}/></button></span>)}</div>}
      <div className="ap-location-search"><Search size={17} aria-hidden="true"/><input id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined} value={query} autoComplete="off" placeholder="Select one or more venues or clubs…" onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); setActive(-1); }} onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(index => Math.min(options.length - 1, Math.max(0, index + (e.key === 'ArrowDown' ? 1 : -1)))); } else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && options[active]) choose(options[active]); else if (query.trim()) choose(query); } }}/></div>
      {open && <div id={listId} className="ap-location-options" role="listbox" aria-label="Available clubs">{loadingClubs ? <p role="status">Loading clubs…</p> : options.length ? options.map((item, index) => <button type="button" role="option" aria-selected={index === active} id={`${listId}-${index}`} key={typeof item === 'string' ? `custom-${item}` : item.id} onMouseDown={e => e.preventDefault()} onClick={() => choose(item)}>{typeof item === 'string' ? `Add “${item}”` : <><strong>{item.name}</strong>{(item.city || item.address) && <small>{item.city || item.address}</small>}</>}</button>) : <p>No matching clubs. Type a venue name to add it.</p>}</div>}
    </div>
    <label>Address<input ref={input} name="address" value={draft.address || ''} onChange={e => onChange({ address: e.target.value })} placeholder="Start typing to search Google…" autoComplete="off" aria-describedby={statusId}/></label>
    <label>City<input name="city" value={draft.city || ''} onChange={e => onChange({ city: e.target.value })} placeholder="Enter city"/></label>
    <p id={statusId} className="ap-location-status" role="status">{mapsStatus}</p>
  </section>;
}
