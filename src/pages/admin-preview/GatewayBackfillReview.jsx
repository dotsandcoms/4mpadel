import { useEffect, useRef, useState } from 'react';
import { recordGatewayBackfill, reviewGatewayBackfill } from './paystackBackfill.js';

const batchSize = 10;
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

export default function GatewayBackfillReview({ client, session, permissions, scopeId, rows, bulk, onClose, onRecorded, onBusyChange }) {
    const selection = useRef(rows);
    const request = useRef(null);
    const recording = useRef(false);
    const [batch, setBatch] = useState(0), [retry, setRetry] = useState(0);
    const [loaded, setLoaded] = useState(null), [busy, setBusy] = useState(false);
    const [history, setHistory] = useState([]);
    const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
    const [recordingAttempted, setRecordingAttempted] = useState(false);
    const batchCount = Math.ceil(selection.current.length / batchSize);
    const results = loaded?.batch === batch && loaded.retry === retry ? loaded.results : null;

    useEffect(() => {
        const controller = new AbortController();
        request.current = controller;
        const load = async () => {
            const reviewed = [];
            for (const row of selection.current.slice(batch * batchSize, (batch + 1) * batchSize)) {
                if (controller.signal.aborted) return;
                try { reviewed.push({ row, result:await reviewGatewayBackfill(client,session,permissions,scopeId,row,controller.signal) }); }
                catch (error) { reviewed.push({ row, result:{state:'unavailable',message:error.message} }); }
            }
            if (!controller.signal.aborted) setLoaded({ batch, retry, results:reviewed });
        };
        void load();
        return () => controller.abort();
    }, [batch, retry, client, session, permissions, scopeId]);

    const ready = results?.filter(({ result }) => result.state === 'review') || [];
    async function record() {
        const controller = request.current;
        if (!controller || controller.signal.aborted || recording.current || !ready.length || !reason.trim() || confirmed) return;
        recording.current = true;
        setRecordingAttempted(true);
        setBusy(true); onBusyChange?.(true);
        const completed = [];
        try {
            for (const { row, result } of results) {
                if (controller.signal.aborted) return;
                if (result.state !== 'review') { completed.push({ row,result }); continue; }
                try { completed.push({ row,result:await recordGatewayBackfill(client,session,permissions,scopeId,row,result,reason,controller.signal) }); }
                catch (error) { completed.push({ row,result:{state:'unconfirmed',message:error.message} }); }
            }
            if (!controller.signal.aborted) { setLoaded({ batch, retry, results:completed }); setConfirmed(true); }
        } finally {
            recording.current = false;
            if (!controller.signal.aborted) setBusy(false);
            onBusyChange?.(false);
        }
    }
    function nextBatch() {
        setHistory(previous => [...previous, ...results]);
        setBatch(value => value + 1);
        setReason('');
        setConfirmed(false);
    }
    function retryBatch() {
        setConfirmed(false);
        setRetry(value => value + 1);
    }
    const canContinue = results && !ready.length && batch + 1 < batchCount;
    const canRetry = results?.some(({ result }) => ['unavailable','unconfirmed','changed'].includes(result.state));
    const renderedResults = items => <ul>{items.map(({ row, result }) => <li key={row.reference}><strong>{row.reference}</strong> · {
        result.state === 'review' ? `${money(result.amountMinor)} · ${result.payer}. ${reviewText(result)}` : outcomeText(result)
    }</li>)}</ul>;

    return <section className="ap-section" style={{ padding:18 }} aria-label="Review missing Paystack receipts">
        <h2>{confirmed ? 'Receipt recording results' : 'Review missing Paystack receipts'}</h2>
        {bulk && <p role="status">{selection.current.length} missing receipts in the filtered results. Batch {batch + 1} of {batchCount}.</p>}
        {!results ? <p role="status">Verifying the selected receipts with Paystack…</p> : <>
            {renderedResults(results)}
            {ready.length > 0 && <label className="lw-field"><span>Reason for recording these receipts</span>
                <textarea rows={3} maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)}/></label>}
        </>}
        {history.length > 0 && <details><summary>Earlier batch results ({history.length} receipts)</summary>{renderedResults(history)}</details>}
        <div className="fo-report-actions">
            {!!ready.length && <button type="button" className="ap-primary" disabled={busy || !reason.trim()} onClick={record}>
                {busy ? 'Recording receipts…' : 'Confirm receipt recording'}</button>}
            {canContinue && <button type="button" className="ap-primary" onClick={nextBatch}>Review next batch</button>}
            {canRetry && <button type="button" className="ap-secondary" disabled={busy} onClick={retryBatch}>
                {confirmed ? 'Recheck receipt results' : 'Retry batch verification'}</button>}
            <button type="button" className="ap-secondary" disabled={busy} onClick={recordingAttempted ? onRecorded : onClose}>
                {recordingAttempted ? 'Close and refresh gateway' : 'Cancel receipt review'}</button>
        </div>
    </section>;
}
