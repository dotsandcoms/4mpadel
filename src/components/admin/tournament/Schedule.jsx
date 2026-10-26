import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, LockKeyhole, Send } from 'lucide-react';
import { generateTournamentSchedule, tournamentFixtures, scheduleIssues, localDay, localTime, localStamp } from '../../../utils/tournament/scheduling';
import { tournamentWorkflow } from '../../../utils/tournament/workflow';
import { tournamentDivisionColors as divisionColorMap, divisionTextColor } from '../../../utils/tournament/colors';

export default function Schedule({ data, client, act, busy, go }) {
    const [assignments, setAssignments] = useState(data.schedule?.assignments || {});
    const [settings, setSettings] = useState(data.schedule?.settings || data.settings);
    const [date, setDate] = useState(data.playDays.find(d => d.is_active)?.play_date || '');
    const [filter, setFilter] = useState('all');
    const [selected, setSelected] = useState('');
    const [dirty, setDirty] = useState(false);
    const [notice, setNotice] = useState('');
    const [advanced, setAdvanced] = useState(false);
    const attempted = useRef(new Set());
    const ready = tournamentWorkflow(data).ready;
    const fixtures = tournamentFixtures(data);
    const colours = divisionColorMap(data.divisions, data.settings.divisionColors);
    const days = data.playDays.filter(d => d.is_active);
    const day = days.find(d => d.play_date === date) || days[0];
    const selectedMatch = fixtures.find(f => f.id === selected);
    const issues = scheduleIssues({ fixtures, assignments, playDays: days, settings });
    const stale = data.schedule && data.schedule.source_fingerprint !== data.sourceFingerprint;
    useEffect(() => {
        if (!ready || data.schedule || !days.length || attempted.current.has(data.sourceFingerprint)) return;
        attempted.current.add(data.sourceFingerprint);
        act(async () => {
            const baseline = Object.fromEntries(fixtures.filter(f => f.scheduled_start && f.scheduled_end).map(f => [f.id, { court_name: f.court_name, scheduled_start: f.scheduled_start, scheduled_end: f.scheduled_end, pinned: true }]));
            const plan = generateTournamentSchedule(data, data.settings, baseline);
            await client.saveSchedule(data, plan);
        }, 'Your tournament schedule is ready to review. Nothing has been published.');
    }, [ready, data.schedule, data.sourceFingerprint, data, days.length, fixtures, act, client]); // Idempotent server save protects simultaneous openings.
    useEffect(() => {
        if (!dirty) return;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        const guard = event => { if (event.target.closest('a[href]') && !window.confirm('Leave without saving your schedule moves?')) { event.preventDefault(); event.stopPropagation(); } };
        window.addEventListener('beforeunload', warn); document.addEventListener('click', guard, true);
        return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true); };
    }, [dirty]);
    const move = (id, court, time) => {
        const match = fixtures.find(f => f.id === id);
        if (!match || !['pending', 'scheduled'].includes(match.status) || busy) return;
        const existing = assignments[id];
        const minutes = existing ? (Date.parse(existing.scheduled_end) - Date.parse(existing.scheduled_start)) / 60000 : Number(match.match_duration_minutes || settings.divisionDurations?.[match.division_id] || settings.duration);
        const start = localStamp(day.play_date, time);
        const next = { ...assignments, [id]: { court_name: court, scheduled_start: new Date(start).toISOString(), scheduled_end: new Date(start + minutes * 60000).toISOString(), pinned: true } };
        const problems = scheduleIssues({ fixtures, assignments: next, playDays: days, settings });
        if (problems.length) { setNotice(problems[0]); return; }
        setNotice('Match moved in the private draft. Save changes when ready.'); setAssignments(next); setDirty(true);
    };
    const regenerate = () => {
        if (data.schedule && !window.confirm('Rebuild unpinned bookings around the finals programme? Manually pinned and started matches will stay in place.')) return;
        return act(async () => {
        const updatedDays = data.playDays.map(d => ({ ...d, match_duration_minutes: Number(settings.duration), minimum_break_minutes: Number(settings.rest) }));
        const pins = Object.fromEntries(Object.entries(assignments).filter(([, a]) => a.pinned));
        generateTournamentSchedule({ ...data, playDays: updatedDays }, settings, pins);
        await client.saveSettings(data, { ...settings, divisionColors: data.settings.divisionColors }, updatedDays);
        const fresh = await client.load(data.event.id);
        await client.saveSchedule(fresh, generateTournamentSchedule(fresh, settings, pins));
    }, 'Schedule regenerated. Review the private draft before publishing.');
    };
    if (!ready) return <section className="tm-panel tm-stack"><h2>Waiting for all division draws</h2><p className="muted">The schedule will populate automatically once every active division has published its draw.</p>{tournamentWorkflow(data).blockers.map(b => <div className="tm-list-item" key={b.divisionId}><span>{b.message}</span>{data.capabilities.includes('draws') && <button className="tm-button" onClick={() => go('draws', b.divisionId)}>Open draw</button>}</div>)}</section>;
    if (!day) return <div className="tm-notice">Set the tournament’s playing days and courts in Event Details before scheduling.</div>;
    const startHour = Number(day.start_time.slice(0, 2));
    const firstMinute = startHour * 60 + Number(day.start_time.slice(3, 5));
    const lastMinute = Number(day.end_time.slice(0, 2)) * 60 + Number(day.end_time.slice(3, 5));
    const height = (lastMinute - firstMinute) * 4 / 3;
    const slots = Array.from({ length: Math.ceil((lastMinute - firstMinute) / 30) }, (_, i) => {
        const m = firstMinute + i * 30; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    });
    return <div className="tm-stack">
        <div className="tm-between"><div><h2>Tournament schedule</h2><p className="muted">{settings.duration} min matches · {settings.rest} min rest · SAST · all divisions included</p></div><div className="tm-actions"><span className={'tm-status ' + (data.schedule?.status === 'published' && !dirty ? 'done' : '')}>{dirty ? 'Unsaved moves' : data.schedule?.status === 'published' ? 'Published' : 'Private draft'}</span>{dirty && <button className="tm-button" disabled={busy || issues.length > 0} onClick={() => act(() => client.saveSchedule(data, { assignments, fixtures, settings }), 'Private changes saved')}>Save draft</button>}<button className="tm-button primary" disabled={busy || dirty || stale || !data.schedule || issues.length > 0 || data.schedule.status === 'published'} onClick={() => act(() => client.publishSchedule(data), 'Schedule published to the public court calendar')}><Send size={14} />Publish schedule</button></div></div>
        {stale && <div className="tm-notice">Draws, results or court availability changed after this draft was saved. Review and regenerate before publishing. Existing public bookings remain unchanged.</div>}
        {notice && <div className="tm-notice info" role="status">{notice}</div>}
        {issues.length > 0 && <div className="tm-notice" role="alert">{issues[0]}</div>}
        <div className="tm-between"><div className="tm-actions">{days.map(d => <button key={d.play_date} className={'tm-button ' + (d.play_date === day.play_date ? 'primary' : 'quiet')} onClick={() => setDate(d.play_date)}><CalendarDays size={13} />{new Date(d.play_date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</button>)}</div><label className="tm-field">Show division<select className="tm-input" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All divisions</option>{data.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>
        {Object.keys(assignments).length === 0 && <div className="tm-notice">{busy ? 'Preparing the shared court schedule…' : 'The automatic schedule could not be completed. Adjust the available hours or finals programme in Advanced settings, then regenerate.'}</div>}
        <div className="tm-calendar-scroll"><div style={{ display: 'grid', gridTemplateColumns: '70px repeat(' + day.courts_count + ', minmax(185px, 1fr))', minWidth: 70 + day.courts_count * 190 }}>
            <div className="tm-court-head">SAST</div>{Array.from({ length: day.courts_count }, (_, i) => <div className="tm-court-head" key={i}>Court {i + 1}{settings.centreCourt === 'Court ' + (i + 1) && <small> · Centre</small>}</div>)}
            <div style={{ height }}>{slots.map(time => <div key={time} style={{ height: 40, fontSize: 11, color: '#a3b6c0', padding: '5px 10px', borderBottom: '1px solid #24353c' }}>{time}</div>)}</div>
            {Array.from({ length: day.courts_count }, (_, c) => <div key={c} style={{ position: 'relative', height }}>{slots.map(time => <button className="tm-slot" key={time} aria-label={'Move selected match to Court ' + (c + 1) + ' at ' + time} onClick={() => selected && move(selected, 'Court ' + (c + 1), time)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); move(e.dataTransfer.getData('text/plain'), 'Court ' + (c + 1), time); }} />)}
                {fixtures.filter(f => assignments[f.id]?.court_name === 'Court ' + (c + 1) && localDay(assignments[f.id].scheduled_start) === day.play_date && (filter === 'all' || f.division_id === filter)).map(f => {
                    const booking = assignments[f.id]; const top = (Date.parse(booking.scheduled_start) - localStamp(day.play_date, day.start_time)) / 60000 * 4 / 3;
                    const duration = (Date.parse(booking.scheduled_end) - Date.parse(booking.scheduled_start)) / 60000 * 4 / 3;
                    return <button key={f.id} className={'tm-match-card ' + (selected === f.id ? 'selected' : '')} draggable={!busy && ['pending', 'scheduled'].includes(f.status)} onDragStart={e => { e.dataTransfer.setData('text/plain', f.id); setSelected(f.id); }} onClick={() => setSelected(f.id)} style={{ top: top + 2, height: Math.max(24, duration - 4), '--division-color': colours.get(f.division_id)?.color, '--division-ink': divisionTextColor(colours.get(f.division_id)?.color) }} aria-label={f.label + ' at ' + localTime(booking.scheduled_start)}><strong>{data.divisions.find(d => d.id === f.division_id)?.name} · {f.round_label}</strong><span>{f.label}</span><br /><small>{localTime(booking.scheduled_start)}–{localTime(booking.scheduled_end)} {booking.pinned ? '· Pinned' : ''}</small></button>;
                })}
            </div>)}
        </div></div>
        {selectedMatch && <div className="tm-panel tm-stack"><div className="tm-between"><div><h3>{selectedMatch.label}</h3><p className="muted">Drag the match, or select a day and click a free time slot. Moves are pinned during regeneration.</p></div>{assignments[selected]?.pinned && <button className="tm-button" onClick={() => { setAssignments(a => ({ ...a, [selected]: { ...a[selected], pinned: false } })); setDirty(true); }}><LockKeyhole size={13} />Unpin booking</button>}</div></div>}
        <details className="tm-panel" open={advanced} onToggle={e => setAdvanced(e.currentTarget.open)}><summary>Advanced settings</summary><div className="tm-stack"><p className="muted">Defaults work for most tournaments. Changes here affect the complete tournament schedule.</p><div className="tm-field-row">
            <label className="tm-field">Finals start · last day<input className="tm-input" type="time" value={settings.finalsTime} onChange={e => setSettings(s => ({ ...s, finalsTime: e.target.value }))} /></label>
            <label className="tm-field">Centre court<select className="tm-input" value={settings.centreCourt} onChange={e => setSettings(s => ({ ...s, centreCourt: e.target.value }))}>{Array.from({ length: Math.max(...days.map(d => d.courts_count)) }, (_, i) => <option key={i}>Court {i + 1}</option>)}</select></label>
            {[['duration', 'Default match minutes'], ['rest', 'Minimum rest minutes']].map(([key, label]) => <label className="tm-field" key={key}>{label}<input className="tm-input" type="number" min={key === 'rest' ? 0 : 1} value={settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))} /></label>)}
        </div><div className="tm-notice info">Ladies Open on centre court first. Men’s Open follows on centre court. Men’s Advanced starts with Ladies Open on another court. Conflicts are flagged; these finals are never silently moved.</div>
        <div className="tm-field-row">{data.divisions.map(d => <label key={d.id} className="tm-field">{d.name} · match minutes<input className="tm-input" type="number" min="1" placeholder={String(settings.duration)} value={settings.divisionDurations?.[d.id] || ''} onChange={e => setSettings(s => ({ ...s, divisionDurations: { ...s.divisionDurations, [d.id]: e.target.value ? Number(e.target.value) : null } }))} /><small>Blank uses the default. Individual match minimums still apply.</small></label>)}</div>
        <div className="tm-field-row">{data.divisions.map(d => <label key={d.id} className="tm-field">{d.name} · final time override<input className="tm-input" type="time" value={settings.divisionFinalTimes?.[d.id] || ''} onChange={e => setSettings(s => ({ ...s, divisionFinalTimes: { ...s.divisionFinalTimes, [d.id]: e.target.value } }))} /><small>Leave blank to use the finals programme. Use separate times when divisions share players.</small></label>)}</div>
        <div className="tm-field-row">{data.divisions.map(d => <label key={d.id} className="tm-field">{d.name} · finals role<select className="tm-input" value={settings.divisionRoles[d.id] || 'other'} onChange={e => setSettings(s => ({ ...s, divisionRoles: { ...s.divisionRoles, [d.id]: e.target.value } }))}><option value="other">Other division</option><option value="ladies_open">Ladies Open</option><option value="mens_open">Men’s Open</option><option value="mens_advanced">Men’s Advanced</option></select></label>)}</div>
        <div className="tm-grid">{data.divisions.map(d => <fieldset key={d.id} className="tm-panel"><legend>{d.name} · playing days</legend><p className="muted">No selection allows every playing day.</p>{days.map(day => <label className="tm-check" key={day.play_date}><input type="checkbox" checked={settings.divisionDays?.[d.id]?.includes(day.play_date) || false} onChange={e => setSettings(s => ({ ...s, divisionDays: { ...s.divisionDays, [d.id]: e.target.checked ? [...(s.divisionDays?.[d.id] || []), day.play_date] : (s.divisionDays?.[d.id] || []).filter(date => date !== day.play_date) } }))} />{day.play_date}</label>)}</fieldset>)}</div>
        <div className="tm-actions"><button className="tm-button primary" disabled={busy || !data.capabilities.includes('settings')} onClick={regenerate}>Apply & regenerate unpinned matches</button>{data.capabilities.includes('settings') && <button className="tm-button" onClick={() => go('details')}>Edit courts & playing hours</button>}</div>
        </div></details>
    </div>;
}
