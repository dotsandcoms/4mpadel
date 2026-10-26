import React from 'react';
import { Check } from 'lucide-react';
import { drawWorkflowSteps } from '../../utils/drawWorkflow';

export default function DrawWorkspaceHeader({ division, savedDraw, workspace, onWorkspace, ready, loading, progress }) {
    const current = workspace === 'review' ? 'setup' : workspace;
    const index = drawWorkflowSteps.findIndex(step => step.key === current);
    return <header className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-gray-400">{division?.name}</p><h2 className="mt-1 text-2xl font-bold text-white">{drawWorkflowSteps[index]?.title}</h2><p className="mt-2 text-sm text-gray-400">{savedDraw?.status === 'completed' ? current === 'setup' ? 'Review the final bracket and match scores.' : current === 'players' ? 'View the confirmed entrants and print player or seed lists.' : drawWorkflowSteps[index]?.description : drawWorkflowSteps[index]?.description}</p></div><span role="status" className="rounded-full border border-white/15 px-3 py-1.5 text-xs capitalize text-gray-300">{loading ? 'Loading…' : savedDraw?.status?.replace('_', ' ') || 'Not started'}</span></div>
        <nav aria-label="Draw workflow" className="draw-stepper gap-2 border-b border-white/10 pb-5">{drawWorkflowSteps.map((step, i) => {
            const disabled = loading || !division || (i > 1 && !ready) || (i === 1 && !progress?.steps[0].complete && !ready);
            const selected = step.key === current;
            return <button key={step.key} type="button" disabled={disabled} onClick={() => onWorkspace(step.key === 'setup' && ready ? 'review' : step.key)} aria-current={selected ? 'step' : undefined} className={`flex min-h-14 items-center gap-2 rounded-lg border px-3 py-3 text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-35 ${selected ? 'border-padel-green/70 bg-padel-green/5 text-white' : 'border-transparent text-gray-400 hover:bg-white/5'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-padel-green text-black' : progress?.steps[i].complete ? 'bg-white/10 text-padel-green' : 'border border-white/20'}`}>{!selected && progress?.steps[i].complete ? <Check size={13} /> : i + 1}</span>{step.title}</button>;
        })}</nav>
    </header>;
}
