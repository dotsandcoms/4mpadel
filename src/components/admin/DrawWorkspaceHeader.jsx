import React from 'react';

const steps = [
    ['players', 'Players', 'Checks & seedings'],
    ['setup', 'Draw', 'Format & back draws'],
    ['schedule', 'Schedule', 'Courts & times'],
    ['run', 'Results', 'Scores & outcomes'],
];
export default function DrawWorkspaceHeader({ division, savedDraw, workspace, onWorkspace, ready, loading, children }) {
    return <header className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-padel-green">Tournament workspace</p><h1 className="text-2xl font-bold text-white sm:text-3xl">Draw manager</h1><p className="mt-2 text-sm text-gray-400">Set up each division, review the draw, then take it onto court.</p></div><span role="status" className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold capitalize text-gray-300">{loading ? 'Loading draw…' : savedDraw?.status?.replace('_', ' ') || 'Not saved'}</span></div>
        <div className="rounded-2xl border border-padel-green/50 bg-padel-green/10 p-5 sm:p-6"><p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-padel-green">{division ? 'Current division' : 'Start here · choose your division'}</p><div className="max-w-3xl">{children}</div><p className="mt-3 text-sm text-gray-300">{division ? 'Switch divisions here to set up or manage another draw.' : 'Choose which division you want to set up. Its players and draw options will appear below.'}</p></div>
        <nav aria-label="Draw workflow" className="grid grid-cols-2 gap-2 border-b border-white/10 pb-5 md:grid-cols-4">{steps.map(([key, title, subtitle], i) => {
            const disabled = loading || (key !== 'players' && !division);
            return <button key={key} type="button" disabled={disabled} title={disabled ? (loading ? 'Loading the draw' : !division ? 'Choose a division first' : key === 'review' ? 'Generate a preview in Setup first' : 'Publish the draw from its preview first') : subtitle} onClick={() => onWorkspace(key === 'setup' && ready ? 'review' : key)} aria-current={(workspace === key || key === 'setup' && workspace === 'review') ? 'step' : undefined} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-padel-green disabled:opacity-35 ${(workspace === key || key === 'setup' && workspace === 'review') ? 'border-padel-green bg-padel-green/5 text-white' : 'border-transparent text-gray-400 hover:bg-white/5'}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${(workspace === key || key === 'setup' && workspace === 'review') ? 'bg-padel-green text-black' : 'border border-white/20'}`}>{i + 1}</span><span><strong className="block text-sm">{title}</strong><span className="mt-1 hidden text-xs text-gray-400 sm:block">{subtitle}</span></span></button>;
        })}</nav>

    </header>;
}
