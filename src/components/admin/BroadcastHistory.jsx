import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import './broadcast-history.css';
const timestamp = value => new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const number = value => Number(value || 0).toLocaleString('en-ZA');
export default function BroadcastHistory({ history, loading, error, onPage, onRefresh }) {
    const [expanded, setExpanded] = useState(null);
    const { items, page, pages, total } = history;
    const first = total ? (page - 1) * 5 + 1 : 0, last = Math.min(page * 5, total);
    return <section className="pb-history" aria-label="Push broadcast history">
        <header><div><h2>Push history</h2><p>{number(total)} broadcasts · 5 per page</p></div><button type="button" className="pb-control" disabled={loading} onClick={onRefresh}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></header>
        {error ? <p role="alert" className="pb-error">{error}</p> : !items.length ? <p className="pb-empty" role="status">{loading ? 'Loading broadcasts…' : 'Sent broadcasts will appear here.'}</p> : <div aria-busy={loading}>
            <div className="pb-columns" aria-hidden="true"><span>Message</span><span>Audience</span><span>Delivery</span></div>
            <ol className="pb-list">{items.map(item => <li key={item.id}>
                <div className="pb-message"><div className="pb-message-heading"><h3>{item.title}</h3><time dateTime={item.created_at}>{timestamp(item.created_at)} SAST</time></div><p className={expanded === item.id ? 'is-expanded' : ''}>{item.body}</p>{item.body.length > 160 && <button type="button" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{expanded === item.id ? 'Show less' : 'Read message'}</button>}</div>
                <div className="pb-audience"><strong>{number(item.recipient_count)}</strong><span>{Number(item.recipient_count) === 1 ? 'player' : 'players'}</span></div>
                <div className="pb-statuses">{[['pending','Queued'],['sent','Sent'],['failed','Failed'],['skipped','Skipped']].filter(([key]) => Number(item[key]) > 0).map(([key,label]) => <span className={`pb-status pb-${key}`} key={key}><i aria-hidden="true" />{number(item[key])} {label}</span>)}{!['pending','sent','failed','skipped'].some(key => Number(item[key]) > 0) && <span className="pb-neutral">No device jobs</span>}</div>
            </li>)}</ol>
        </div>}
        <nav className="pb-pagination" aria-label="Broadcast history pages"><p aria-live="polite">{number(first)}–{number(last)} of {number(total)}</p><div><button type="button" className="pb-control" disabled={loading || page <= 1} onClick={() => { setExpanded(null); onPage(page - 1); }}><ChevronLeft size={16} />Previous</button><span>Page {page} of {pages}</span><button type="button" className="pb-control" disabled={loading || page >= pages} onClick={() => { setExpanded(null); onPage(page + 1); }}>Next<ChevronRight size={16} /></button></div></nav>
        <p className="pb-footnote">Sent records a push-provider delivery status. It does not confirm that a player opened the notification.</p>
    </section>;
}
