import React, { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, LoaderCircle, Search, X } from 'lucide-react';

function eventDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : '';
}

export default function EventMessagingPicker({ events, selected, onSelect, onSearch, loading, globalAccess = false }) {
    const id = useId(), root = useRef(null), input = useRef(null), trigger = useRef(null);
    const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
    const visible = loading ? [] : events;
    const highlighted = visible[active];
    useEffect(() => {
        const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, []);
    useEffect(() => { if (open) input.current?.focus(); }, [open]);
    useEffect(() => { setActive(0); }, [events, query]);
    useEffect(() => { if (open && highlighted) root.current?.querySelector(`[data-event-option="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open, highlighted]);
    const close = () => { setOpen(false); trigger.current?.focus(); };
    const choose = event => {
        if (loading) return;
        onSelect(String(event.id)); setOpen(false); setQuery(''); onSearch(''); trigger.current?.focus();
    };
    const keyDown = event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(index => Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        }
        if (event.key === 'Enter') { event.preventDefault(); if (highlighted) choose(highlighted); }
    };
    return <div className="em-picker" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
        <label id={`${id}-label`} htmlFor={id}>Event</label>
        <button ref={trigger} id={id} type="button" className={`em-picker-trigger${open ? ' is-open' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-popup` : undefined} aria-labelledby={`${id}-label ${id}-value`} aria-describedby={`${id}-help`}
            onClick={() => setOpen(value => !value)} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
            <CalendarDays size={20} aria-hidden="true" />
            <span className="em-picker-value"><strong id={`${id}-value`}>{selected?.title || 'Select an event'}</strong>{selected && <small>{[selected.organisation, eventDate(selected.date)].filter(Boolean).join(' · ')}</small>}</span>
            <span className="em-picker-change"><span>{selected ? 'Change' : 'Choose'}</span><ChevronDown size={20} aria-hidden="true" /></span>
        </button>
        <p id={`${id}-help`} className="em-picker-help">{globalAccess ? 'Super Admin: search events across all organisations. Event messages follow the existing retention period.' : 'Your organisation and profile permissions determine which events appear.'}</p>
        {open && <div id={`${id}-popup`} className="em-picker-popover" role="dialog" aria-label="Choose an event">
            <div className="em-picker-search"><Search size={18} aria-hidden="true" />
                <input ref={input} role="combobox" aria-label="Search events you manage" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={highlighted ? `${id}-${active}` : undefined} autoComplete="off" maxLength={120}
                    value={query} placeholder="Search event, organisation or venue" onKeyDown={keyDown} onChange={event => { setQuery(event.target.value); onSearch(event.target.value); setActive(0); }} />
                <button type="button" aria-label="Close event selector" onClick={close}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="em-picker-caption" role="status">{loading ? <><LoaderCircle size={14} className="em-spin" aria-hidden="true" />Searching your authorised events…</> : `${events.length} available ${events.length === 1 ? 'event' : 'events'} · ${globalAccess ? 'All organisations' : 'Within your access'}`}</div>
            <div role="listbox" id={`${id}-list`} aria-label="Events you manage" aria-busy={loading}>{visible.map((event, index) => <button type="button" role="option" tabIndex={-1} aria-selected={String(event.id) === String(selected?.id)} id={`${id}-${index}`} data-event-option={index} key={event.id}
                className={active === index ? 'is-active' : ''} onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(event)}>
                <span><strong>{event.title}</strong><small>{[event.organisation, eventDate(event.date), event.venue].filter(Boolean).join(' · ')}</small></span>{String(event.id) === String(selected?.id) && <Check size={17} aria-hidden="true" />}
            </button>)}{!loading && !events.length && <div className="em-empty-search"><strong>{query ? 'No matching events' : 'No events available for this profile'}</strong><p>{query ? 'Try another event name, organisation or venue.' : 'Ask your organisation admin to check your event access.'}</p></div>}</div>
        </div>}
    </div>;
}
