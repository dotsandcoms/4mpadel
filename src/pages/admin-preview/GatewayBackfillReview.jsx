import { useEffect, useRef, useState } from 'react';
import { recordGatewayBackfill, reviewGatewayBackfill } from './paystackBackfill.js';

const batchSize = 10;
const money = amount => new Intl.NumberFormat('en-ZA', { style:'currency', currency:'ZAR' }).format(amount / 100);
const outcomeText = result => result.message || ({
    recorded: 'Receipt recorded in the 4M ledger.',
    already_recorded: 'An existing ledger entry already uses this receipt.',
    held: 'The receipt needs further review.',
    changed: 'Receipt evidence changed. Refresh and review again.',
    deferred: 'Left for later review.',
})[result.state] || 'Receipt is unavailable.';
const reviewText = row => {
    if (row.kind === 'entry') {
        const entries = row.entries === 1 ? '1 existing entry' : `${row.entries} existing entries`;
        return `Event #${row.eventId}. ${entries} will be marked paid${row.licences ? ` with ${row.licences} licence payments` : ''}.`;
    }
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
    const [selected, setSelected] = useState(() => new Map());
    const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
    const [recordingAttempted, setRecordingAttempted] = useState(false);
    const batchCount = Math.ceil(selection.current.length / batchSize);
    const allocation = selection.current.length === 1 && selection.current[0].link?.unallocated;
    const heading = allocation ? 'Review Paystack receipt allocation' : 'Review missing Paystack receipts';
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
    const isSelected = ({ row, result }) => selected.get(row.reference) === result.token;
    const selectedReady = bulk ? ready.filter(isSelected) : ready;
    const setReceiptSelected = ({ row, result }, checked) => setSelected(previous => {
        const next = new Map(previous);
        if (checked) next.set(row.reference, result.token);
        else next.delete(row.reference);
        return next;
    });

    async function record() {
        const controller = request.current;
        if (!controller || controller.signal.aborted || recording.current || !selectedReady.length || !reason.trim()) return;
        const approved = new Set(selectedReady);
        recording.current = true;
        setRecordingAttempted(true);
        setBusy(true); onBusyChange?.(true);
        const completed = [];
        try {
            for (const item of results) {
                if (controller.signal.aborted) return;
                if (!approved.has(item)) { completed.push(item); continue; }
                const { row, result } = item;
                try { completed.push({ row,result:await recordGatewayBackfill(client,session,permissions,scopeId,row,result,reason,controller.signal) }); }
                catch (error) { completed.push({ row,result:{state:'unconfirmed',message:error.message} }); }
            }
            if (!controller.signal.aborted) {
                setLoaded({ batch, retry, results:completed });
                setSelected(new Map());
                setReason('');
                setConfirmed(true);
            }
        } finally {
            recording.current = false;
            if (!controller.signal.aborted) setBusy(false);
            onBusyChange?.(false);
        }
    }
    function nextBatch() {
        if (!results || recording.current || batch + 1 >= batchCount) return;
        setHistory(previous => [...previous, ...results.map(item => item.result.state === 'review'
            ? { row:item.row, result:{ state:'deferred' } } : item)]);
        setBatch(batch + 1);
        setSelected(new Map());
        setReason('');
        setConfirmed(false);
    }
    function retryBatch() {
        if (recording.current) return;
        setSelected(new Map());
        setReason('');
        setConfirmed(false);
        setRetry(value => value + 1);
    }
    const canContinue = results && batch + 1 < batchCount;
    const canRetry = results?.some(({ result }) => ['unavailable','unconfirmed','changed'].includes(result.state));
    const renderedResults = (items, selectable = false) => <ul>{items.map(item => {
        const { row, result } = item;
        const reference = <strong>{row.reference}</strong>;
        return <li key={row.reference}>
            {selectable && result.state === 'review' ? <label>
                <input type="checkbox" aria-label={`Select receipt ${row.reference}`} checked={isSelected(item)} disabled={busy}
                    onChange={event => setReceiptSelected(item,event.target.checked)}/> {reference}
            </label> : reference} · {
                result.state === 'review' ? `${money(result.amountMinor)} · ${result.payer}. ${reviewText(result)}` : outcomeText(result)
            }
        </li>;
    })}</ul>;

    return <section className="ap-section" style={{ padding:18 }} aria-label={heading}>
        <h2>{confirmed ? (allocation ? 'Receipt allocation results' : 'Receipt recording results') : heading}</h2>
        {allocation && !confirmed && <p>Allocate the existing receipt when it matches a saved entry or licence checkout.</p>}
        {bulk && <p role="status">{selection.current.length} missing receipts in the filtered results. Batch {batch + 1} of {batchCount}.</p>}
        {!results ? <p role="status">Verifying receipts with Paystack…</p> : <>
            {bulk && ready.length > 0 && <>
                <div className="fo-report-actions">
                    <button type="button" className="ap-secondary" disabled={busy || selectedReady.length === ready.length}
                        onClick={() => setSelected(new Map(ready.map(({ row, result }) => [row.reference,result.token])))}>Select all ready receipts</button>
                    <button type="button" className="ap-secondary" disabled={busy || !selectedReady.length}
                        onClick={() => setSelected(new Map())}>Clear selection</button>
                </div>
                <p role="status">{selectedReady.length} of {ready.length} ready receipts selected.</p>
            </>}
            {renderedResults(results,bulk)}
            {ready.length > 0 && <label className="lw-field"><span>{allocation ? 'Reason for allocating this receipt' : 'Reason for recording these receipts'}</span>
                <textarea rows={3} maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)}/></label>}
        </>}
        {history.length > 0 && <details><summary>Earlier batch results ({history.length} receipts)</summary>{renderedResults(history)}</details>}
        <div className="fo-report-actions">
            {!!ready.length && <button type="button" className="ap-primary" disabled={busy || !selectedReady.length || !reason.trim()} onClick={record}>
                {allocation ? (busy ? 'Allocating receipt…' : 'Confirm receipt allocation') : (busy ? 'Recording receipts…' : 'Confirm receipt recording')}</button>}
            {canContinue && <button type="button" className="ap-secondary" disabled={busy} onClick={nextBatch}>Review next batch</button>}
            {canRetry && <button type="button" className="ap-secondary" disabled={busy} onClick={retryBatch}>
                {confirmed ? 'Recheck receipt results' : 'Retry batch verification'}</button>}
            <button type="button" className="ap-secondary" disabled={busy} onClick={recordingAttempted ? onRecorded : onClose}>
                {recordingAttempted ? 'Close and refresh gateway' : 'Cancel receipt review'}</button>
        </div>
    </section>;
}
