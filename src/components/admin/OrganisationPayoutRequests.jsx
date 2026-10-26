import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, ShieldCheck } from 'lucide-react';
import { organisationBanking } from '../../utils/organisationBanking';
import { supabase } from '../../supabaseClient';
import BankingVerification from './BankingVerification';

const money = n => `R ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
export default function OrganisationPayoutRequests({ organisationId, eventId, refreshKey = 0, onProcessed }) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [action, setAction] = useState(null);
    const [revealed, setRevealed] = useState(null);
    const operationEpoch = useRef(0);
    const load = useCallback(async () => {
        try { setResult(await organisationBanking('list', organisationId, eventId ? { event_id: eventId } : {})); setError(''); }
        catch (e) { setError(e.message); }
    }, [organisationId, eventId]);
    useEffect(() => {
        operationEpoch.current += 1;
        setResult(null); setRevealed(null); setAction(null); load();
        return () => { operationEpoch.current += 1; };
    }, [load, refreshKey]);
    useEffect(() => {
        const clear = () => { operationEpoch.current += 1; setRevealed(null); setAction(null); };
        const hidden = () => { if (document.hidden) { operationEpoch.current += 1; setRevealed(null); } };
        document.addEventListener('visibilitychange', hidden);
        const { data: { subscription } } = supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') clear(); });
        return () => { document.removeEventListener('visibilitychange', hidden); subscription.unsubscribe(); };
    }, []);
    useEffect(() => {
        if (!revealed) return;
        const timeout = setTimeout(() => setRevealed(null), 60000);
        return () => clearTimeout(timeout);
    }, [revealed]);
    const complete = async () => {
        const epoch = operationEpoch.current;
        try {
            const data = await organisationBanking(action.type, organisationId, { request_id: action.id, status: action.status });
            if (epoch !== operationEpoch.current || document.hidden) return;
            setRevealed(action.type === 'reveal' ? { id: action.id, details: data } : null);
            setAction(null);
            if (action.type === 'resolve') { onProcessed?.(data); await load(); }
        } catch (e) { if (epoch === operationEpoch.current) { setError(e.message); setAction(null); } }
    };
    if (!organisationId) return null;
    return <section className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
        <div><h3 className="text-sm font-bold text-white flex items-center gap-2"><ShieldCheck size={17} className="text-padel-green" />Payout requests</h3>
            <p className="text-xs text-gray-400 mt-1">4M processes payments manually. Saved requests retain the account confirmed when they were submitted.</p></div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {!result ? <button type="button" onClick={load} className="text-sm text-padel-green min-h-10">{error ? 'Retry loading requests' : 'Loading requests…'}</button> : !result.requests.length ? <p className="text-sm text-gray-500">No payout requests yet.</p> : result.requests.map(request => <div key={request.id} className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-2 text-sm"><div><p className="font-semibold text-white">{request.event_name}</p><p className="text-xs text-gray-400 mt-1">{new Date(request.created_at).toLocaleDateString('en-ZA')} · Account ending {request.last_four}</p></div><p className="text-white font-semibold">{money(request.amount)} <span className="text-xs text-gray-400 capitalize">· {request.status}</span></p></div>
            {request.account_changed && request.status === 'pending' && <p className="text-xs text-amber-300">The saved account has changed or was removed. This request still uses its original banking details. Confirm with the organisation before paying, or cancel and request again.</p>}
            {result.can_process && request.status === 'pending' && <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => { operationEpoch.current += 1; setRevealed(null); setError(''); setAction({ id: request.id, type: 'reveal', purpose: 'view banking for this manual payment' }); }} className="min-h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-padel-green inline-flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-padel-green"><Eye size={14} />View banking securely</button>
                <button type="button" onClick={() => { operationEpoch.current += 1; setRevealed(null); setError(''); setAction({ id: request.id, type: 'resolve', status: 'paid', purpose: 'record this completed manual payment in event finances' }); }} className="min-h-10 text-xs text-white focus-visible:outline-2 focus-visible:outline-padel-green">Mark as paid manually</button>
                <button type="button" onClick={() => { operationEpoch.current += 1; setRevealed(null); setError(''); setAction({ id: request.id, type: 'resolve', status: 'cancelled', purpose: 'cancel this payout request' }); }} className="min-h-10 text-xs text-gray-400 focus-visible:outline-2 focus-visible:outline-padel-green">Cancel request</button>
            </div>}
            {action?.id === request.id && action.status === 'paid' && <p className="text-xs text-amber-300">Confirm the bank payment is complete. This adds {money(request.amount)} to the event payout ledger; do not also add it as an interim payment.</p>}
            {action?.id === request.id && <BankingVerification key={`${action.id}-${action.type}-${action.status}`} purpose={action.purpose} onVerified={complete} onCancel={() => { operationEpoch.current += 1; setAction(null); }} />}
            {revealed?.id === request.id && <div className="rounded-xl border border-padel-green/25 p-4 bg-black/40 space-y-2" data-private="true">
                <div className="flex justify-between gap-3"><p className="text-xs text-gray-400">Confidential · hides after 60 seconds</p><button type="button" onClick={() => setRevealed(null)} className="text-xs text-padel-green focus-visible:outline-2 focus-visible:outline-padel-green">Hide now</button></div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">{[['Bank','bank_name'],['Account holder','account_holder'],['Account number','account_number'],['Branch code','branch_code'],['Account type','account_type']].map(([label,key]) => <div key={key}><dt className="text-xs text-gray-500">{label}</dt><dd className="text-white break-all mt-0.5">{revealed.details[key]}</dd></div>)}</dl>
            </div>}
        </div>)}
    </section>;
}
