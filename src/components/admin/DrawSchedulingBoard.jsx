import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { scheduleDay, scheduleTime, scheduleTimestamp, validateScheduleChanges } from '../../utils/drawScheduleBoard';

export default function DrawSchedulingBoard({ eventId, drawId, playDays, onSaved }) {
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
    const days = playDays.filter((day) => day.is_active);
    const day = days.find((item) => item.play_date === date) || days[0];
    const merged = data.matches.map((match) => ({ ...match, ...(changes[match.id] || {}) }));
    const entryMap = new Map(data.entries.map((entry) => [entry.id, entry]));
    const label = (match) => `${entryMap.get(match.entry_one_id)?.team_name || 'TBD'} vs ${entryMap.get(match.entry_two_id)?.team_name || 'TBD'}`;
    const movable = (match) => match.draw_id === drawId && ['pending', 'scheduled'].includes(match.status) && match.entry_one_id && match.entry_two_id;
    const ready = merged.filter(movable);
    const errors = validateScheduleChanges({ ...data, playDays, changes });
    const count = Object.keys(changes).length;
    const inputClass = 'rounded-lg border border-white/15 bg-[#101010] px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300';

    const fetchData = async () => {
        const [matchesResult, entriesResult] = await Promise.all([
            supabase.from('draw_matches').select('*, draws!inner(event_id, status)').eq('draws.event_id', eventId).in('draws.status', ['published', 'in_progress', 'completed']),
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

    const assign = (id, court, time) => {
        if (saving || !day || !ready.some((match) => match.id === id)) return;
        const start = scheduleTimestamp(day.play_date, time);
        const end = start + Number(day.match_duration_minutes) * 60_000;
        if (!Number.isFinite(end) || end <= start) { setNotice('Set a valid match duration in Play days first.'); return; }
        setChanges((current) => ({ ...current, [id]: { court_name: court, scheduled_start: new Date(start).toISOString(), scheduled_end: new Date(end).toISOString() } }));
        setNotice('Preview updated. Review the board, then Save schedule.');
    };

    const save = async () => {
        if (!count || errors.length || saving) return;
        setSaving(true);
        const savedIds = [];
        try {
            const fresh = await fetchData();
            const stale = fresh.matches.some((match) => changes[match.id] && match.updated_at !== data.matches.find((old) => old.id === match.id)?.updated_at);
            if (stale) throw new Error('A match changed elsewhere. Discard the preview and reload before saving.');
            const issues = validateScheduleChanges({ ...fresh, playDays, changes });
            if (issues.length) throw new Error(issues.join(' '));
            for (const [id, values] of Object.entries(changes)) {
                const original = fresh.matches.find((match) => match.id === id);
                const { error } = await supabase.from('draw_matches').update({ ...values, updated_at: new Date().toISOString() })
                    .eq('id', id).eq('draw_id', drawId).eq('updated_at', original.updated_at).in('status', ['pending', 'scheduled']).select('id').single();
                if (error) throw error;
                savedIds.push(id);
            }
            setNotice(`${savedIds.length} match assignments saved. The public calendar will reflect them.`);
        } catch (error) {
            setNotice(`${savedIds.length ? `${savedIds.length} assignments saved before the error. ` : 'Nothing saved. '}${error.message}`);
        } finally {
            setChanges((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !savedIds.includes(id))));
            if (savedIds.length) onSaved(savedIds.map((id) => ({ id, ...changes[id] })));
            setRefresh((value) => value + 1);
            setSaving(false);
        }
    };

    const start = day ? scheduleTimestamp(day.play_date, day.start_time) : 0;
    const finish = day ? scheduleTimestamp(day.play_date, day.end_time) : 0;
    const slots = Array.from({ length: Math.max(0, Math.min(288, Math.ceil((finish - start) / (step * 60_000)))) }, (_, index) => new Date(start + index * step * 60_000).toISOString());
    const courts = Array.from({ length: Math.max(0, Math.min(99, Number(day?.courts_count) || 0)) }, (_, index) => `Court ${index + 1}`);
    const card = (match, blockStyle) => <button type="button" key={match.id} draggable={Boolean(movable(match) && !saving)} disabled={saving || !movable(match)}
        onDragStart={(event) => { event.dataTransfer.setData('text/plain', match.id); event.dataTransfer.effectAllowed = 'move'; setSelected(match.id); }}
        onClick={() => setSelected(match.id)} aria-pressed={selected === match.id} style={blockStyle}
        className={`block overflow-y-auto rounded-lg border p-3 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${blockStyle ? 'absolute' : 'w-full'} ${selected === match.id ? 'border-sky-300 bg-[#17384a]' : changes[match.id] ? 'border-amber-300 bg-[#362f18]' : movable(match) ? 'border-sky-300/30 bg-[#102333]' : 'border-white/15 bg-[#202328]'} ${movable(match) ? 'cursor-grab active:cursor-grabbing' : ''}`}>
        <span className="block font-bold text-white">{label(match)}</span>
        <span className="mt-2 block text-gray-300">{match.round_label} · Match {match.bracket_position}</span>
        {match.scheduled_start && <span className="mt-1 block font-bold text-sky-200">{scheduleTime(match.scheduled_start)} · {match.court_name || 'Court TBD'}</span>}
        <span className="mt-1 block text-[10px] uppercase text-gray-400">{changes[match.id] ? 'Unsaved change' : movable(match) ? 'Drag or select to move' : 'Reserved · read-only'}</span>
    </button>;

    return <details className="mb-5 rounded-xl border border-sky-300/25 bg-sky-300/[0.04]">
        <summary className="cursor-pointer px-4 py-4 font-bold text-white">Scheduling board · drag matches onto a court and time</summary>
        <div className="space-y-4 border-t border-white/10 p-4">
            <p className="text-sm text-gray-400">Move whole matches, not teams. Changes stay here until you save. Save or discard before switching divisions. All times are SAST (UTC+2).</p>
            {loading && <p role="status" className="text-sky-200">Loading event bookings…</p>}
            {loadError && <p role="alert" className="text-red-300">{loadError}</p>}
            {!day && <p className="text-amber-200">Configure active play days and courts above before scheduling.</p>}
            {!loading && !loadError && day && <>
                <fieldset disabled={saving} className="flex flex-wrap gap-3">
                    <label className="text-xs text-gray-300">Play day <select className={inputClass} value={day.play_date} onChange={(event) => setDate(event.target.value)}>{days.map((item) => <option key={item.play_date} value={item.play_date}>{item.play_date}</option>)}</select></label>
                    <label className="text-xs text-gray-300">Grid <select className={inputClass} value={step} onChange={(event) => setStep(Number(event.target.value))}><option value={15}>15 minutes</option><option value={30}>30 minutes</option></select></label>
                    <span className="self-center text-xs text-gray-400">{day.match_duration_minutes} min matches · {day.minimum_break_minutes} min rest</span>
                </fieldset>
                <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                    <aside><h3 className="mb-2 font-bold text-white">Unscheduled matches</h3><div className="max-h-96 space-y-2 overflow-y-auto">{ready.filter((match) => !match.court_name || !match.scheduled_start).map((match) => card(match))}{!ready.some((match) => !match.court_name || !match.scheduled_start) && <p className="text-sm text-gray-400">All ready matches are assigned.</p>}</div></aside>
                    <div className="min-w-0">
                        <label className="mb-3 block text-xs text-gray-300">Select a match, then click a time slot (also works on mobile)
                            <select disabled={saving} value={selected} onChange={(event) => setSelected(event.target.value)} className={`${inputClass} mt-2 w-full`}><option value="">Choose a match…</option>{ready.map((match) => <option key={match.id} value={match.id}>{label(match)}</option>)}</select>
                        </label>
                        <div className="overflow-auto rounded-xl border border-white/15" tabIndex={0} aria-label="Scheduling timeline; scroll sideways for later times">
                            <div style={{ width: 100 + slots.length * 180 }}>
                                <div className="flex bg-[#101820] text-xs font-bold text-sky-200"><div className="sticky left-0 z-20 w-[100px] shrink-0 bg-[#101820] p-3">Court / time</div>{slots.map((slot) => <div key={slot} className="w-[180px] shrink-0 border-l border-white/10 p-3">{scheduleTime(slot)}</div>)}</div>
                                {courts.map((court) => {
                                    const ends = [];
                                    const blocks = merged.filter((match) => match.status !== 'cancelled' && match.court_name === court && match.scheduled_start && scheduleDay(match.scheduled_start) === day.play_date).sort((a, b) => Date.parse(a.scheduled_start) - Date.parse(b.scheduled_start)).map((match) => {
                                        const time = Date.parse(match.scheduled_start);
                                        const end = Date.parse(match.scheduled_end) || time + Number(day.match_duration_minutes) * 60_000;
                                        let lane = ends.findIndex((value) => value <= time);
                                        if (lane < 0) lane = ends.length;
                                        ends[lane] = end;
                                        return { match, time, end, lane };
                                    });
                                    return <div className="flex border-t border-white/10" key={court}>
                                        <div className="sticky left-0 z-20 w-[100px] shrink-0 bg-[#101820] p-3 text-sm font-bold text-white">{court}</div>
                                        <div className="relative flex" style={{ height: Math.max(1, ends.length) * 170 + 44 }}>
                                            {slots.map((slot) => <button type="button" key={slot} disabled={saving} aria-label={`Assign selected match to ${court} on ${day.play_date} at ${scheduleTime(slot)}`} onClick={() => assign(selected, court, scheduleTime(slot))}
                                                onDragOver={(event) => { if (!saving) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); assign(event.dataTransfer.getData('text/plain'), court, scheduleTime(slot)); }}
                                                className="w-[180px] shrink-0 border-l border-white/10 bg-black/20 pb-2 text-xs text-gray-500 hover:bg-sky-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"><span className="absolute bottom-3">{selected ? '+ Place here' : 'Select a match'}</span></button>)}
                                            {blocks.map(({ match, time, end, lane }) => card(match, { top: lane * 170 + 4, left: Math.max(0, (time - start) / (step * 60_000) * 180) + 3, width: Math.max(80, (end - time) / (step * 60_000) * 180 - 6), height: 162 }))}
                                        </div>
                                    </div>;
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                {!!errors.length && <ul role="alert" className="space-y-1 rounded-lg border border-red-300/30 bg-red-300/5 p-3 text-sm text-red-200">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
                <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                    <button type="button" onClick={save} disabled={!count || saving || errors.length > 0} className="rounded-lg bg-sky-300 px-4 py-3 text-sm font-black text-black disabled:opacity-40">{saving ? 'Saving…' : `Save schedule (${count})`}</button>
                    <button type="button" disabled={saving} onClick={() => { setChanges({}); setSelected(''); setNotice('Preview discarded.'); setRefresh((value) => value + 1); }} className="rounded-lg border border-white/20 px-4 py-3 text-sm text-gray-300">Discard / reload</button>
                    <p className="text-xs text-gray-400">Saving updates the connected database, including live if shared with localhost.</p>
                </div>
            </>}
            <p role="status" className="text-sm text-sky-200">{notice}</p>
        </div>
    </details>;
}
