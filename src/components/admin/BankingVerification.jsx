import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';

/** A fresh TOTP challenge; verification is also enforced by the database. */
export default function BankingVerification({ onVerified, onCancel, purpose = 'continue' }) {
    const [factorId, setFactorId] = useState(null);
    const [enrollment, setEnrollment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const errorId = useId();
    const pendingFactor = useRef(null);
    const mounted = useRef(true);
    const codeRef = useRef(null);
    useEffect(() => {
        mounted.current = true;
        supabase.auth.mfa.listFactors().then(({ data, error: loadError }) => {
            if (!mounted.current) return;
            if (loadError) setError('Could not load authenticator settings. Sign in again and retry.');
            else setFactorId(data?.totp?.find(f => f.status === 'verified')?.id || null);
            setLoading(false);
        });
        return () => {
            mounted.current = false;
            if (pendingFactor.current) supabase.auth.mfa.unenroll({ factorId: pendingFactor.current });
        };
    }, []);
    const enroll = async () => {
        if (busy) return;
        setBusy(true); setError('');
        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
            factorType: 'totp', friendlyName: `4M Banking ${Date.now()}`,
        });
        if (!mounted.current) {
            if (data?.id) await supabase.auth.mfa.unenroll({ factorId: data.id });
            return;
        }
        if (enrollError) setError('Could not set up an authenticator. Retry or contact 4M support.');
        else { pendingFactor.current = data.id; setEnrollment(data.totp); setFactorId(data.id); }
        setBusy(false);
    };
    const verify = async (event) => {
        event.preventDefault();
        if (busy) return;
        const code = codeRef.current?.value.trim();
        if (!/^\d{6}$/.test(code || '')) { setError('Enter the 6-digit code from your authenticator.'); codeRef.current?.focus(); return; }
        setBusy(true); setError('');
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
        if (!mounted.current) return;
        if (verifyError) { setError('Code could not be verified. Use the latest code and try again.'); setBusy(false); return; }
        pendingFactor.current = null;
        setEnrollment(null);
        if (codeRef.current) codeRef.current.value = '';
        // The parent owns operation errors and can render another challenge if needed.
        await onVerified();
        if (mounted.current) setBusy(false);
    };
    return (
        <div className="rounded-xl border border-padel-green/25 bg-black/30 p-4 space-y-3">
            <p className="text-sm font-semibold text-white flex items-center gap-2"><ShieldCheck size={17} className="text-padel-green" /> Verify to {purpose}</p>
            {loading ? <p role="status" className="text-sm text-gray-400">Loading authenticator…</p> : <>
                {!factorId && <>
                    <p className="text-sm text-gray-400">Protect banking with an authenticator app. Set it up once, then use a code for sensitive actions. Keep access to your authenticator; contact 4M support if you lose it.</p>
                    <button type="button" onClick={enroll} disabled={busy || !!error} className="px-4 py-2.5 rounded-lg bg-padel-green text-black font-bold text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-padel-green">{busy ? 'Setting up…' : 'Set up authenticator'}</button>
                </>}
                {enrollment && <div className="space-y-3">
                    <p className="text-sm text-gray-300">Scan this code with your authenticator app, then enter its 6-digit code. Enabling this signs out your other sessions.</p>
                    <img src={enrollment.qr_code.startsWith('data:') ? enrollment.qr_code : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr_code)}`} alt="Authenticator setup QR code" width="200" height="200" className="bg-white p-2 rounded-lg" />
                    <details className="text-xs text-gray-400"><summary className="cursor-pointer">Enter a setup key instead</summary><code className="block mt-2 break-all text-white select-all">{enrollment.secret}</code></details>
                </div>}
                {factorId && <form onSubmit={verify} className="flex flex-wrap items-end gap-3">
                    <label className="text-xs text-gray-300">Authenticator code
                        <input ref={codeRef} name="banking-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required aria-invalid={!!error} aria-describedby={error ? errorId : undefined} className="block mt-1 w-40 rounded-lg bg-black/40 border border-white/20 px-3 py-2.5 text-base text-white tracking-widest focus:outline-2 focus:outline-padel-green" />
                    </label>
                    <button type="submit" disabled={busy} className="px-4 py-2.5 rounded-lg bg-padel-green text-black font-bold text-sm disabled:opacity-50 inline-flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-white">{busy && <Loader2 size={14} className="animate-spin" />}Verify</button>
                </form>}
            </>}
            {error && <p id={errorId} role="alert" className="text-sm text-red-300">{error}</p>}
            <button type="button" onClick={onCancel} disabled={busy} className="min-h-10 text-sm text-gray-400 hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-padel-green">Cancel</button>
        </div>
    );
}
