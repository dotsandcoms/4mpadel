/* eslint-disable react-refresh/only-export-components -- isolated iframe entry */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from 'sonner';
import NativeDrawManager from '../../src/components/admin/NativeDrawManager';
import { buildPlayersByEmailMap } from '../../src/utils/playerLookup';
import { initialiseRehearsal } from './client';
import '../../src/index.css';

function Workspace({ snapshot }) {
    const [divisions, setDivisions] = useState(() => snapshot.tables?.tournament_divisions || snapshot.divisions);
    const players = buildPlayersByEmailMap(snapshot.players);
    return <main className="mx-auto max-w-[1600px] p-3 text-white sm:p-6">
        <p className="mb-4 text-xs leading-5 text-gray-400">Snapshot taken {new Date(snapshot.copied_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST. Publishing and points awards apply only to this rehearsal. Live RankedIn refresh and public links are disabled.</p>
        <NativeDrawManager event={snapshot.event} divisions={divisions} registrations={snapshot.registrations} playersByEmail={players}
            privateRehearsal
            onDivisionRankingSourceChange={(id, source) => setDivisions(current => current.map(division => division.id === id ? { ...division, seeding_ranking_source: source } : division))} />
        <Toaster />
    </main>;
}

let started = false;
const ready = () => window.parent.postMessage({ type: '4m-rehearsal-ready' }, '*');
const timer = setInterval(ready, 500);
window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== '4m-rehearsal-init' || started) return;
    const snapshot = event.data.snapshot;
    try {
        initialiseRehearsal(snapshot, next => window.parent.postMessage({ type: '4m-rehearsal-save', snapshot: next }, '*'));
        started = true; clearInterval(timer);
        document.getElementById('root').removeAttribute('role');
        createRoot(document.getElementById('root')).render(<Workspace snapshot={snapshot} />);
    } catch { document.getElementById('root').textContent = 'The rehearsal could not open. Leave rehearsal and try again.'; }
});
// Existing public-view anchors must never leave the isolated workspace.
document.addEventListener('click', event => {
    if (!event.target.closest?.('a')) return;
    event.preventDefault(); event.stopPropagation();
    toast.message('Public links are disabled in private rehearsal. Use the Draw preview here.');
}, true);
ready();
