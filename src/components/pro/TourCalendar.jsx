import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Download, MapPin, Search, ArrowUpRight } from 'lucide-react';
import CountryLabel from './CountryLabel';
import { countryName, formatDate, levelName } from '../../utils/proPadelView';

const monthLabel = (date) => formatDate(date, { month: 'long', year: 'numeric', day: undefined });
const shortDate = (date) => formatDate(date, { month: 'short', day: 'numeric', year: undefined });
const fold = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function EventDetails({ event }) {
  return <details className="pro-stop-details"><summary>Event details <ArrowUpRight size={14} /></summary><div><p><MapPin size={14} /> {event.venue || 'Venue to be confirmed'}</p><p>{event.status === 'live' ? 'In progress at last schedule update' : 'Scheduled'} · Dates may change</p></div></details>;
}

export default function TourCalendar({ events, updatedAt, onSave }) {
  const [params, setParams] = useSearchParams();
  const query = params.get('tourSearch') || '';
  const level = params.get('tourLevel') || '';
  const setFilter = (key, value) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: true }); };
  const reset = () => { const next = new URLSearchParams(params); next.delete('tourSearch'); next.delete('tourLevel'); setParams(next, { replace: true }); };
  const levels = ['major', 'p1', 'p2', 'finals'].filter((item) => events.some((event) => event.level === item));
  const visible = events.filter((event) => (!level || event.level === level) && fold(`${event.name} ${event.location || ''} ${countryName(event.country)}`).includes(fold(query)));
  const groups = [...new Set(visible.map((event) => event.startDate.slice(0, 7)))];
  const next = events[0];
  return <section className="pro-tour-calendar" aria-label="Premier Padel tour calendar">
    <div className="pro-calendar-meta"><p>Plan your next match day.</p><span>{events.length} events · {new Set(events.map((event) => event.country).filter(Boolean)).size} countries</span></div>
    {next && <article className="pro-tour-feature">
      <div className="pro-tour-feature-copy"><div className="pro-tour-feature-label"><span className="pro-event-level">{levelName(next.level)}</span><span>{next.status === 'live' ? 'IN PROGRESS AT LAST UPDATE' : 'NEXT STOP ON TOUR'}</span></div><h3>{next.name}</h3><p className="pro-tour-location"><CountryLabel code={next.country} label={next.location} /></p><p className="pro-tour-feature-dates"><CalendarDays size={17} /> {shortDate(next.startDate)} — {formatDate(next.endDate)}</p><button className="pro-button" onClick={() => onSave(next)}><Download size={16} /> Add to my calendar</button></div>
      <div className="pro-tour-date-art" aria-hidden="true"><span>{formatDate(next.startDate, { month: 'long', day: undefined, year: undefined })}</span><strong>{next.startDate.slice(8, 10)}</strong><small>{next.startDate.slice(0, 4)} / PREMIER PADEL</small></div>
    </article>}
    <div className="pro-tour-toolbar"><div className="pro-tour-levels" role="group" aria-label="Filter tournament level">{[['', 'All events'], ...levels.map((item) => [item, levelName(item)])].map(([value, label]) => <button key={value} aria-pressed={level === value} onClick={() => setFilter('tourLevel', value)}>{label}</button>)}</div><label className="pro-search"><Search size={17} /><input aria-label="Search tour events" placeholder="Search city, country or event…" value={query} onChange={(event) => setFilter('tourSearch', event.target.value)} />{query && <button aria-label="Clear event search" onClick={() => setFilter('tourSearch', '')}>×</button>}</label></div>
    <p className="pro-tour-count" role="status">{visible.length} {visible.length === 1 ? 'event' : 'events'}{level || query ? ' matching your filters' : ' on the upcoming schedule'}</p>
    {groups.map((month) => <section className="pro-tour-month" key={month} aria-label={monthLabel(`${month}-01`)}><h3>{monthLabel(`${month}-01`)}<span>{visible.filter((event) => event.startDate.startsWith(month)).length} {visible.filter((event) => event.startDate.startsWith(month)).length === 1 ? 'stop' : 'stops'}</span></h3><div className="pro-tour-stops">{visible.filter((event) => event.startDate.startsWith(month)).map((event) => <article className="pro-tour-stop" key={event.id}>
      <div className="pro-stop-date"><strong>{event.startDate.slice(8, 10)}</strong><span>{formatDate(event.startDate, { month: 'short', day: undefined, year: undefined })}</span></div>
      <div className="pro-stop-info"><div className="pro-stop-heading"><span className="pro-event-level">{levelName(event.level)}</span><h4>{event.name}</h4></div><p><CountryLabel code={event.country} label={event.location} /><span className="pro-stop-date-range">{shortDate(event.startDate)} — {shortDate(event.endDate)}</span></p><EventDetails event={event} /></div>
      <button className="pro-calendar-save" onClick={() => onSave(event)} aria-label={`Add ${event.name} to calendar`}><Download size={16} /><span>Add to calendar</span></button>
    </article>)}</div></section>)}
    {!visible.length && <div className="pro-empty"><CalendarDays size={28} /><h3>{events.length ? 'No events match your search' : 'No upcoming events listed'}</h3><p>{events.length ? 'Try another city, country or tournament level.' : 'Check back after the next tour update.'}</p>{(query || level) && <button className="pro-button" onClick={reset}>Clear filters</button>}</div>}
    <p className="pro-coverage pro-tour-calendar-note">Upcoming Premier Padel events in the next 120 days · Schedule updated {formatDate(updatedAt)}. Calendar downloads save event dates; match times are confirmed separately.</p>
  </section>;
}
