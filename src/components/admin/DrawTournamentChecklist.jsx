import React from 'react';
import { CheckCircle2, Clock3, Circle, ClipboardList, ChevronRight } from 'lucide-react';
import { divisionColorMap } from '../../utils/divisionColors';
const styles = {complete:'text-padel-green',progress:'text-amber-300',pending:'text-gray-400'};
const titles = {complete:'Complete',progress:'In progress',pending:'Not started'};
function Status({status}) { const Icon=status==='complete'?CheckCircle2:status==='progress'?Clock3:Circle;return <span className={`inline-flex items-center gap-2 text-xs ${styles[status]}`}><Icon size={16}/>{titles[status]}</span>; }
function divisionChecklist(division, review, draws, matches) {
    const own=draws.filter(d=>d.division_id===division.id);
    const games=matches.filter(m=>own.some(d=>d.id===m.draw_id)&&!['cancelled','bye'].includes(m.status));
    const booked=games.filter(m=>m.scheduled_start&&m.court_name).length;
    const done=games.filter(m=>['completed','walkover','retired'].includes(m.status)).length;
    return [
        {label:'Players & seeds confirmed',step:'players',status:review?.valid?'complete':review?.confirmed_at?'progress':'pending',detail:review?.valid?'Confirmed':review?.confirmed_at?'Player list changed — review again':'Review players, licences, payments and seeds'},
        {label:'Draw created',step:'setup',status:own.length?'complete':'pending',detail:own.length?`${own.length} saved draw${own.length===1?'':'s'}`:'Generate and save a preview'},
        {label:'Draw published',step:'review',status:own.length&&own.every(d=>d.status!=='draft')?'complete':own.some(d=>d.status!=='draft')?'progress':'pending',detail:own.length?`${own.filter(d=>d.status!=='draft').length} / ${own.length} published`:'Publish after reviewing the draw'},
        {label:'Courts & times assigned',step:'schedule',status:games.length&&booked===games.length?'complete':booked?'progress':'pending',detail:games.length?`${booked} / ${games.length} matches scheduled`:'Create the draw, then plan court times'},
        {label:'Results completed',step:'run',status:own.length&&own.every(d=>d.status==='completed')?'complete':done?'progress':'pending',detail:games.length?`${done} / ${games.length} results recorded`:'Record scores as matches finish'},
    ];
}
export default function DrawTournamentChecklist({divisions,reviews,draws,matches,onSelect,onOpen,compact=false,loading=false,error=''}) {
    const divisionStyles=divisionColorMap(divisions);
    return <section aria-label="Tournament divisions checklist" className="rounded-xl border border-padel-green/25 bg-[#11140e] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><ClipboardList className="shrink-0 text-padel-green" size={23}/><div><h2 className="text-sm font-bold uppercase tracking-wide text-white">Tournament divisions checklist</h2><p className="mt-1 text-xs text-gray-400">Track progress and outstanding steps for every division.</p></div></div>{compact&&<button type="button" onClick={onOpen} className="rounded-lg border border-padel-green/40 px-3 py-2 text-sm font-bold text-padel-green">View checklist →</button>}</div>
        <div className="my-4 flex flex-wrap gap-5">{Object.keys(titles).map(status=><Status key={status} status={status}/>)}</div>
        {error?<p role="alert" className="text-sm text-amber-200">Could not load progress: {error}</p>:loading?<p className="text-sm text-gray-400">Loading saved progress…</p>:<div className={compact?'grid gap-3 md:grid-cols-3':'space-y-4'}>{divisions.map(d=>{
            const steps=divisionChecklist(d,reviews[d.id],draws,matches);const next=steps.find(s=>s.status!=='complete');const completed=steps.filter(s=>s.status==='complete').length;const color=divisionStyles.get(d.id)?.color||'#cbd5e1';
            return <article key={d.id} style={{borderColor:color,backgroundColor:`color-mix(in srgb, ${color} 7%, #090b09)`}} className="relative overflow-hidden rounded-lg border border-l-4 p-4"><span aria-hidden="true" style={{backgroundColor:color}} className="absolute inset-x-0 top-0 h-px opacity-70"/><h3 className="flex items-center gap-2 font-bold text-white"><span aria-hidden="true" style={{backgroundColor:color}} className="h-2.5 w-2.5 rounded-full"/>{d.name}</h3><p className="mt-1 text-xs text-gray-400">{completed} of {steps.length} steps complete</p>{compact?<button type="button" onClick={()=>onSelect(d.id,next?.step||'run')} style={{color}} className="mt-3 flex w-full items-center justify-between gap-2 text-left text-sm font-medium"><span>{next?`Next: ${next.label}`:'View completed results'}</span><ChevronRight size={16}/></button>:steps.map(s=><button type="button" key={s.label} onClick={()=>onSelect(d.id,s.step)} className="mt-3 block w-full border-t border-white/10 pt-3 text-left hover:bg-white/5"><span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-white">{s.label}</span><Status status={s.status}/></span><span className="mt-1 block text-xs text-gray-400">{s.detail}</span></button>)}</article>;
        })}</div>}
    </section>;
}
