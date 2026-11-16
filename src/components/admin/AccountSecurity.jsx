import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import BankingVerification from './BankingVerification';
import MessagingAuthenticator from './MessagingAuthenticator';

const button = 'min-h-11 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green disabled:opacity-40';
const field = 'mt-2 block w-full rounded-xl border border-white/15 bg-white/5 p-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-padel-green';
const date = value => new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function recoveryRequest(action, payload = {}) {
    const result = await supabase.functions.invoke('admin-authenticator-recovery', { body: { action, ...payload } });
    if (result.error) {
        let response;
        try { response = await result.error.context?.json(); } catch { /* Network errors have no JSON response. */ }
        const issue = new Error(response?.message || 'Account recovery is unavailable. Refresh its history before retrying a reset.');
        issue.code = response?.error;
        throw issue;
    }
    return result.data;
}

/** The signed-in account owns its factors. Recovery is separately authorised by the server. */
export default function AccountSecurity({ userId, canRecover = false }) {
    const [account, setAccount] = useState(null), [pending, setPending] = useState(null), [code, setCode] = useState('');
    const [name, setName] = useState('Primary phone'), [intent, setIntent] = useState(null), [addReady, setAddReady] = useState(false), [removeReady, setRemoveReady] = useState(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [hidden, setHidden] = useState(false);
    const [recoveryReady, setRecoveryReady] = useState(false), [email, setEmail] = useState(''), [target, setTarget] = useState(null), [selected, setSelected] = useState([]);
    const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [review, setReview] = useState(false), [history, setHistory] = useState(null);
    const alive = useRef(true), read = useRef(0), working = useRef(false), retry = useRef(null);
    const refresh = useCallback(async () => {
        const epoch = ++read.current;
        const [session, result] = await Promise.all([supabase.auth.getSession(), supabase.auth.mfa.listFactors()]);
        if (!alive.current || epoch !== read.current) return;
        if (session.error || result.error || session.data?.session?.user.id !== userId) throw new Error('Sign in again to manage your authenticators.');
        const all = result.data?.all || result.data?.totp || [];
        setAccount({ email: session.data.session.user.email, factors: (result.data?.totp || []).filter(f => f.status === 'verified') });
        setPending(previous => previous && all.some(f => f.id === previous.factor && f.status === 'unverified') ? previous : null);
    }, [userId]);
    useEffect(() => {
        alive.current = true;
        const reload = () => void refresh().catch(() => { if (alive.current) setError('Could not load authenticators. Sign in again or refresh this page.'); });
        reload();
        const subscription = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user.id !== userId) {
                read.current++; alive.current = false; setPending(null); setAccount(null); setIntent(null); setRemoveReady(null); setTarget(null); setHistory(null); setEmail(''); setReason(''); setSelected([]); setConfirmed(false); setRecoveryReady(false); setAddReady(false); setFeedback(''); setError(''); setCode('');
                return;
            }
            setTimeout(() => { if (alive.current) reload(); }, 0);
        }).data.subscription;
        const visibility = () => { setHidden(document.hidden); setCode(''); if (!document.hidden) reload(); };
        document.addEventListener('visibilitychange', visibility);
        return () => { alive.current = false; subscription.unsubscribe(); document.removeEventListener('visibilitychange', visibility); };
    }, [refresh, userId]);
    const run = async operation => {
        if (working.current) return;
        working.current = true; setBusy(true); setError(''); setFeedback('');
        try {
            const current = await supabase.auth.getUser();
            if (!alive.current) return;
            if (current.error || current.data?.user?.id !== userId) throw new Error('Sign in again to manage your authenticators.');
            await operation();
        } catch (issue) {
            if (alive.current) {
                setError(issue.message || 'The action could not finish. Refresh and try again.');
                if (issue.code === 'RECOVERY_MFA_REQUIRED') { setRecoveryReady(false); setIntent({ kind: 'recover' }); }
            }
        } finally { working.current = false; if (alive.current) setBusy(false); }
    };
    const enroll = () => run(async () => {
        const label = name.trim();
        if (!label || label.length > 50) throw new Error('Give this authenticator a name using 1 to 50 characters.');
        const friendlyName = `4M Padel · ${label}`;
        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) throw new Error('Could not check your authenticators. Refresh and try again.');
        // Only discard an unfinished enrollment with this exact label. Verified
        // factors, including backups, are never cleaned up automatically.
        for (const factor of factors.data.all || []) {
            if (!alive.current) return;
            if (factor.factor_type === 'totp' && factor.status === 'unverified' && factor.friendly_name === friendlyName) {
                const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
                if (removed.error) throw new Error('Could not restart the unfinished setup. Refresh and try again.');
            }
        }
        if (!alive.current) return;
        const result = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: '4M Padel', friendlyName });
        if (result.error) throw new Error('Could not start setup. Use a different authenticator name or refresh and try again.');
        if (alive.current) { setPending({ factor: result.data.id, secret: result.data.totp.secret, qrCode: result.data.totp.qr_code }); setCode(''); setAddReady(false); }
    });
    const verifyEnrollment = () => run(async () => {
        if (!pending || !/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code from the authenticator you just added.');
        const result = await supabase.auth.mfa.challengeAndVerify({ factorId: pending.factor, code });
        if (result.error) throw new Error('The code could not be verified. Use the latest code for this setup.');
        if (!alive.current) return;
        setPending(null); setCode(''); setName('Backup device'); setFeedback('Authenticator connected. You can use its code for banking, event messages and help requests.');
        await refresh();
    });
    const cancelEnrollment = () => run(async () => {
        if (pending) {
            const listed = await supabase.auth.mfa.listFactors();
            if (listed.error) throw new Error('Could not check this setup. Refresh and try again.');
            if (listed.data.all?.some(f => f.id === pending.factor && f.status === 'unverified')) {
                const result = await supabase.auth.mfa.unenroll({ factorId: pending.factor });
                if (result.error) throw new Error('Could not cancel setup. Refresh and try again.');
            }
        }
        if (alive.current) { setPending(null); setAddReady(false); setCode(''); await refresh(); }
    });
    const freshVerified = async () => {
        if (!alive.current) return;
        const next = intent; setIntent(null); setError('');
        if (next.kind === 'add') { setAddReady(true); setName('Backup device'); }
        if (next.kind === 'remove') setRemoveReady(next.factor);
        if (next.kind === 'recover') setRecoveryReady(true);
    };
    const remove = () => run(async () => {
        const result = await supabase.auth.mfa.unenroll({ factorId: removeReady.id });
        if (result.error) throw new Error('Could not remove this authenticator. Verify a fresh code and try again.');
        const renewed = await supabase.auth.refreshSession();
        if (renewed.error) throw new Error('Authenticator removed. Sign in again to continue.');
        if (!alive.current) return;
        setRemoveReady(null); setName('Primary phone'); setFeedback('Authenticator removed. Set up a new one if this was your last connection.'); await refresh();
    });
    const lookup = event => {
        event.preventDefault();
        void run(async () => {
            const result = await recoveryRequest('lookup', { email: email.trim().toLowerCase() });
            if (!alive.current) return;
            setTarget(result); setSelected(result.factors.map(f => f.id)); setReason(''); setConfirmed(false); setReview(false); retry.current = null;
        });
    };
    const reset = () => run(async () => {
        retry.current ||= crypto.randomUUID();
        const result = await recoveryRequest('reset', { email: target.email, factorIds: selected, reason: reason.trim(), identityConfirmed: confirmed, requestId: retry.current });
        if (!alive.current) return;
        if (result.state !== 'completed') throw new Error('This recovery is still processing or needs review. Check recovery history before starting another reset.');
        setFeedback(`Authenticator reset for ${target.email}. They must sign in again and scan a new setup QR.`);
        setTarget(null); setReview(false); const rows = await recoveryRequest('history'); if (alive.current) setHistory(rows);
    });
    const canReview = selected.length > 0 && reason.trim().length >= 20 && confirmed;
    const editing = busy || !!pending || !!intent || addReady || !!removeReady;
    return <section className="max-w-4xl space-y-6 text-white" aria-label="Account security">
        <header><p className="text-xs font-bold uppercase tracking-[0.2em] text-padel-green">Account access</p><h2 className="mt-2 text-3xl font-bold">Security</h2><p className="mt-3 text-sm leading-6 text-gray-400">Keep a backup authenticator so you can access 4M when your usual phone is unavailable.</p>{account && <p className="mt-2 break-all text-sm text-gray-300">Signed in as <strong className="text-white">{account.email}</strong></p>}</header>
        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
        <p role="status" className="text-sm leading-6 text-padel-green">{feedback}</p>
        {!account ? <p className="text-sm text-gray-400">Loading authenticators…</p> : hidden ? <p className="text-sm text-gray-400">Account details hidden while this page is in the background.</p> : <>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6 space-y-5" aria-labelledby="connected-authenticators">
                <div className="flex items-center gap-3"><KeyRound size={20} aria-hidden="true" /><h3 id="connected-authenticators" className="text-lg font-semibold">Your authenticators</h3></div>
                <p className="text-sm leading-6 text-gray-300">Each connection belongs to this login email and works for banking, event messages and help requests. Add a backup on a separate device or in a secure password manager.</p>
                {account.factors.length > 0 && <ul className="divide-y divide-white/10">{account.factors.map(factor => <li key={factor.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><h4 className="break-words font-medium">{factor.friendly_name || 'Authenticator app'}</h4>{factor.created_at && <p className="mt-1 text-xs text-gray-400">Connected {date(factor.created_at)}</p>}</div><button className={button} disabled={editing} onClick={() => { setRemoveReady(null); setIntent({ kind: 'remove', factor }); }}>Remove<span className="sr-only"> {factor.friendly_name || 'authenticator'}</span></button></li>)}</ul>}
                {!pending && !intent && !removeReady && (account.factors.length === 0 || addReady) && <label className="block max-w-md text-sm">Name this authenticator<input className={field} name="authenticator-name" autoComplete="off" maxLength={50} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>}
                {(pending || account.factors.length === 0 && !intent) && <MessagingAuthenticator accountEmail={account.email} factor={pending?.factor || ''} secret={pending?.secret || ''} qrCode={pending?.qrCode || ''} code={code} busy={busy} onSetup={enroll} onCode={setCode} onVerify={verifyEnrollment} buttonClass={button} fieldClass={field} />}
                {pending && <button className={button} disabled={busy} onClick={cancelEnrollment}>Cancel setup</button>}
                {account.factors.length > 0 && !pending && !intent && !removeReady && (addReady ? <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={enroll}>Show setup QR</button><button className={button} disabled={busy} onClick={() => setAddReady(false)}>Cancel</button></div> : <button className={button} disabled={editing} onClick={() => setIntent({ kind: 'add' })}>Add backup authenticator</button>)}
                {intent && <BankingVerification allowEnrollment={false} purpose={intent.kind === 'add' ? 'add a backup authenticator' : intent.kind === 'remove' ? 'review removing this authenticator' : 'recover another administrator’s access'} onVerified={freshVerified} onCancel={() => setIntent(null)} />}
                {removeReady && <div className="space-y-4 rounded-xl border border-red-400/25 p-4"><h4 className="font-semibold">Remove {removeReady.friendly_name || 'this authenticator'}?</h4><p className="text-sm leading-6 text-gray-300">Its codes will stop working. {account.factors.length === 1 ? 'This is your last authenticator. You will need to scan a new QR and verify its code before accessing messages, help requests or banking again.' : 'Your other connected authenticators will remain available.'}</p><div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={remove}>Remove authenticator</button><button className={button} disabled={busy} onClick={() => setRemoveReady(null)}>Keep authenticator</button></div></div>}
            </section>
            {canRecover ? <section className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6 space-y-5" aria-labelledby="assisted-recovery">
                <div className="flex items-center gap-3"><ShieldCheck size={20} aria-hidden="true" /><h3 id="assisted-recovery" className="text-lg font-semibold">Help another administrator recover access</h3></div>
                <p className="text-sm leading-6 text-gray-300">A Super Admin with a working authenticator can reset lost connections for another administrator or event organiser. Verify their identity directly before resetting. Every reset records your account, the affected account and your reason.</p>
                {!recoveryReady ? <button className={button} disabled={editing || account.factors.length === 0} onClick={() => { setIntent({ kind: 'recover' }); setReview(false); }}>Verify to recover another account</button> : <>
                    <form onSubmit={lookup} className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Administrator or organiser email<input className={field} name="recovery-email" type="email" required autoComplete="off" maxLength={254} value={email} disabled={busy || review} onChange={event => { setEmail(event.target.value); setTarget(null); retry.current = null; }} /></label><button type="submit" className={button} disabled={busy || review}>Find account</button></form>
                    {target && <div className="space-y-4 border-t border-white/10 pt-5"><h4 className="break-all font-semibold">{review ? 'Review reset for ' : 'Connected authenticators for '}{target.email}</h4>
                        {target.factors.length === 0 ? <p className="text-sm text-gray-300">This account has no authenticator connections. They can sign in and select Set up authenticator.</p> : <>
                            <fieldset disabled={busy || review}><legend className="mb-3 text-sm text-gray-300">Select the connections they have lost</legend><div className="space-y-3">{target.factors.map(factor => <label key={factor.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(factor.id)} onChange={event => { setSelected(previous => event.target.checked ? [...previous, factor.id] : previous.filter(id => id !== factor.id)); retry.current = null; }} /><span className="break-words">{factor.friendly_name || 'Authenticator app'} <span className="text-gray-400">· {factor.status === 'verified' ? 'Connected' : 'Unfinished setup'}</span></span></label>)}</div></fieldset>
                            <label className="block text-sm">How did you verify their identity?<textarea className={field} name="recovery-reason" rows={3} minLength={20} maxLength={500} disabled={busy || review} value={reason} onChange={event => { setReason(event.target.value); retry.current = null; }} placeholder="For example: confirmed the request directly with the account owner by phone." /></label>
                            <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1" checked={confirmed} disabled={busy || review} onChange={event => { setConfirmed(event.target.checked); retry.current = null; }} /><span>I verified this person’s identity outside this request and confirmed they need these connections reset.</span></label>
                            {review && <p className="rounded-xl border border-red-400/25 p-4 text-sm leading-6 text-gray-300">Resetting signs this person out of their existing sessions. The selected codes will stop working for banking, event messages and help requests. They must sign in again and set up a new authenticator. Their account permissions stay in place.</p>}
                            <div className="flex flex-wrap gap-3">{review ? <><button className={button} disabled={busy || !canReview} onClick={reset}>{busy ? 'Resetting authenticators…' : 'Reset selected authenticators'}</button><button className={button} disabled={busy} onClick={() => setReview(false)}>Go back</button></> : <button className={button} disabled={busy || !canReview} onClick={() => { retry.current = crypto.randomUUID(); setReview(true); }}>Review reset</button>}</div>
                        </>}
                    </div>}
                    <button className={button} disabled={busy} onClick={() => void run(async () => { const rows = await recoveryRequest('history'); if (alive.current) setHistory(rows); })}>Refresh recovery history</button>
                    {history && <div className="space-y-3"><h4 className="font-semibold">Your recent recoveries</h4>{history.length ? <ul className="divide-y divide-white/10">{history.map(row => <li key={row.id} className="py-3 text-sm"><p className="break-all">{row.target_email} · {row.state === 'completed' ? 'Completed' : row.state === 'failed' ? 'Needs another attempt' : 'Processing — check before retrying'}</p><p className="mt-1 text-xs text-gray-400">{date(row.created_at)}</p></li>)}</ul> : <p className="text-sm text-gray-400">You have not started any account recoveries.</p>}</div>}
                </>}
                {!account.factors.length && <p className="text-sm text-gray-400">Set up your own authenticator first, or ask another verified Super Admin to recover the affected account.</p>}
            </section> : <p className="text-sm leading-6 text-gray-400">Lost access to all your authenticators? Ask a 4M Super Admin to verify your identity and reset the lost connections, or <a className="text-white underline underline-offset-4" href="/contact">contact 4M support</a>.</p>}
        </>}
    </section>;
}
