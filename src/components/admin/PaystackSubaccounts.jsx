import { useEffect, useState } from 'react';
import { organisationPaystack } from '../../utils/organisationPaystack';

const date = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeZone: 'Africa/Johannesburg' });
const inputStyle = 'min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-white focus-visible:outline-2 focus-visible:outline-padel-green';
const buttonStyle = 'min-h-11 rounded-lg border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-padel-green';
const statusLabel = { off: 'Off', enabled: 'Enabled', paused: 'Paused' };

export default function PaystackSubaccounts() {
    const [settings, setSettings] = useState(null);
    const [organisationId, setOrganisationId] = useState('');
    const [events, setEvents] = useState([]);
    const [code, setCode] = useState('');
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const selected = settings?.organisations.find(org => org.id === organisationId);
    const account = selected?.account?.code ? selected.account : null;

    useEffect(() => {
        let active = true;
        organisationPaystack('list').then(result => {
            if (active) setSettings(result);
        }).catch(failure => {
            if (active) setError(failure.message);
        });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        let active = true;
        if (organisationId) {
            setLoadingEvents(true);
            organisationPaystack('events', { organisationId }).then(result => {
                if (active) setEvents(result.events);
            }).catch(failure => {
                if (active) setError(failure.message);
            }).finally(() => {
                if (active) setLoadingEvents(false);
            });
        }
        return () => { active = false; };
    }, [organisationId]);

    const choose = (id) => {
        const org = settings.organisations.find(item => item.id === id);
        setOrganisationId(id);
        setCode(org?.account?.code || '');
        setPreview(null);
        setEvents([]);
        setError('');
        setNotice('');
    };

    async function submit(action, payload) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await organisationPaystack(action, { organisationId, ...payload });
            if (action === 'preview') {
                setPreview(result.account);
            } else if (action === 'save') {
                setSettings(current => ({
                    ...current,
                    organisations: current.organisations.map(org => org.id === organisationId ? { ...org, account: result.account } : org),
                }));
                setPreview(null);
                setNotice('Paystack subaccount saved.');
            } else {
                setEvents(current => current.map(event => event.id === payload.eventId ? { ...event, status: result.status } : event));
                setNotice(result.status === 'paused' ? 'New online checkouts paused for this tournament.' : 'Paystack subaccount routing enabled for this tournament.');
            }
        } catch (failure) {
            setError(failure.message);
            if (action === 'save') setPreview(null);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="max-w-5xl space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-7">
            <div>
                <h3 className="text-xl font-bold text-white">Paystack Subaccounts</h3>
                <p className="mt-1 text-sm text-gray-400">Link one subaccount per organisation, then enable settlement for individual tournaments.</p>
            </div>

            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            {notice && <p role="status" className="text-sm text-padel-green">{notice}</p>}
            {!settings && !error && <p role="status" className="text-sm text-gray-400">Loading organisations…</p>}

            {settings && <>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-white/10 text-gray-400">
                            <tr><th className="py-2 pr-4" scope="col">Organisation</th><th className="py-2 pr-4" scope="col">Subaccount</th><th className="py-2" scope="col">Status</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {settings.organisations.map(org => (
                                <tr key={org.id} className={organisationId === org.id ? 'bg-white/5' : ''}>
                                    <th scope="row" className="py-2 pr-4 font-medium">
                                        <button className="min-h-10 rounded text-left text-white hover:underline focus-visible:outline-2 focus-visible:outline-padel-green"
                                            type="button" disabled={busy} aria-pressed={organisationId === org.id} onClick={() => choose(org.id)}>{org.name}</button>
                                    </th>
                                    <td className="py-2 pr-4 font-mono text-gray-300">{org.account?.code || '—'}</td>
                                    <td className="py-2 text-gray-300">{org.account?.code ? 'Linked' : 'Unlinked'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {selected && <>
                    <form className="space-y-4 border-t border-white/10 pt-5" onSubmit={event => {
                        event.preventDefault();
                        void submit('preview', { code: code.trim() });
                    }}>
                        <h4 className="text-base font-semibold text-white">{selected.name}</h4>
                        <div className="max-w-lg">
                            <label htmlFor="paystack-subaccount-code" className="mb-2 block text-sm font-medium text-white">Paystack subaccount code</label>
                            <input id="paystack-subaccount-code" required autoComplete="off" spellCheck={false}
                                placeholder="ACCT_…" value={code} disabled={busy} className={inputStyle}
                                onChange={event => { setCode(event.target.value); setPreview(null); }} />
                        </div>
                        <button className={buttonStyle} disabled={busy || !code.trim()} type="submit">Verify code</button>
                        {preview && (
                            <div className="max-w-lg space-y-3 rounded-xl border border-white/10 bg-black/20 p-4" aria-live="polite">
                                <p className="font-semibold text-white">{preview.accountHolder}</p>
                                <p className="text-sm text-gray-300">{preview.bankName}{preview.lastFour ? ` · Account ending ${preview.lastFour}` : ''}</p>
                                {settings.mode === 'live' && !preview.verified && <p className="text-sm text-amber-200">Verify this payout account in Paystack before enabling a tournament.</p>}
                                <button type="button" className="min-h-11 rounded-lg bg-padel-green px-4 text-sm font-semibold text-black disabled:opacity-50"
                                    disabled={busy} onClick={() => void submit('save', { code: preview.code, accountHolder: preview.accountHolder,
                                        lastFour: preview.lastFour, expectedVersion: account?.updated_at || null })}>
                                    {account && account.code !== preview.code ? 'Replace subaccount' : 'Save subaccount'}
                                </button>
                            </div>
                        )}
                    </form>

                    <div className="space-y-3 border-t border-white/10 pt-5">
                        <h4 className="text-base font-semibold text-white">Tournament routing</h4>
                        {!settings.canEnable && <p className="text-sm text-amber-200">Live routing is waiting for Paystack confirmation of organisation-funded refunds.</p>}
                        {loadingEvents && <p role="status" className="text-sm text-gray-400">Loading tournaments…</p>}
                        {!loadingEvents && !events.length && <p className="text-sm text-gray-400">No upcoming tournaments are available to enable.</p>}
                        <ul className="divide-y divide-white/10">
                            {events.map(event => (
                                <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                    <div>
                                        <p className="text-sm font-medium text-white">{event.name}</p>
                                        <p className="mt-1 text-sm text-gray-400">{event.startDate ? date.format(new Date(`${event.startDate}T12:00:00+02:00`)) + ' · ' : ''}{statusLabel[event.status]}</p>
                                    </div>
                                    <button type="button" className={buttonStyle} disabled={busy || (event.status !== 'enabled' && (!account || !settings.canEnable))}
                                        aria-label={`${event.status === 'enabled' ? 'Pause checkout' : 'Enable routing'} for ${event.name}`}
                                        onClick={() => void submit(event.status === 'enabled' ? 'pause' : 'enable', { eventId: event.id })}>
                                        {event.status === 'enabled' ? 'Pause checkout' : event.status === 'paused' ? 'Resume routing' : 'Enable routing'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>}
            </>}
        </section>
    );
}
