import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { divisionColorMap } from '../utils/divisionColors';

const zone = 'Africa/Johannesburg';
const parts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(date).map(({ type, value }) => [type, value]));
const timeLabel = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export default function DrawCourtCalendar({ matches, teamName, matchHref, children, divisions = [], sideName }) {
    const [divisionFilter,setDivisionFilter]=useState('all');
    const styles=divisionColorMap(divisions);
    const division=m=>styles.get(m.division_id)||{name:'',color:'#7dd3fc'};
    const filtered=matches.filter(m=>divisionFilter==='all'||m.division_id===divisionFilter);
    const name=(m,slot)=>sideName?sideName(m,slot):teamName(m[slot===1?'entry_one_id':'entry_two_id']);
    const tint=m=>({borderColor:division(m).color,backgroundColor:`color-mix(in srgb, ${division(m).color} 22%, #08101f)`});
    const [view, setView] = useState('calendar');
    const [selectedDay, setSelectedDay] = useState('all');
    const scheduled = filtered.filter((match) => match.court_name && match.scheduled_start && Number.isFinite(Date.parse(match.scheduled_start))).map((match) => {
        const start = new Date(match.scheduled_start);
        const p = parts(start);
        const minute = Number(p.hour) * 60 + Number(p.minute);
        const duration = (Date.parse(match.scheduled_end) - start.getTime()) / 60_000;
        return { ...match, day: `${p.year}-${p.month}-${p.day}`, minute, end: Math.min(1440, minute + (duration > 0 ? duration : 30)), estimated: !(duration > 0) };
    });
    const days = [...new Set(scheduled.map((match) => match.day))].sort();
    const visibleDays = selectedDay === 'all' ? days : [days.includes(selectedDay) ? selectedDay : days[0]].filter(Boolean);
    const first = Math.floor(Math.min(...scheduled.map(m=>m.minute), 1440)/30)*30;
    const last = Math.ceil(Math.max(...scheduled.map(m=>m.end), first+30)/30)*30;
    const slots = Array.from({length:(last-first)/30},(_,i)=>first+i*30);
    const scale = 1.5;
    const missing = filtered.filter((match) => !match.court_name || !match.scheduled_start || !Number.isFinite(Date.parse(match.scheduled_start))).length;

    return <div>
        {!!divisions.length && <div aria-label="Filter schedule by division" className="mb-5 flex flex-wrap gap-2">{[{id:'all',name:'All divisions',color:'#ffffff'},...styles.values()].map(d=><button type="button" key={d.id} aria-pressed={divisionFilter===d.id} onClick={()=>setDivisionFilter(d.id)} style={{borderColor:d.color,backgroundColor:divisionFilter===d.id?`color-mix(in srgb, ${d.color} 20%, #08101f)`:'#08101f'}} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><span aria-hidden="true" className="h-3 w-3 rounded-full" style={{backgroundColor:d.color}}/>{d.name}{divisionFilter===d.id?' ✓':''}</button>)}</div>}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-white/15 bg-[#08101f] p-1" aria-label="Schedule view">
                {['calendar', 'list'].map((value) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`min-h-11 rounded-lg px-4 text-sm font-bold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${view === value ? 'bg-sky-300 text-black' : 'text-gray-300 hover:bg-white/10'}`}>{value}</button>)}
            </div>
            <p className="text-xs text-gray-400">South African time · SAST (UTC+2)</p>
        </div>
        {view === 'list' ? (children || <div className="grid gap-3 md:grid-cols-2">{[...filtered].sort((a,b)=>(Date.parse(a.scheduled_start)||Infinity)-(Date.parse(b.scheduled_start)||Infinity)).map(m=><Link key={m.id} to={matchHref(m)} style={tint(m)} className="rounded-xl border-l-4 p-4 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><p className="text-xs font-bold" style={{color:division(m).color}}>{division(m).name} · {m.round_label}</p><p className="my-2 font-bold">{name(m,1)} vs {name(m,2)}</p><p className="text-xs text-gray-300">{m.scheduled_start?new Date(m.scheduled_start).toLocaleString('en-ZA',{timeZone:zone,weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Time to be confirmed'} · {m.court_name||'Court to be confirmed'} · {m.status.replaceAll('_',' ')}</p></Link>)}{!filtered.length&&<p className="text-gray-400">No matches in this division yet.</p>}</div>) : <>
            <nav aria-label="Schedule day" className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {['all',...days].map((value) => <button key={value} type="button" aria-pressed={selectedDay === value} onClick={() => setSelectedDay(value)} className={`min-h-11 shrink-0 rounded-xl border px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${selectedDay === value ? 'border-sky-300 bg-sky-300/10 text-sky-200' : 'border-white/15 text-gray-400 hover:text-white'}`}>{value==='all'?'All days':new Date(`${value}T12:00:00+02:00`).toLocaleDateString('en-ZA', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' })}</button>)}
            </nav>
            {!scheduled.length ? <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-gray-400">Matches appear here once a court and time are assigned.</p> : <div tabIndex={0} aria-label="Tournament calendar. Scroll across for days and down for times." className="max-h-[75vh] overflow-auto rounded-xl border border-white/20 bg-[#0d151b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
                <div className="flex w-max items-start">{visibleDays.map(day=>{
                    const dayMatches=scheduled.filter(m=>m.day===day);
                    const courts=[...new Set(dayMatches.map(m=>m.court_name))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
                    return <section key={day} style={{width:64+Math.max(1,courts.length)*180}} className="shrink-0 border-r-4 border-sky-300/25">
                        <header className="sticky top-0 z-30 bg-[#083047] px-4 py-3 text-sm font-bold text-sky-100">{new Date(`${day}T12:00:00+02:00`).toLocaleDateString('en-ZA',{timeZone:zone,weekday:'long',day:'numeric',month:'short'})}<span className="ml-3 text-xs font-normal">{courts.length} courts</span></header>
                        <div className="sticky top-11 z-20 grid bg-[#101c24] text-xs font-bold text-sky-200" style={{gridTemplateColumns:`64px repeat(${courts.length},180px)`}}><span className="px-2 py-3">SAST</span>{courts.map(c=><span key={c} className="border-l border-white/10 px-3 py-3">{c}</span>)}</div>
                        <div className="flex"><div className="w-16 shrink-0 bg-[#101c24]">{slots.map(t=><div key={t} style={{height:30*scale}} className="border-t border-white/10 px-2 text-xs tabular-nums text-gray-300">{timeLabel(t)}</div>)}</div>
                        {courts.map(court=>{
                            const rows=dayMatches.filter(m=>m.court_name===court).sort((a,b)=>a.minute-b.minute);
                            const ends=[];const blocks=rows.map(m=>{let lane=ends.findIndex(end=>end<=m.minute);if(lane<0)lane=ends.length;ends[lane]=m.end;return {...m,lane};});
                            return <div key={court} className="relative w-[180px] shrink-0 border-l border-white/10" style={{height:(last-first)*scale,backgroundImage:'linear-gradient(to bottom, rgba(255,255,255,.08) 1px, transparent 1px)',backgroundSize:`100% ${30*scale}px`}}>{blocks.map(m=><Link key={m.id} to={matchHref(m)} title={`${division(m).name} · ${name(m,1)} vs ${name(m,2)} · ${m.round_label} · ${timeLabel(m.minute)}–${timeLabel(m.end)}`} aria-label={`${division(m).name} · ${name(m,1)} vs ${name(m,2)} · ${timeLabel(m.minute)}–${timeLabel(m.end)}`} className="absolute overflow-hidden rounded-lg border border-l-4 px-2 py-1 text-xs text-white focus-visible:z-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" style={{...tint(m),top:(m.minute-first)*scale+2,height:Math.max(12,(m.end-m.minute)*scale-4),left:`calc(${m.lane/ends.length*100}% + 2px)`,width:`calc(${100/ends.length}% - 4px)`}}><p className="truncate font-bold" style={{color:division(m).color}}>{division(m).name}</p><p className="truncate font-semibold">{name(m,1)}</p><p className="truncate">vs {name(m,2)}</p><p className="truncate text-[10px] text-sky-100">{timeLabel(m.minute)} · {m.round_label}{m.status==='in_progress'?' · LIVE':''}</p></Link>)}</div>;
                        })}</div>
                    </section>;
                })}</div>
            </div>}
            <p className="mt-3 text-xs leading-5 text-gray-400">Scroll across for more days and down for later times. Select a match for full details. Overlapping bookings appear side by side.{scheduled.some((match) => match.estimated) ? ' * End time estimated at 30 minutes where no end is saved.' : ''}{missing > 0 ? ` ${missing} matches still need a court or time.` : ''}</p>
        </>}
    </div>;
}
