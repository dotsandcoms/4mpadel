import {planningMatches, planningSlotLabel} from '../../utils/drawPlanning';
import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import { scheduleMatchesAcrossPlayDays } from '../../utils/nativeDrawScheduler';
import { supabase } from '../../supabaseClient';
import { scheduleDateLabel, scheduleDay, scheduleTime, scheduleTimestamp, validateScheduleChanges } from '../../utils/drawScheduleBoard';
import { divisionColorMap } from '../../utils/divisionColors';

export default function DrawSchedulingBoard({ eventId, drawId, playDays, onSaved, alertHost, divisions = [], divisionConfigs = {} }) {
    const dialogRef = useRef(null);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [allDays, setAllDays] = useState(true);
    const [zoom, setZoom] = useState(1.5);
    const [matchSearch, setMatchSearch] = useState('');
    const [filterDivision, setFilterDivision] = useState('all');
    const [filterRound, setFilterRound] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [showMatchList, setShowMatchList] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640);
    useEffect(() => {
        if (!calendarOpen) return;
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        dialog.showModal(); document.body.style.overflow = 'hidden';
        return () => { dialog.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
    }, [calendarOpen]);
    const [data, setData] = useState({ matches: [], entries: [] });
    const [changes, setChanges] = useState({});
    const [selected, setSelected] = useState('');
    const [date, setDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const [loadError, setLoadError] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [step, setStep] = useState(30);
    const [dropTarget, setDropTarget] = useState('');
    const [roundPlan, setRoundPlan] = useState({});
    const [replan, setReplan] = useState(false);
    const [included, setIncluded] = useState(() => divisions.map(d => d.id));
    const [priority, setPriority] = useState([]);
    const [dragPriority, setDragPriority] = useState('');
    const [finalsTogether, setFinalsTogether] = useState(true);
    const [finalTime, setFinalTime] = useState('');
    const movePriority = (key, target, order) => { const next = order.filter(k => k !== key); next.splice(next.indexOf(target), 0, key); setPriority(next); };
    const roundKey = match => `${match.draw_id}:${match.stage}:${match.round_number}:${match.round_code || ''}`;
    const days = playDays.filter((day) => day.is_active);
    const day = days.find((item) => item.play_date === date) || days[0];
    const merged = planningMatches(data.matches.map((match) => ({ ...match, ...(changes[match.id] || {}) })));
    const entryMap = new Map(data.entries.map((entry) => [entry.id, entry]));
    // Use the full event division list, so colours do not change with the day or selected draw.
    const divisionStyles = divisionColorMap(divisions);
    const matchDivision = match => divisionStyles.get(match.draws?.division_id) || {name:'Other division',color:'#cbd5e1'};
    const label = (match) => match.americano_fixture_key ? (match.notes || 'Americano · rotating pairs') : `${entryMap.get(match.entry_one_id)?.team_name || planningSlotLabel(merged,match,1)} vs ${entryMap.get(match.entry_two_id)?.team_name || planningSlotLabel(merged,match,2)}`;
    const movable = (match) => included.includes(match.draws?.division_id) && !match.americano_fixture_key && ['pending', 'scheduled'].includes(match.status) && match.can_plan;
    const ready = merged.filter(movable);
    const defaultRounds = [...new Map(ready.map(match => [roundKey(match), match])).entries()]
        .sort(([,a],[,b]) => {
            const back = m => m.stage === 'placement' || ['silver','bronze'].includes(m.draws?.draw_kind);
            const level = m => Number(/(?:div(?:ision)?\s*)(\d+)/i.exec(matchDivision(m).name)?.[1] || 0);
            return Number(back(a))-Number(back(b)) || level(b)-level(a) || (a.round_number||0)-(b.round_number||0);
        });
    const order = [...priority.filter(k => defaultRounds.some(([key]) => key===k)), ...defaultRounds.map(([k])=>k).filter(k=>!priority.includes(k))];
    const rounds = defaultRounds.sort(([a],[b])=>order.indexOf(a)-order.indexOf(b));
    const isMainFinal = m => m.stage === 'knockout' && !m.winner_to_match_id && !['silver','bronze'].includes(m.draws?.draw_kind);
    const selectedMatch = ready.find(match => match.id === selected);
    const errors = validateScheduleChanges({ ...data, divisions, playDays, changes });
    const count = Object.keys(changes).length;
    const inputClass = 'rounded-lg border border-white/15 bg-[#101010] px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300';

    const fetchData = async () => {
        const [matchesResult, entriesResult] = await Promise.all([
            supabase.from('draw_matches').select('*, draws!inner(event_id, status, division_id, draw_kind)').eq('draws.event_id', eventId).in('draws.status', ['draft', 'published', 'in_progress', 'completed']),
            supabase.from('draw_entries').select('id, team_name, player_one_id, player_two_id, player_one_name, player_two_name, draws!inner(event_id)').eq('draws.event_id', eventId),
        ]);
        if (matchesResult.error || entriesResult.error) throw matchesResult.error || entriesResult.error;
        return { matches: matchesResult.data || [], entries: entriesResult.data || [] };
    };

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetchData().then((next) => { if (active) { setData(next); setLoadError(''); } })
            .catch((error) => { if (active) setLoadError(error.message); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
        // This board is remounted when the selected draw changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, drawId, refresh]);

    useEffect(() => {
        if (!count) return;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [count]);

    const assign = (id, court, time, targetDay = day) => {
        if (saving || !targetDay || !ready.some((match) => match.id === id)) return;
        const start = scheduleTimestamp(targetDay.play_date, time);
        if(start<scheduleTimestamp(targetDay.play_date,targetDay.start_time)||start>=scheduleTimestamp(targetDay.play_date,targetDay.end_time)){setNotice('This time is outside the play day’s available hours.');return;}
        const match = merged.find(item => item.id === id);
        const allowed = divisionConfigs[match.draws?.division_id]?.play_dates;
        if (allowed && !allowed.includes(targetDay.play_date)) { setNotice('This division does not play on that date. Update its playing days in Tournament settings first.'); return; }
        const previousDuration = Date.parse(match.scheduled_end) - Date.parse(match.scheduled_start);
        const end = start + (match.match_duration_minutes ? match.match_duration_minutes * 60_000 : previousDuration > 0 ? previousDuration : Number(targetDay.match_duration_minutes) * 60_000);
        if (!Number.isFinite(end) || end <= start) { setNotice('Set a valid match duration in Play days first.'); return; }
        setChanges((current) => ({ ...current, [id]: { ...current[id], court_name: court, scheduled_start: new Date(start).toISOString(), scheduled_end: new Date(end).toISOString() } }));
        setDropTarget('');
        setNotice(`Moved to ${court} on ${scheduleDateLabel(targetDay.play_date)} at ${time}. Review the calendar, then Save schedule.`);
    };

    const customizeMatch = (values) => {
        if (!selectedMatch || saving) return;
        const next = { ...changes[selected], ...values };
        if ('match_duration_minutes' in values && selectedMatch.scheduled_start) {
            const matchDay = playDays.find(item => item.play_date === scheduleDay(selectedMatch.scheduled_start));
            const duration = values.match_duration_minutes ?? Number(matchDay?.match_duration_minutes || 60);
            next.scheduled_end = new Date(Date.parse(selectedMatch.scheduled_start) + duration * 60_000).toISOString();
        }
        setChanges(current => ({ ...current, [selected]: next }));
        setNotice('Match settings updated in preview. Adjust any conflicting times, then Save schedule.');
    };

    const autoAssign = () => {
        try {
            const candidates = ready.filter(match => replan || !match.court_name || !match.scheduled_start)
                .map(match => {
                    const plan = roundPlan[roundKey(match)];
                    const final = finalsTogether && isMainFinal(match);
                    const plannedDate = final ? [...days].sort((a,b)=>a.play_date.localeCompare(b.play_date)).at(-1)?.play_date : plan?.date;
                    const time = final ? finalTime : plan?.time;
                    const earliest = plannedDate && time ? scheduleTimestamp(plannedDate, time) : 0;
                    return { ...match, ...(replan ? {court_name:null, scheduled_start:null, scheduled_end:null} : {}),
                        allowed_play_dates:divisionConfigs[match.draws?.division_id]?.play_dates, planned_play_date:plannedDate || null, align_final:final,
                        not_before:earliest ? new Date(Math.max(earliest, Date.parse(match.not_before) || 0)).toISOString() : match.not_before };
                })
                .sort((a,b) => Number(a.align_final)-Number(b.align_final) || order.indexOf(roundKey(a))-order.indexOf(roundKey(b)) || (a.bracket_position||0)-(b.bracket_position||0));
            if (!candidates.length) { setNotice('All schedulable matches already have courts and times.'); return; }
            const ids = new Set(candidates.map(match => match.id));
            const withPlayers = match => ({...match,align_final:finalsTogether && isMainFinal(match),possible_player_keys:(match.possible_entry_ids||[]).flatMap(id=>{
                const entry=entryMap.get(id);return [`entry:${id}`,...['one','two'].flatMap(side=>[entry?.[`player_${side}_id`] ? `player:${entry[`player_${side}_id`]}` : null,entry?.[`player_${side}_name`]?.trim() ? `name:${entry[`player_${side}_name`].trim().toLowerCase()}` : null].filter(Boolean))];
            })});
            const updates = scheduleMatchesAcrossPlayDays({ matches: candidates.map(withPlayers), playDays,
                existingMatches: merged.filter(match => !ids.has(match.id) && match.status !== 'cancelled').map(withPlayers) });
            const next = { ...changes, ...Object.fromEntries(updates.map(({id, ...values}) => [id, { ...changes[id], ...values }])) };
            const issues = validateScheduleChanges({ ...data, divisions, playDays, changes: next });
            if (issues.length) throw new Error(issues.join(' '));
            setChanges(next);
            setAllDays(true);
            setCalendarOpen(true);
            setNotice(`${updates.length} matches assigned in preview. Review the courts and times, then Save schedule.`);
        } catch (error) { setNotice(error.message); }
    };

    const save = async () => {
        if (!count || errors.length || saving) return;
        setSaving(true);
        const savedIds = [];
        try {
            const fresh = await fetchData();
            const stale = fresh.matches.find((match) => changes[match.id] && match.updated_at !== data.matches.find((old) => old.id === match.id)?.updated_at);
            if (stale) throw new Error(`${matchDivision(stale).name} · ${stale.round_label} · Match ${stale.bracket_position}: ${label(stale)} changed elsewhere since this preview was loaded. Discard the preview and reload before saving.`);
            const issues = validateScheduleChanges({ ...fresh, divisions, previousMatches: data.matches, playDays, changes });
            if (issues.length) throw new Error(issues.join(' '));
            for (const [id, values] of Object.entries(changes)) {
                const original = fresh.matches.find((match) => match.id === id);
                const { error } = await supabase.from('draw_matches').update({ ...values, updated_at: new Date().toISOString() })
                    .eq('id', id).eq('draw_id', original.draw_id).eq('updated_at', original.updated_at).in('status', ['pending', 'scheduled']).select('id').single();
                if (error) throw error;
                savedIds.push(id);
            }
            setNotice(`${savedIds.length} match assignments saved. Published draws also update the public calendar.`);
        } catch (error) {
            setNotice(`${savedIds.length ? `${savedIds.length} assignments saved before the error. ` : 'Nothing saved. '}${error.message}`);
        } finally {
            setChanges((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !savedIds.includes(id))));
            if (savedIds.length) onSaved(savedIds.map((id) => ({ id, ...changes[id] })));
            setRefresh((value) => value + 1);
            setSaving(false);
        }
    };


    const card = (match, blockStyle) => <button type="button" key={match.id} draggable={Boolean(movable(match) && !saving)} disabled={saving || !movable(match)}
        onDragStart={(event) => { event.dataTransfer.setData('text/plain', match.id); event.dataTransfer.effectAllowed = 'move'; setSelected(match.id); }}
        onDragEnd={() => setDropTarget('')} title={`${matchDivision(match).name} · ${label(match)} · ${match.round_label} · ${match.scheduled_start ? scheduleTime(match.scheduled_start) : 'Unscheduled'}`} onClick={() => setSelected(match.id)} aria-pressed={selected === match.id} style={{...blockStyle, backgroundColor:`color-mix(in srgb, ${matchDivision(match).color} 12%, #101010)`, borderColor:matchDivision(match).color, borderLeftWidth:4, borderStyle:changes[match.id] ? 'dashed' : 'solid', boxShadow:selected === match.id ? '0 0 0 2px #fff' : undefined}}
        className={`block overflow-hidden rounded-lg border ${blockStyle ? (blockStyle.height < 25 ? 'p-0' : 'p-1.5') : 'p-3'} text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${blockStyle ? 'absolute' : 'w-full'} ${selected === match.id ? 'border-sky-300 bg-[#17384a]' : changes[match.id] ? 'border-amber-300 bg-[#362f18]' : movable(match) ? 'border-sky-300/30 bg-[#102333]' : 'border-white/15 bg-[#202328]'} ${movable(match) ? 'cursor-grab active:cursor-grabbing' : ''}`}>
        <span className={`${blockStyle && blockStyle.height < 100 ? 'truncate' : ''} block font-bold text-white leading-tight`}><span style={{color:matchDivision(match).color}}>{matchDivision(match).name} · </span>{label(match)}</span>
        <span className={`${blockStyle && blockStyle.height < 100 ? 'hidden' : 'mt-2 block'} text-gray-300`}>{match.round_label} · Match {match.bracket_position}</span>
        {match.scheduled_start && (!blockStyle || blockStyle.height >= 40) && <span className="mt-1 block font-bold text-sky-200">{scheduleTime(match.scheduled_start)} · {match.court_name || 'Court TBD'}</span>}
        <span className={`${blockStyle && blockStyle.height < 100 ? 'hidden' : 'mt-1 block'} text-[10px] uppercase text-gray-400`}>{changes[match.id] ? 'Unsaved change' : movable(match) ? 'Drag or select to move' : 'Reserved · read-only'}</span>
    </button>;

    const filteredMatches = ready.filter(m => (filterDivision === 'all' || matchDivision(m).name === filterDivision) && (filterRound === 'all' || m.round_label === filterRound) && (filterStatus === 'all' || (filterStatus === 'unscheduled' ? !m.court_name || !m.scheduled_start : m.court_name && m.scheduled_start)) && matchSearch.toLowerCase().trim().split(/\s+/).every(term => `${label(m)} ${matchDivision(m).name} ${m.round_label} ${m.court_name || ''}`.toLowerCase().includes(term)));
    const calendar = calendarOpen && createPortal(<dialog ref={dialogRef} aria-labelledby="court-calendar-title" onCancel={event=>{event.preventDefault();setCalendarOpen(false);}} className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-[#0b0e10] p-0 text-white backdrop:bg-black/80">
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-[#111820] px-4 py-3 sm:px-6"><div><h2 id="court-calendar-title" className="text-lg font-bold">Court calendar</h2><p className="text-xs text-gray-400">SAST · Drag matches or select a match and click its new time</p></div><div className="flex items-center gap-3"><span role="status" className="text-xs text-amber-200">{count ? `${count} unsaved changes` : 'No unsaved changes'}</span><button type="button" onClick={save} disabled={!count||saving||errors.length>0} className="rounded-lg bg-sky-300 px-4 py-2 font-bold text-black disabled:opacity-40">{saving?'Saving…':'Save schedule'}</button><button type="button" autoFocus onClick={()=>setCalendarOpen(false)} className="rounded-lg border border-white/25 px-4 py-2 text-sm font-bold">Close calendar</button></div></header>
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3"><button type="button" aria-pressed={allDays} onClick={()=>setAllDays(v=>!v)} className="rounded-lg bg-sky-300 px-4 py-2 text-sm font-bold text-black">{allDays?'All days · switch to day view':'Show full tournament'}</button><label className="text-xs text-gray-300">Play day <select className={inputClass} value={day?.play_date||''} onChange={e=>{setDate(e.target.value);setAllDays(false);}}>{days.map(item=><option key={item.play_date} value={item.play_date}>{scheduleDateLabel(item.play_date)}</option>)}</select></label><label className="text-xs text-gray-300">Snap <select className={inputClass} value={step} onChange={e=>setStep(Number(e.target.value))}><option value={5}>5 min</option><option value={15}>15 min</option><option value={30}>30 min</option></select></label><label className="text-xs text-gray-300">Zoom <select className={inputClass} value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={0.75}>Overview</option><option value={1.5}>Comfortable</option><option value={3}>Detailed</option></select></label><button type="button" aria-expanded={showMatchList} onClick={()=>setShowMatchList(v=>!v)} className={inputClass}>{showMatchList?'Hide matches':'Show matches'}</button><button type="button" disabled={saving} onClick={autoAssign} className={`${inputClass} text-sky-200`}>Auto-assign</button></div>
            <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 px-4 py-2" aria-label="Division colours">{[...divisionStyles].map(([id,d])=><span key={id} className="flex items-center gap-2 text-xs text-gray-300"><span className="h-2 w-2 rounded-full" style={{backgroundColor:d.color}}/>{d.name}</span>)}</div>
            {!!errors.length && <div className="max-h-32 shrink-0 overflow-auto px-4 pb-2"><ScheduleErrors errors={errors}/></div>}
            <div className="flex min-h-0 flex-1 gap-4 px-4 pb-3">
                {showMatchList && <aside className="w-80 shrink-0 overflow-y-auto overscroll-contain rounded-xl border border-sky-300/40 bg-[#11171b] p-3 max-sm:absolute max-sm:inset-x-4 max-sm:bottom-12 max-sm:top-56 max-sm:z-40 max-sm:w-auto max-sm:shadow-2xl">
                <div className="mb-4 rounded-xl border border-sky-300/40 bg-sky-300/10 p-3"><h3 className="font-bold text-sky-200">Find & select a match</h3><label className="mt-3 block text-sm font-bold text-white">Search players or matches<input type="search" value={matchSearch} onChange={e=>setMatchSearch(e.target.value)} className="mt-2 w-full rounded-lg border-2 border-sky-300 bg-[#091318] p-3 text-base text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="Name, round or court…" /></label>
                <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs text-sky-100">Division<select value={filterDivision} onChange={e=>{setFilterDivision(e.target.value);setFilterRound('all');}} className={`${inputClass} mt-1 w-full`}><option value="all">All divisions</option>{[...new Set(ready.map(m=>matchDivision(m).name))].map(name=><option key={name}>{name}</option>)}</select></label><label className="text-xs text-sky-100">Round<select value={filterRound} onChange={e=>setFilterRound(e.target.value)} className={`${inputClass} mt-1 w-full`}><option value="all">All rounds</option>{[...new Set(ready.filter(m=>filterDivision==='all'||matchDivision(m).name===filterDivision).map(m=>m.round_label))].map(name=><option key={name}>{name}</option>)}</select></label></div>
                <label className="mt-3 block text-xs text-sky-100">Scheduling<select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className={`${inputClass} mt-1 w-full`}><option value="all">All matches</option><option value="unscheduled">Unscheduled</option><option value="scheduled">Scheduled</option></select></label>
                <div className="mt-3 flex items-center justify-between gap-2"><p role="status" className="text-xs text-sky-100">{filteredMatches.length} of {ready.length} matches</p><button type="button" onClick={()=>{setMatchSearch('');setFilterDivision('all');setFilterRound('all');setFilterStatus('all');}} className="text-xs font-bold text-sky-200 underline">Clear filters</button></div></div>

                {selectedMatch && <div className="mb-3 rounded-lg border border-sky-300/30 p-3"><p className="mb-2 text-xs text-sky-200">Selected match · choose a day, then click a slot</p>{card(selectedMatch)}</div>}
                        {selectedMatch && <fieldset disabled={saving} className="mb-4 grid gap-3 rounded-lg border border-sky-300/30 bg-sky-300/5 p-4 "><legend className="px-1 text-sm font-bold text-sky-200">Selected match timing</legend>
                            <label className="text-xs text-gray-300">Match duration (minutes)<input type="number" min="1" step="1" placeholder="Use play-day default" value={selectedMatch.match_duration_minutes ?? ''} onChange={event => customizeMatch({match_duration_minutes:event.target.value === '' ? null : Number(event.target.value)})} className={`${inputClass} mt-2 w-full`} /><span className="mt-1 block text-gray-400">Increase this to reserve extra court time. Blank uses the day’s default.</span></label>
                            <label className="text-xs text-gray-300">Not before (SAST)<input type="datetime-local" value={selectedMatch.not_before ? `${scheduleDay(selectedMatch.not_before)}T${scheduleTime(selectedMatch.not_before)}` : ''} onChange={event => customizeMatch({not_before:event.target.value ? new Date(`${event.target.value}:00+02:00`).toISOString() : null})} className={`${inputClass} mt-2 w-full [color-scheme:dark]`} /><span className="mt-1 block text-gray-400">Earliest allowed start after a delay. Move an existing booking if it is too early.</span></label>
                        </fieldset>}

                <p className="mb-3 text-xs text-gray-300">Select a card below, then click a calendar time to move it. Filters only narrow this list.</p><div className="space-y-2">{filteredMatches.map(m=>card(m))}{!filteredMatches.length&&<p className="rounded-lg border border-white/15 p-3 text-sm text-gray-300">No matches found. Try another name or clear the filters.</p>}</div></aside>}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">                        <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border border-white/15" tabIndex={0} aria-label="Match calendar; times down the left and courts across the top">
                            <div className="flex items-start">{(allDays?days:day?[day]:[]).map(day=>{
                                const earliest=allDays?days.reduce((time,d)=>d.start_time<time?d.start_time:time,days[0].start_time):day.start_time;
                                const latest=allDays?days.reduce((time,d)=>d.end_time>time?d.end_time:time,days[0].end_time):day.end_time;
                                const start=scheduleTimestamp(day.play_date,earliest);
                                const finish=scheduleTimestamp(day.play_date,latest);
                                const slots=Array.from({length:Math.max(0,Math.min(288,Math.ceil((finish-start)/(step*60000))))},(_,i)=>new Date(start+i*step*60000).toISOString());
                                const courts=Array.from({length:Math.max(0,Math.min(99,Number(day.courts_count)||0))},(_,i)=>`Court ${i+1}`);
                                return (
                            <section key={day.play_date} aria-label={`Schedule for ${day.play_date}`} className="shrink-0 border-r-4 border-sky-300/25" style={{ width:64 + courts.length * (allDays?150:200) }}><h3 className="sticky top-0 z-30 bg-sky-950 px-4 py-3 font-bold text-sky-100">{new Date(`${day.play_date}T12:00:00+02:00`).toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'short'})}<span className="ml-3 text-xs font-normal">{day.start_time.slice(0,5)}–{day.end_time.slice(0,5)} · {courts.length} courts</span></h3>
                                <div className="sticky top-12 z-30 grid bg-[#101820] text-sm font-bold text-sky-200" style={{gridTemplateColumns:`64px repeat(${courts.length}, minmax(0, 1fr))`}}><div className="p-3">SAST</div>{courts.map(court => <div key={court} className="border-l border-white/10 p-3">{court}</div>)}</div>
                                <div className="grid" style={{gridTemplateColumns:`64px repeat(${courts.length}, minmax(0, 1fr))`}}>
                                    <div className="sticky left-0 z-20 bg-[#101820]">{slots.map((slot,index) => <div key={slot} className="relative border-t border-white/10 px-2 text-xs tabular-nums text-gray-300" style={{height:step * zoom}}>{index % Math.max(1,30/step) === 0 ? <span className="absolute left-2 top-0 z-10 bg-[#101820] leading-4">{scheduleTime(slot)}</span> : null}</div>)}</div>
                                    {courts.map(court => <div key={court} className="relative border-l border-white/10" style={{height:slots.length * step * zoom}}
                                        onDragOver={event => { if (!saving) event.preventDefault(); }}
                                        onDrop={event => { if (saving) return; event.preventDefault(); const index = Math.max(0, Math.min(slots.length - 1, Math.floor((event.clientY - event.currentTarget.getBoundingClientRect().top) / (step * zoom)))); if (slots[index]) assign(event.dataTransfer.getData('text/plain'), court, scheduleTime(slots[index]), day); }}>
                                        {slots.map(slot => {
                                            const target = `${day.play_date}-${court}-${slot}`;
                                            const closed=Date.parse(slot)<scheduleTimestamp(day.play_date,day.start_time)||Date.parse(slot)>=scheduleTimestamp(day.play_date,day.end_time);
                                            return <button type="button" key={slot} disabled={saving||closed} aria-label={`Assign selected match to ${court} on ${day.play_date} at ${scheduleTime(slot)}`} onClick={() => assign(selected, court, scheduleTime(slot), day)}
                                                onDragOver={event => { if (!saving) { event.preventDefault(); event.dataTransfer.dropEffect='move'; setDropTarget(target); } }} onDragLeave={() => setDropTarget('')} onDrop={event => { event.preventDefault(); event.stopPropagation(); assign(event.dataTransfer.getData('text/plain'), court, scheduleTime(slot), day); }}
                                                className={`block w-full border-t border-white/10 text-left text-xs text-gray-500 hover:bg-sky-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${dropTarget === target ? 'bg-sky-300/20 ring-2 ring-inset ring-sky-300' : closed ? 'bg-white/10 opacity-40' : 'bg-black/20'}`} style={{height:step * zoom}}><span className="px-2">{selected && step * zoom >= 24 ? `${scheduleTime(slot)} · Place here` : ''}</span></button>;
                                        })}
                                        {merged.filter(match => match.status !== 'cancelled' && match.court_name === court && match.scheduled_start && scheduleDay(match.scheduled_start) === day.play_date).map(match => {
                                            const time = Date.parse(match.scheduled_start);
                                            const end = Date.parse(match.scheduled_end) || time + Number(day.match_duration_minutes) * 60_000;
                                            return card(match, {top:Math.max(0,(time-start)/60_000*zoom)+2,left:3,right:3,height:Math.max(18,(end-time)/60_000*zoom-4)});
                                        })}
                                    </div>)}
                                </div>
                            </section>
                            );})}</div>
                        </div></div>
            </div>
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-2"><p role="status" className="truncate text-xs text-sky-200">{notice || 'Closing keeps your preview. Save schedule to apply changes.'}</p><button type="button" disabled={saving||!count} onClick={()=>{setChanges({});setSelected('');setNotice('Preview discarded.');setRefresh(v=>v+1);}} className="shrink-0 text-xs text-gray-300 underline disabled:opacity-40">Discard / reload</button></footer>
        </div>
    </dialog>, document.body);

    return <>{calendar}<details open className="mb-5 rounded-xl border border-sky-300/25 bg-sky-300/[0.04]">
        <summary className="cursor-pointer px-4 py-4 font-bold text-white">Assign courts & times</summary>
        <div className="space-y-4 border-t border-white/10 p-4">
            <p className="text-sm text-gray-400">Drag a match onto a court and time to move it. To change days, select the match, choose a play day, then click its new slot. Changes stay in preview until you save. All times are SAST (UTC+2).</p>
            <div aria-label="Division colour legend" className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-white/10 bg-black/20 p-3">{[...divisionStyles].map(([id, division]) => <span key={id} className="inline-flex items-center gap-2 text-sm text-gray-200"><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{backgroundColor:division.color}} />{division.name}</span>)}</div>
            {loading && <p role="status" className="text-sky-200">Loading event bookings…</p>}
            {loadError && <p role="alert" className="text-red-300">{loadError}</p>}
            {!day && <p className="text-amber-200">Configure active play days and courts above before scheduling.</p>}
            {!loading && !loadError && day && <>
                <p className="text-sm text-gray-400">Automatically plan the selected divisions across all available days, courts and times. Round sizes come from each saved draw: a 16-team draw starts at the Round of 16, while a larger draw includes the Round of 32. Each round finishes before its next round starts, including the required rest. Main finals use the last day by default. You can schedule before the teams advancing are known.</p>
                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={autoAssign} disabled={saving || !ready.length} className="rounded-lg bg-sky-300 px-5 py-3 font-bold text-black disabled:opacity-40">Automatically schedule tournament</button>
                    <button type="button" onClick={()=>setCalendarOpen(true)} className="rounded-lg border border-sky-300 px-5 py-3 font-bold text-sky-200">Open full-screen calendar</button>
                </div>
                <p className="text-sm text-gray-300">{days.length} play days · {ready.filter(m=>!m.scheduled_start||!m.court_name).length} unscheduled matches{count ? ` · ${count} unsaved changes` : ''}</p>
                <p className="text-xs text-gray-400">All divisions are included by default. Existing bookings stay in place; use the options below to reassign unplayed matches or set specific round days.</p>
                <details className="rounded-xl border border-sky-300/30 bg-black/20 p-4">
                    <summary className="cursor-pointer font-bold text-sky-200">Scheduling options · divisions, round days & priority</summary>
                    <fieldset disabled={saving} className="my-4 flex flex-wrap gap-4"><legend className="mb-2 text-sm text-white">Include divisions in this plan</legend>{divisions.map(d => <label key={d.id} className="text-sm text-gray-200"><input type="checkbox" checked={included.includes(d.id)} onChange={e => setIncluded(current => e.target.checked ? [...current,d.id] : current.filter(id=>id!==d.id))} /> {d.name}{!data.matches.some(m=>m.draws?.division_id===d.id) && ' · save a draw first'}</label>)}</fieldset>
                    <div className="my-4 rounded-lg border border-amber-300/30 bg-amber-300/5 p-4"><label className="text-sm text-amber-100"><input type="checkbox" checked={finalsTogether} onChange={e=>setFinalsTogether(e.target.checked)} /> Main finals on the last play day, together where courts allow</label>{finalsTogether && <label className="mt-3 block text-xs text-gray-300">Finals not before (optional, SAST)<input type="time" className={`${inputClass} ml-3`} value={finalTime} onChange={e=>setFinalTime(e.target.value)} /></label>}<p className="mt-2 text-xs text-gray-400">Overflow finals follow as courts become free. All preceding rounds and minimum rest must fit first.</p></div>
                    <p className="my-3 text-sm text-gray-300">Drag rounds into priority order, or use the arrows. Lower divisions and main draws come first by default. Choose days only where needed; dependencies always take precedence over priority.</p>
                    <fieldset disabled={saving} className="space-y-3">
                        {rounds.map(([key, match], index) => <div draggable={!saving} onDragStart={()=>setDragPriority(key)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); if(dragPriority && dragPriority!==key) movePriority(dragPriority,key,order);}} key={key} className="grid items-center gap-3 border-b border-white/10 pb-3 sm:grid-cols-3">
                            <span className="text-sm font-bold text-white"><span className="mb-1 block" style={{color:matchDivision(match).color}}>{matchDivision(match).name}</span><button type="button" aria-label={`Move ${match.round_label} earlier`} disabled={index===0} onClick={()=>movePriority(key,order[index-1],order)} className="mr-2 disabled:opacity-25">↑</button><button type="button" aria-label={`Move ${match.round_label} later`} disabled={index===order.length-1} onClick={()=>{const next=[...order]; [next[index],next[index+1]]=[next[index+1],next[index]];setPriority(next);}} className="mr-2 disabled:opacity-25">↓</button>{match.round_label}<span className="ml-2 font-normal text-gray-400">({ready.filter(item => roundKey(item) === key).length} matches)</span></span>
                            <label className="text-xs text-gray-300">Round play day<select aria-label={`${match.round_label} play day`} className={`${inputClass} mt-1 w-full`} value={roundPlan[key]?.date || ''} onChange={event => setRoundPlan(current => ({...current,[key]:{...current[key],date:event.target.value}}))}><option value="">Any active day</option>{days.map(item => <option key={item.play_date} value={item.play_date}>{scheduleDateLabel(item.play_date)}</option>)}</select></label>
                            <label className="text-xs text-gray-300">Start from (SAST)<input type="time" disabled={!roundPlan[key]?.date} className={`${inputClass} mt-1 w-full [color-scheme:dark]`} value={roundPlan[key]?.time || ''} onChange={event => setRoundPlan(current => ({...current,[key]:{...current[key],time:event.target.value}}))} /></label>
                        </div>)}
                        <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={replan} onChange={event => setReplan(event.target.checked)} />Reassign existing unplayed matches in the selected divisions too</label>
                        <p className="text-xs text-gray-400">Round choices apply to the next automatic assignment. Saved match bookings keep their dates. Played matches and unselected divisions stay reserved. Americano rotations are reserved here; edit their wave schedule in their division.</p>
                    </fieldset>
                </details>
                {!!errors.length && !calendarOpen && (alertHost ? createPortal(<ScheduleErrors errors={errors} />, alertHost) : <ScheduleErrors errors={errors} />)}
                <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                    <button type="button" onClick={save} disabled={!count || saving || errors.length > 0} className="rounded-lg bg-sky-300 px-4 py-3 text-sm font-black text-black disabled:opacity-40">{saving ? 'Saving…' : `Save schedule (${count})`}</button>
                    <button type="button" disabled={saving} onClick={() => { setChanges({}); setSelected(''); setNotice('Preview discarded.'); setRefresh((value) => value + 1); }} className="rounded-lg border border-white/20 px-4 py-3 text-sm text-gray-300">Discard / reload</button>
                    <p className="text-xs text-gray-400">Saving updates the connected database, including live if shared with localhost.</p>
                </div>
            </>}
            <p role="status" className="text-sm text-sky-200">{notice}</p>
        </div>
    </details></>;
}

function ScheduleErrors({ errors }) {
    return <div role="alert" className="rounded-xl border border-red-300/50 bg-[#291c1f] p-4 text-sm text-red-100 shadow-lg">
        <p className="mb-2 font-bold">Schedule conflicts — fix these before saving</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto">{errors.map(error => <li key={error}>{error}</li>)}</ul>
    </div>;
}
