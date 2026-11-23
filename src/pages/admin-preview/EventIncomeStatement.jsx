import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FileSpreadsheet } from 'lucide-react';
import { loadEventIncomeStatement, prepareEventIncomeWorkbook } from './eventIncomeStatementData.js';
import { buildEventIncomeLines } from '../../utils/eventIncomeStatement.js';

const money = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
const date = value => value ? new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : '—';
const pageSize = 25;
const reportNames = { full: 'Full Event Report', organiser: 'Organisers Consolidated Event Report' };
const downloadWorkbook = async (payload, options) => {
    const { downloadEventFinanceWorkbook } = await import('../../utils/eventFinanceExport.js');
    return downloadEventFinanceWorkbook(payload, options);
};

export default function EventIncomeStatement({
    client, session, scopeId, eventId, onRequestPayout, onRegistration,
    read = loadEventIncomeStatement, prepare = prepareEventIncomeWorkbook, download = downloadWorkbook,
}) {
    const userId = session?.user?.id;
    const [revision, setRevision] = useState(0), [response, setResponse] = useState(null);
    const [query, setQuery] = useState(''), [page, setPage] = useState(1);
    const [menuOpen, setMenuOpen] = useState(false), [exporting, setExporting] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const pending = useRef(null);
    const operation = useRef(null);
    operation.current = { client, userId, scopeId, eventId };
    const key = JSON.stringify([userId, scopeId, eventId, revision]);
    const current = response?.key === key && response.client === client ? response : null;
    const data = current?.data;

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
            setResponse({ key, client, error: 'Loading finance records took too long.' });
        }, 25000);
        read({ client, session: { user: { id: userId } }, scopeId, eventId, signal: controller.signal })
            .then(data => { if (!controller.signal.aborted) setResponse({ key, client, data }); })
            .catch(error => { if (!controller.signal.aborted) setResponse({ key, client, error: error.message }); })
            .finally(() => clearTimeout(timer));
        return () => { controller.abort(); clearTimeout(timer); pending.current?.abort(); };
    }, [client, eventId, key, read, scopeId, userId]);

    const exportReport = async reportType => {
        if (!data || pending.current) return;
        const controller = new AbortController(), started = operation.current;
        pending.current = controller;
        const isCurrent = () => !controller.signal.aborted && Object.keys(started).every(field => started[field] === operation.current[field]);
        setMenuOpen(false);
        setExporting(true);
        setFeedback(null);
        try {
            const report = await prepare({ client, session, scopeId, eventId, signal: controller.signal, reportType });
            if (!isCurrent()) return;
            setResponse({ key, client, data: report.data });
            await download(report.payload, { isCurrent });
            if (isCurrent()) setFeedback({ message: `${reportNames[reportType]} downloaded.` });
        } catch (error) {
            if (isCurrent()) setFeedback({ error: error.message || 'The Excel report could not be prepared.' });
        } finally {
            if (pending.current === controller) pending.current = null;
            setExporting(false);
        }
    };

    const statement = useMemo(() => data ? buildEventIncomeLines({ ...data, reportStats: data.settlement }) : [], [data]);
    const selectable = data?.platform ? onRegistration : undefined;
    const searchable = statement.filter(row => data?.platform || (row.type !== 'license' && row.category !== 'License refund'));
    const rows = searchable.filter(row => [row.description, row.player, row.email, row.method, row.note, row.reference, row.status, row.bucket]
        .some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
    const pages = Math.max(1, Math.ceil(rows.length / pageSize)), currentPage = Math.min(page, pages);
    const openPayouts = onRequestPayout && <button type="button" className="ap-secondary" onClick={onRequestPayout}>Open payout requests <ArrowRight size={16} /></button>;
    if (!current) return <section className="ap-section ap-live-loading" role="status">Loading event finance records…</section>;
    if (!data) return <section className="ap-section ap-live-loading" role="alert"><h2>Income statement unavailable</h2>
        <p>{current.error}</p>{openPayouts}<button type="button" className="ap-secondary" onClick={() => setRevision(value => value + 1)}>Retry finance records</button></section>;

    const { settlement } = data;
    const issueRows = [...new Set([...settlement.issues, ...settlement.cashHistory.issues])];
    const cards = [
        ['Total billed', settlement.totalAmountBilled], ['Current entry fees collected', settlement.grossEntryFees],
        ['Net entry income', settlement.entryFeeBalance], ['Balance due from 4M', settlement.dueToOrg, 'is-accent'],
        ['Entry fee refunds', settlement.entryFeesRefunded, 'is-refund'], ['Outstanding', settlement.pendingAmount, 'is-risk'],
        ['Manual / EFT collected by 4M', settlement.collectedManual, 'is-manual'], ['Paid directly to organiser', settlement.organiserRetained],
    ];
    return <div className="ap-statement-grid">
        <div className="ap-tab-heading"><div><h2>Income statement</h2><p>Entry fees, refunds, reserves and organiser settlement.</p></div>
            <div className="fo-report-actions">
                <button type="button" className="ap-secondary" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen}
                    disabled={exporting} aria-busy={exporting}><FileSpreadsheet size={16} />{exporting ? 'Preparing report…' : 'Export Excel'}</button>
                {menuOpen && <div className="fo-report-actions" aria-label="Excel reports">
                    {data.platform && <button type="button" className="ap-secondary" onClick={() => exportReport('full')}>{reportNames.full}</button>}
                    <button type="button" className="ap-secondary" onClick={() => exportReport('organiser')}>{reportNames.organiser}</button>
                </div>}
                <button type="button" className="ap-secondary" disabled={exporting} onClick={() => { setFeedback(null); setMenuOpen(false); setRevision(value => value + 1); }}>Refresh statement</button>
            </div>
        </div>
        {feedback?.error && <p className="ap-table-foot" role="alert">{feedback.error}</p>}
        {feedback?.message && <p className="ap-table-foot" role="status">{feedback.message}</p>}
        {!!issueRows.length && <section className="ap-section ap-settlement" role="alert"><h2>Reconciliation needs review</h2>
            <ul>{issueRows.map(issue => <li key={issue}>{issue}</li>)}</ul></section>}
        <section className="ap-section ap-income-summary ap-income-summary--eight">{cards.map(([label, value, tone]) =>
            <div key={label} className={tone}><span>{label}</span><strong>{money(value)}</strong></div>)}</section>
        <section className="ap-section ap-settlement">
            <div className="ap-section-heading"><div><h2>Settlement calculation</h2></div><strong>{money(settlement.dueToOrg)} due</strong></div>
            <dl className="ap-finance-breakdown">
                <div><dt>Entry receipts across all registrations</dt><dd>{money(settlement.cashHistory.grossEntryFees)}</dd></div>
                <div><dt>Refunds pending</dt><dd>{money(settlement.refundReserve)}</dd></div>
                <div><dt>Collection recipient unconfirmed</dt><dd>{money(settlement.unconfirmedCollected)}</dd></div>
                <div><dt>4M cash excluded from current entry allocations</dt><dd>{money(settlement.unallocatedCash4M)}</dd></div>
                <div><dt>Unused credit held by 4M</dt><dd>{money(settlement.unallocatedCredit4M)}</dd></div>
                <div><dt>Platform fees</dt><dd>{money(settlement.commission)}</dd></div>
                <div><dt>Recorded payouts to organiser</dt><dd>{money(settlement.interimPaid)}</dd></div>
                <div className="is-total"><dt>Balance due from 4M</dt><dd>{money(settlement.dueToOrg)}</dd></div>
            </dl>
            {openPayouts && <div className="ap-settlement-actions">{openPayouts}</div>}
        </section>
        <section className="ap-section fo-breakdown">
            <div className="ap-section-heading"><h2>Payment ledger</h2><label className="ap-filter-search">
                <span className="ap-visually-hidden">Search payment ledger</span><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search payments, refunds and adjustments…" />
            </label></div>
            <div className="fo-table-scroll" role="region" aria-label="Income statement payment ledger" tabIndex={0}><table className="fo-detail-table">
                <thead><tr><th>Date</th><th>Description</th><th>Player / division</th><th>Amount</th><th>Status</th><th>Method</th></tr></thead>
                <tbody>{rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(row => {
                    const registration = selectable && data.registrations.find(record => record.id === row.registrationId);
                    return <tr key={row.id}><td>{date(row.date)}</td><td>{row.description}<small>{row.bucket}</small></td>
                        <td>{registration ? <button className="fo-type-link" onClick={() => selectable(registration)}>{row.player}</button> : row.player}<small>{row.division}</small></td>
                        <td>{money(row.amount)}</td><td>{row.status}</td><td>{row.method}</td></tr>;
                })}</tbody>
            </table></div>
            {!rows.length && <p className="ap-table-foot">No payment ledger records match this view.</p>}
            {pages > 1 && <nav className="ap-pagination" aria-label="Payment ledger pages"><span>{rows.length} transactions</span>
                <button type="button" className="ap-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
                <span>Page {currentPage} of {pages}</span>
                <button type="button" className="ap-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button>
            </nav>}
        </section>
    </div>;
}
