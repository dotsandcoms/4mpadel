import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';

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
export function useAccountSecurity(userId) {
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
    const changeEmail = value => { setEmail(value); setTarget(null); retry.current = null; };
    const changeFactor = (id, checked) => { setSelected(previous => checked ? [...previous, id] : previous.filter(item => item !== id)); retry.current = null; };
    const changeReason = value => { setReason(value); retry.current = null; };
    const changeConfirmation = value => { setConfirmed(value); retry.current = null; };
    const reviewReset = () => { retry.current = crypto.randomUUID(); setReview(true); };
    const loadRecoveryHistory = () => void run(async () => { const rows = await recoveryRequest('history'); if (alive.current) setHistory(rows); });
    return {
        account, pending, code, setCode, name, setName, intent, setIntent, addReady, setAddReady,
        removeReady, setRemoveReady, busy, error, feedback, hidden, recoveryReady, email, target,
        selected, reason, confirmed, review, setReview, history, enroll, verifyEnrollment, cancelEnrollment,
        freshVerified, remove, lookup, reset, canReview, editing, changeEmail, changeFactor, changeReason,
        changeConfirmation, reviewReset, loadRecoveryHistory
    };
}
