import React from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import EventMessagingWorkspace from './EventMessagingWorkspace';
import MessagingAuthenticator from './MessagingAuthenticator';
import PlayerMessaging from './PlayerMessaging';
import { useEventMessaging } from './useEventMessaging';

const button = 'min-h-11 rounded-xl px-4 py-3 text-sm font-semibold border border-white/15 hover:bg-white/10 disabled:opacity-40';
const field = 'w-full rounded-xl border border-white/15 bg-white/5 p-3 text-white outline-none focus:border-padel-green';
export default function EventMessaging() {
    const {
        workspace, setWorkspace, status, authError, error, feedback, authReady, verified, busy,
        accountEmail, factor, factors, secret, qrCode, code, setCode, setAuthenticator, setError,
        verify, enrol, owner, rpc, eventId, open, load, act, support, eventPanel, loadSupport
    } = useEventMessaging();
    return <section className="em-dashboard space-y-6 text-white" aria-label="Event messaging">
        <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-padel-green">Courtside communication</p><h2 className="mt-2 text-3xl font-bold">Messaging</h2><p className="mt-2 text-sm text-gray-400">Event updates, private player messages and group conversations.</p></div><button type="button" className={button} onClick={() => { if (authReady && verified && eventId) void open(); else void load(); }}><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></header>
        {(authError || error) && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{authError || error}</p>}
        {feedback && <p role="status" className="text-sm text-padel-green">{feedback}</p>}
        {status && !status.enabled && <div className="rounded-2xl border border-white/10 p-6"><ShieldCheck className="mb-3 text-padel-green" /><h3 className="font-semibold">Messaging is awaiting activation</h3><p className="mt-2 text-sm text-gray-400">The feature opens after database deployment, security verification and the controlled rollout.</p></div>}
        {status?.enabled && <>


            {status.needsBirthDate && <div className="rounded-2xl border border-white/10 p-5 space-y-3"><h3 className="font-semibold">Complete your private profile</h3><p className="text-sm text-gray-400">Add your date of birth before publishing messages. It stays private and is used for messaging eligibility.</p><a className={`${button} inline-block`} href="/profile">Update my profile</a></div>}
            {!status.rulesAccepted && <div className="rounded-2xl border border-white/10 p-5 space-y-3"><h3 className="font-semibold">Messaging community rules</h3><p className="text-sm text-gray-400">Respect players. Harassment, threats, sexual exploitation, scams, spam and sharing private contact or identity details are prohibited. Event messages are visible to eligible players and authorised organisers. Reports are reviewed by the relevant moderation team.</p><button type="button" className={button} disabled={busy} onClick={() => void act('accept_rules', { version: '2026-11-05' }, 'Messaging rules accepted.')}>Accept messaging rules</button></div>}
            {!verified && !authReady && !authError && <p role="status" className="text-sm text-gray-400">Checking authenticator setup for your signed-in account…</p>}
            {!verified && authReady && <MessagingAuthenticator accountEmail={accountEmail} factor={factor} factors={factors} secret={secret} qrCode={qrCode} code={code} busy={busy} onSetup={() => void enrol()} onFactorChange={id => { setAuthenticator(previous => ({ ...previous, factor: id })); setCode(''); setError(''); }} onCode={setCode} onVerify={() => void verify()} buttonClass={button} fieldClass={field} />}
            {verified && status.groupsEnabled && <nav className="em-tabs" aria-label="Messaging workspace"><button type="button" aria-pressed={workspace === 'events'} onClick={() => setWorkspace('events')}>Event messages</button><button type="button" aria-pressed={workspace === 'players'} onClick={() => setWorkspace('players')}>Player messages</button></nav>}
            {verified && workspace === 'players' && status.groupsEnabled && <PlayerMessaging key={owner.current} rpc={rpc} owner={owner.current} />}
            {verified && workspace === 'events' && <EventMessagingWorkspace {...eventPanel} />}
            {status.supportAllowed && <details className="em-support"><summary>Reported private-message evidence</summary><div className="space-y-4 mt-4">
                <h3 className="font-semibold">Reported private messages</h3>
                <p className="text-sm text-gray-400">Support access is limited to evidence deliberately submitted with a report. Unreported private conversations cannot be browsed.</p>
                <button type="button" className={button} disabled={busy || !verified} onClick={loadSupport}>Review reported evidence</button>
                {support.map(report => <article key={report.id} className="rounded-xl border border-amber-400/20 p-4 space-y-3"><h4 className="font-semibold">{report.reason}</h4><p className="whitespace-pre-wrap break-words text-sm text-gray-300">{report.evidence.body}</p><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => void act('support_resolve', { reportId: report.id }, 'Report reviewed.')}>Mark reviewed</button><button type="button" className={button} disabled={busy} onClick={() => void act('support_suspend', { reportId: report.id }, 'Reported sender messaging suspended.')}>Suspend reported sender’s messaging</button></div></article>)}
            </div></details>}
        </>}
    </section>;
}
