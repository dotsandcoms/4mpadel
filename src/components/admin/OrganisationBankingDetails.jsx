import React, { useEffect, useRef, useState } from 'react';
import { Landmark, LockKeyhole, Loader2 } from 'lucide-react';
import { organisationBanking, formatBankingDestination } from '../../utils/organisationBanking';
import { supabase } from '../../supabaseClient';
import BankingVerification from './BankingVerification';
import OrganisationPayoutRequests from './OrganisationPayoutRequests';

const fields = [
    { name: 'bank_name', label: 'Bank name', maxLength: 80, minLength: 2 },
    { name: 'account_holder', label: 'Account holder', maxLength: 120, minLength: 2 },
    { name: 'account_number', label: 'Account number', maxLength: 20, minLength: 6, inputMode: 'numeric', pattern: '[0-9]{6,20}', type: 'password' },
    { name: 'account_number_confirmation', label: 'Confirm account number', maxLength: 20, minLength: 6, inputMode: 'numeric', pattern: '[0-9]{6,20}', type: 'password' },
    { name: 'branch_code', label: 'Branch code', maxLength: 6, minLength: 6, inputMode: 'numeric', pattern: '[0-9]{6}' },
];
export default function OrganisationBankingDetails({ organisationId, compact = false, onSaved }) {
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [verification, setVerification] = useState(null);
    const [notice, setNotice] = useState('');
    const [reload, setReload] = useState(0);
    const formRef = useRef(null);
    // Sensitive draft is confined to this form; never merge it into org/public profile state.
    const draft = useRef(null);
    useEffect(() => {
        let active = true;
        setSummary(null); setError(''); setEditing(false); setVerification(null); draft.current = null;
        organisationBanking('summary', organisationId).then(data => { if (active) setSummary(data); }).catch(e => { if (active) setError(e.message); });
        const clear = () => { draft.current = null; formRef.current?.reset(); setEditing(false); setVerification(null); };
        const { data: { subscription } } = supabase.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { clear(); setSummary(null); } });
        return () => { active = false; draft.current = null; subscription.unsubscribe(); };
    }, [organisationId, reload]);
    const cancel = () => { draft.current = null; formRef.current?.reset(); setVerification(null); setEditing(false); };
    const prepareSave = event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget));
        if (values.account_number !== values.account_number_confirmation) {
            setError('The account numbers do not match. Re-enter both account number fields.');
            event.currentTarget.elements.account_number_confirmation.focus();
            return;
        }
        delete values.account_number_confirmation;
        delete values.confirmed;
        draft.current = values;
        setError(''); setVerification('save');
    };
    const complete = async () => {
        setBusy(true); setError('');
        try {
            const data = await organisationBanking(verification, organisationId, {
                ...(verification === 'save' ? draft.current : {}), expected_version: summary?.version || null,
            });
            setSummary(data); cancel(); setNotice(verification === 'save' ? 'Payout banking details saved securely.' : 'Saved banking details removed. Existing payout requests retain their original details.');
            onSaved?.(data);
        } catch (e) { setError(e.message); draft.current = null; formRef.current?.reset(); setVerification(null); }
        finally { setBusy(false); }
    };
    return <section className={`text-left ${compact ? 'space-y-4' : 'rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-5'}`} data-private="true">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-padel-green/10 p-2.5"><Landmark size={21} className="text-padel-green" /></div><div><h3 className="text-lg font-bold text-white">Payout banking details</h3><p className="text-sm text-gray-400 mt-1">Private banking for manual event payouts. This section does not appear on your public page.</p></div></div>
        {error && <div role="alert" className="text-sm text-red-300">{error} <button type="button" disabled={busy} onClick={() => setReload(value => value + 1)} className="underline min-h-10 ml-2 focus-visible:outline-2 focus-visible:outline-padel-green">Refresh banking</button></div>}
        {notice && <p role="status" className="text-sm text-padel-green">{notice}</p>}
        {!summary ? <p className="text-sm text-gray-400">{error ? 'Banking details could not be loaded. Reopen this section to retry.' : 'Loading secure banking…'}</p> : <>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm text-white font-semibold">{formatBankingDestination(summary)}</p><p className="text-xs text-gray-500 mt-1">{summary.saved ? `Updated ${new Date(summary.updated_at).toLocaleDateString('en-ZA')}` : 'Save an account before requesting an event payout.'}</p></div>
                {!editing && !verification && <div className="flex flex-wrap gap-3"><button type="button" onClick={() => { setEditing(true); setNotice(''); setError(''); }} className="min-h-10 px-4 py-2 rounded-lg text-sm font-bold bg-padel-green text-black hover:bg-white focus-visible:outline-2 focus-visible:outline-white">{summary.saved ? 'Replace banking details' : 'Add banking details'}</button>
                    {summary.saved && <button type="button" onClick={() => { setNotice(''); setVerification('remove'); }} className="min-h-10 text-sm text-gray-400 hover:text-white focus-visible:outline-2 focus-visible:outline-padel-green">Remove saved account</button>}</div>}
            </div>
            {editing && !verification && <form ref={formRef} onSubmit={prepareSave} autoComplete="off" className="space-y-4">
                {summary.saved && <p className="text-xs text-amber-300">Enter the complete replacement account. Pending payout requests keep their original banking details.</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{fields.map(({ name, label, ...attributes }) => <label key={name} className="text-xs font-bold tracking-wide text-gray-400">{label} *<input {...attributes} name={name} required autoComplete="off" spellCheck={false} className="mt-2 block w-full bg-black/30 border border-white/15 rounded-xl p-3 text-base text-white focus:outline-2 focus:outline-padel-green" /></label>)}
                    <label className="text-xs font-bold tracking-wide text-gray-400">Account type *<select name="account_type" required defaultValue="" className="mt-2 block w-full bg-[#101010] border border-white/15 rounded-xl p-3 text-base text-white focus:outline-2 focus:outline-padel-green"><option value="" disabled>Select account type</option><option value="current">Current / cheque</option><option value="savings">Savings</option><option value="transmission">Transmission</option></select></label>
                </div>
                <label className="flex items-start gap-3 text-sm text-gray-300"><input type="checkbox" name="confirmed" required className="mt-1 accent-padel-green" />I confirm this account belongs to the organisation or its authorised payee, and the details are correct.</label>
                <div className="flex gap-4"><button type="submit" disabled={busy} className="px-5 py-3 rounded-xl text-sm font-bold bg-padel-green text-black hover:bg-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white">Save banking details</button><button type="button" onClick={cancel} className="px-2 text-sm text-gray-400 focus-visible:outline-2 focus-visible:outline-padel-green">Cancel</button></div>
            </form>}
            {verification && <BankingVerification purpose={verification === 'save' ? 'save banking details' : 'remove the saved payout account'} onVerified={complete} onCancel={cancel} />}
            {busy && <p role="status" className="text-sm text-gray-400 flex gap-2 items-center"><Loader2 size={14} className="animate-spin" />Saving securely…</p>}
            <p className="text-xs text-gray-500 flex items-start gap-2"><LockKeyhole size={14} className="shrink-0 mt-0.5" />Banking details are encrypted and access is restricted. An authenticator code is required for sensitive actions. Full account details are only revealed to 4M super admins processing a payout.</p>
        </>}
        {!compact && summary && <OrganisationPayoutRequests organisationId={organisationId} />}
    </section>;
}
