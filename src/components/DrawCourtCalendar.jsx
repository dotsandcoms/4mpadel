import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const zone = 'Africa/Johannesburg';
const parts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(date).map(({ type, value }) => [type, value]));
const timeLabel = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export default function DrawCourtCalendar({ matches, teamName, matchHref, children }) {
    const [view, setView] = useState('calendar');
    const [selectedDay, setSelectedDay] = useState('');
    const scheduled = matches.filter((match) => match.court_name && match.scheduled_start && Number.isFinite(Date.parse(match.scheduled_start))).map((match) => {
        const start = new Date(match.scheduled_start);
        const p = parts(start);
        const minute = Number(p.hour) * 60 + Number(p.minute);
        const duration = (Date.parse(match.scheduled_end) - start.getTime()) / 60_000;
        return { ...match, day: `${p.year}-${p.month}-${p.day}`, minute, end: Math.min(1440, minute + (duration > 0 ? duration : 30)), estimated: !(duration > 0) };
    });
    const days = [...new Set(scheduled.map((match) => match.day))].sort();
    const day = days.includes(selectedDay) ? selectedDay : days[0];
    const dayMatches = scheduled.filter((match) => match.day === day);
    const courts = [...new Set(dayMatches.map((match) => match.court_name))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const first = Math.floor(Math.min(...dayMatches.map((match) => match.minute), 1440) / 30) * 30;
    const last = Math.ceil(Math.max(...dayMatches.map((match) => match.end), first + 30) / 30) * 30;
    const slots = Array.from({ length: (last - first) / 30 }, (_, index) => first + index * 30);
    const width = slots.length * 240;
    const missing = matches.filter((match) => !match.court_name || !match.scheduled_start || !Number.isFinite(Date.parse(match.scheduled_start))).length;

    return <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-white/15 bg-[#08101f] p-1" aria-label="Schedule view">
                {['calendar', 'list'].map((value) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`min-h-11 rounded-lg px-4 text-sm font-bold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${view === value ? 'bg-sky-300 text-black' : 'text-gray-300 hover:bg-white/10'}`}>{value}</button>)}
            </div>
            <p className="text-xs text-gray-400">South African time · SAST (UTC+2)</p>
        </div>
        {view === 'list' ? children : <>
            <nav aria-label="Schedule day" className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {days.map((value) => <button key={value} type="button" aria-pressed={day === value} onClick={() => setSelectedDay(value)} className={`min-h-11 shrink-0 rounded-xl border px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${day === value ? 'border-sky-300 bg-sky-300/10 text-sky-200' : 'border-white/15 text-gray-400 hover:text-white'}`}>{new Date(`${value}T12:00:00+02:00`).toLocaleDateString('en-ZA', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' })}</button>)}
            </nav>
            {dayMatches.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-gray-400">Matches appear in the calendar once both a court and start time are assigned.</p> : <div tabIndex={0} aria-label="Court timeline. Scroll horizontally to see later matches." className="overflow-x-auto rounded-2xl border border-white/15 bg-[#08101f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
                <div style={{ width: width + 112 }}>
                    <div className="flex border-b border-white/15 text-xs font-bold text-sky-200"><div className="sticky left-0 z-20 w-28 shrink-0 bg-[#08101f] p-4">Court / time</div>{slots.map((minute) => <div key={minute} className="w-60 shrink-0 border-l border-white/10 p-4 tabular-nums">{timeLabel(minute)}</div>)}</div>
                    {courts.map((court) => {
                        const laneEnds = [];
                        const blocks = dayMatches.filter((match) => match.court_name === court).sort((a, b) => a.minute - b.minute).map((match) => {
                            let lane = laneEnds.findIndex((end) => end <= match.minute);
                            if (lane < 0) lane = laneEnds.length;
                            laneEnds[lane] = match.end;
                            return { ...match, lane };
                        });
                        return <div key={court} className="flex border-b border-white/10 last:border-b-0">
                            <h3 className="sticky left-0 z-10 w-28 shrink-0 bg-[#0c1628] p-4 text-sm font-bold text-white">{court}</h3>
                            <div className="relative" style={{ width, height: laneEnds.length * 180 + 8, backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '240px 100%' }}>
                                {blocks.map((match) => <Link key={match.id} to={matchHref(match)} className={`absolute overflow-y-auto rounded-xl border p-3 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${match.status === 'in_progress' ? 'border-pink-300 bg-[#4b2040]' : 'border-emerald-400/40 bg-[#123a32] hover:bg-[#194a40]'}`} style={{ left: (match.minute - first) * 8 + 3, width: Math.max(1, (match.end - match.minute) * 8 - 6), top: match.lane * 180 + 4, height: 172 }}>
                                    <p className="font-black tabular-nums text-emerald-200">{timeLabel(match.minute)}–{timeLabel(match.end)}{match.estimated ? '*' : ''}</p>
                                    <p className="mt-2 font-bold leading-5">{teamName(match.entry_one_id)}</p><p className="my-1 text-[10px] uppercase text-emerald-200/70">vs</p><p className="font-bold leading-5">{teamName(match.entry_two_id)}</p>
                                    <p className="mt-2 text-[10px] text-emerald-100/80">{match.round_label} · {match.status === 'in_progress' ? 'LIVE' : ['completed', 'walkover', 'retired'].includes(match.status) ? 'Finished' : 'Scheduled'}</p>
                                </Link>)}
                            </div>
                        </div>;
                    })}
                </div>
            </div>}
            <p className="mt-3 text-xs leading-5 text-gray-400">Scroll sideways for later times. Select a match to view details. Overlapping bookings are stacked.{scheduled.some((match) => match.estimated) ? ' * End time estimated at 30 minutes where no end is saved.' : ''}{missing > 0 ? ` ${missing} matches still need a court or time.` : ''}</p>
        </>}
    </div>;
}
