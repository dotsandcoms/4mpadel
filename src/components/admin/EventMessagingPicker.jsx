import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Search } from 'lucide-react';

export default function EventMessagingPicker({ events, selected, onSelect, onSearch, loading }) {
    const id = useId(), root = useRef(null), input = useRef(null);
    const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
    useEffect(() => {
        const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, []);
    useEffect(() => { if (open) root.current?.querySelector(`[data-event-option="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
    const choose = event => { onSelect(String(event.id)); setOpen(false); setQuery(''); onSearch(''); input.current?.focus(); };
    const keyDown = event => {
        if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(events.length - 1, open ? index + (event.key === 'ArrowDown' ? 1 : -1) : 0)));
        }
        if (event.key === 'Enter' && open && events[active]) { event.preventDefault(); choose(events[active]); }
    };
    return <div className="em-picker" ref={root}>
        <label htmlFor={id}>Event workspace</label>
        <div className="em-picker-control"><Search size={18} aria-hidden="true" />
            <input id={id} ref={input} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && events[active] ? `${id}-${active}` : undefined} autoComplete="off" maxLength={120}
                value={open ? query : selected?.title || ''} placeholder="Search events you manage…"
                onFocus={() => { setOpen(true); setActive(0); }} onClick={() => setOpen(true)} onKeyDown={keyDown}
                onChange={event => { setQuery(event.target.value); onSearch(event.target.value); setActive(0); setOpen(true); }} />
            <button type="button" aria-label={open ? 'Close event search' : 'Open event search'} onClick={() => { if (open) setOpen(false); else { setOpen(true); input.current?.focus(); } }}>{loading ? <LoaderCircle size={17} className="em-spin" /> : <ChevronDown size={18} />}</button>
        </div>
        {open && <div className="em-picker-popover"><div className="em-picker-caption" role="status">{loading ? 'Searching authorised events…' : `${events.length} authorised ${events.length === 1 ? 'event' : 'events'}`}</div>
            <div role="listbox" id={`${id}-list`} aria-label="Events you manage">{events.map((event, index) => <button type="button" role="option" aria-selected={String(event.id) === String(selected?.id)} id={`${id}-${index}`} data-event-option={index} key={event.id}
                className={active === index ? 'is-active' : ''} onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(event)}>
                <span><strong>{event.title}</strong><small>{[event.organisation, event.date?.slice(0, 10), event.venue].filter(Boolean).join(' · ')}</small></span>{String(event.id) === String(selected?.id) && <Check size={17} />}
            </button>)}{!loading && !events.length && <p className="em-empty-search">No matching events within your access.</p>}</div>
        </div>}
    </div>;
}
