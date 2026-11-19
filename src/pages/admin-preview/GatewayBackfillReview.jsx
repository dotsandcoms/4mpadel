import { useEffect, useRef, useState } from 'react';
import { recordGatewayBackfill, reviewGatewayBackfill } from './paystackBackfill.js';

const money = amount => new Intl.NumberFormat('en-ZA', { style:'currency', currency:'ZAR' }).format(amount / 100);
const outcomeText = result => result.message || ({
    recorded: 'Receipt recorded in the 4M ledger.',
    already_recorded: 'An existing ledger entry already uses this receipt.',
    held: 'The receipt needs further review.',
    changed: 'Receipt evidence changed. Refresh and review again.',
})[result.state] || 'Receipt is unavailable.';
const reviewText = row => {
    if (row.kind === 'entry') return `Event #${row.eventId}. ${row.entries} existing entries will be marked paid${row.licences ? ` with ${row.licences} licence payments` : ''}.`;
    if (row.kind === 'licence') {
        const label = row.licenceType === 'full' ? `${row.licenceYear} full licence` : `temporary licence for event #${row.eventId}`;
        return `Record the saved ${label} purchase. Current licence issuance rules apply.`;
    }
    return 'Record as unallocated funds. Entry and licence status are unchanged.';
};

export default function GatewayBackfillReview({ client, session, permissions, scopeId, rows, onClose, onRecorded, onBusyChange }) {
    const selection = useRef(rows);
    const request = useRef(null);
    const [results, setResults] = useState(null), [busy, setBusy] = useState(false);
    const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        request.current = controller;
        const load = async () => {
            const reviewed = [];
            for (const row of selection.current) {
                if (controller.signal.aborted) return;
                try { reviewed.push({ row, result:await reviewGatewayBackfill(client,session,permissions,scopeId,row,controller.signal) }); }
                catch (error) { reviewed.push({ row, result:{state:'held',message:error.message} }); }
            }
            if (!controller.signal.aborted) setResults(reviewed);
        };
        void load();
        return () => controller.abort();
    }, [client, session, permissions, scopeId]);

    const ready = results?.filter(({ result }) => result.state === 'review') || [];
    async function record() {
        const controller = request.current;
        if (!controller || controller.signal.aborted || busy || !ready.length || !reason.trim() || confirmed) return;
        setBusy(true); onBusyChange?.(true);
        const completed = [];
        for (const { row, result } of results) {
            if (controller.signal.aborted) break;
            if (result.state !== 'review') { completed.push({ row,result }); continue; }
            try { completed.push({ row,result:await recordGatewayBackfill(client,session,permissions,scopeId,row,result,reason,controller.signal) }); }
            catch (error) { completed.push({ row,result:{state:'held',message:error.message} }); }
        }
        if (!controller.signal.aborted) { setResults(completed); setConfirmed(true); setBusy(false); }
        onBusyChange?.(false);
    }
    return <section className="ap-section" style={{ padding:18 }} aria-label="Review missing Paystack receipts">
        <h2>{confirmed ? 'Receipt recording results' : 'Review missing Paystack receipts'}</h2>
        {!results ? <p role="status">Verifying the selected receipts with Paystack…</p> : <>
            <ul>{results.map(({ row, result }) => <li key={row.reference}><strong>{row.reference}</strong> · {
                result.state === 'review' ? `${money(result.amountMinor)} · ${result.payer}. ${reviewText(result)}` : outcomeText(result)
            }</li>)}</ul>
            {ready.length > 0 && <label className="lw-field"><span>Reason for recording these receipts</span>
                <textarea rows={3} maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)}/></label>}
        </>}
        <div className="fo-report-actions">
            {!!ready.length && <button type="button" className="ap-primary" disabled={busy || !reason.trim()} onClick={record}>
                {busy ? 'Recording receipts…' : 'Confirm receipt recording'}</button>}
            <button type="button" className="ap-secondary" disabled={busy} onClick={confirmed ? onRecorded : onClose}>
                {confirmed ? 'Close and refresh gateway' : 'Cancel receipt review'}</button>
        </div>
    </section>;
}
