import React from 'react';
import { ArrowRight, Check, ChevronLeft } from 'lucide-react';
import { divisionColorMap } from '../../utils/divisionColors';
import { drawWorkflowSteps } from '../../utils/drawWorkflow';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300';

export function DrawDivisionNavigation({ divisions, progress, divisionId, onSelect, onOverview, loading }) {
    const colors = divisionColorMap(divisions);
    return <aside aria-label="Tournament divisions" className="draw-workflow-sidebar min-w-0">
        <button type="button" onClick={onOverview} className={`mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-gray-300 hover:text-white ${focus}`}><ChevronLeft size={16} /> All divisions</button>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">Divisions</p>
        <div className="draw-division-list">{divisions.map(division => {
            const state = progress.get(division.id);
            const color = colors.get(division.id)?.color || '#cbd5e1';
            const selected = division.id === divisionId;
            return <button key={division.id} type="button" disabled={loading} aria-current={selected ? 'true' : undefined} onClick={() => onSelect(division.id)} style={{ borderLeftColor: color }} className={`draw-division-button rounded-lg border border-l-[3px] p-3 text-left ${focus} ${selected ? 'border-white/25 bg-white/[0.07]' : 'border-transparent hover:bg-white/[0.04]'} disabled:opacity-50`}>
                <span className="flex items-center justify-between gap-2 font-semibold text-white">{division.name}{state?.complete && <Check size={15} className="text-padel-green" />}</span>
                <span className="mt-1.5 block text-xs" style={{ color }}>{state?.label || 'Loading…'}</span>
                <span aria-hidden="true" className="mt-3 flex gap-1">{state?.steps.map(step => <span key={step.key} className="h-1 flex-1 rounded-full" style={{ backgroundColor: step.complete ? color : '#34383b' }} />)}</span>
            </button>;
        })}</div>
    </aside>;
}

export function DrawWorkflowOverview({ divisions, progress, days, loading, error, onSelect, onEditPlayDays }) {
    const colors = divisionColorMap(divisions);
    const activeDays = days.filter(day => day.is_active);
    const complete = [...progress.values()].filter(state => state.complete).length;
    const nextDivision = divisions.find(division => !progress.get(division.id)?.complete);
    return <section aria-label="Tournament progress" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-bold text-white">Your tournament at a glance</h2><p className="mt-2 text-sm text-gray-400">{loading ? 'Loading saved progress…' : `${complete} of ${divisions.length} divisions complete. Choose a division to continue where you left off.`}</p></div>{!loading && nextDivision && <button type="button" onClick={() => onSelect(nextDivision.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-padel-green px-5 py-3 text-sm font-bold text-black ${focus}`}>Continue {nextDivision.name} <ArrowRight size={16} /></button>}</div>
        {error ? <p role="alert" className="rounded-lg border border-amber-300/30 p-4 text-sm text-amber-200">Could not load progress: {error}</p> : <div className="overflow-hidden rounded-xl border border-white/15">
            <div className="draw-overview-labels border-b border-white/10 bg-white/[0.03] px-5 py-3 text-xs text-gray-400"><span>Division</span>{drawWorkflowSteps.map(step => <span key={step.key}>{step.title}</span>)}<span>What next?</span></div>
            {divisions.map(division => {
                const state = progress.get(division.id);
                const color = colors.get(division.id)?.color || '#cbd5e1';
                return <button key={division.id} type="button" disabled={loading} onClick={() => onSelect(division.id)} className={`draw-overview-row group w-full border-b border-white/10 px-5 py-5 text-left last:border-0 hover:bg-white/[0.04] ${focus}`}>
                    <span><strong className="flex items-center gap-2 text-white"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{division.name}</strong><span className="mt-1 block pl-[18px] text-xs text-gray-400">{state?.teamCount ? `${state.teamCount} ${state.entryUnit}` : state?.main ? 'Draw saved' : 'No draw saved'}{state && ` · ${state.steps.filter(step=>step.complete).length}/4 stages`}</span></span>
                    {state?.steps.map((step, i) => <span key={step.key} title={step.detail} className="draw-overview-check items-center gap-2 text-xs text-gray-400"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step.complete ? 'bg-padel-green/15 text-padel-green' : 'border border-white/20 text-gray-500'}`}>{step.complete ? <Check size={13} /> : i + 1}</span><span className="sr-only">{step.title}: {step.complete ? 'complete' : step.detail}</span></span>)}
                    <span className="draw-overview-next flex items-center justify-between gap-2 text-sm font-semibold" style={{ color }}>{loading ? 'Loading…' : state?.complete ? 'View results' : state?.label}<ArrowRight size={16} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" /></span>
                </button>;
            })}
            {!divisions.length && <p className="p-5 text-sm text-gray-400">Add divisions to this event to begin setting up draws.</p>}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-5"><div><h3 className="text-sm font-semibold text-white">Play days & courts</h3><p className="mt-1 text-sm text-gray-400">{activeDays.length ? activeDays.map(day => `${new Date(`${day.play_date}T12:00:00`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} · ${day.start_time.slice(0, 5)}–${day.end_time.slice(0, 5)} · ${day.courts_count} courts`).join(' / ') : 'Set availability before scheduling matches.'}</p></div><button type="button" onClick={onEditPlayDays} className={`min-h-11 rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-200 ${focus}`}>Edit availability</button></div>
        <p className="text-xs leading-5 text-gray-500">Each division follows the same four stages. You can revisit completed stages to view a draw, print seedings or correct a score.</p>
    </section>;
}
