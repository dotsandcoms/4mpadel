import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { licenseCheckout, licenseDate } from '../utils/licenses';
import { fetchUpcomingCalendarEvents } from '../utils/calendarEvents';
import { defaultLicenseYear } from '../utils/commerce';
import { formatCurrency } from '../constants/fees';
export default function LicensePaymentModal({
  isOpen,
  onClose,
  onPaymentSuccess,
  onEditProfile,
  initialEventId,
  initialType = 'full',
  beneficiaryPlayerId,
  returnEventId
}) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => dialog.current?.querySelector('button')?.focus(), 0);
    const handle = e => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const items = dialog.current?.querySelectorAll('button:not(:disabled),select:not(:disabled),a[href]');
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handle);
      previous?.focus?.();
    };
  }, [isOpen, onClose]);
  const [seasons, setSeasons] = useState([]),
    [events, setEvents] = useState([]),
    [year, setYear] = useState(defaultLicenseYear()),
    [type, setType] = useState('full'),
    [eventId, setEventId] = useState('');
  const [quote, setQuote] = useState(null),
    [attempt, setAttempt] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [profileIssue, setProfileIssue] = useState(null),
    [key, setKey] = useState('');
  function showError(failure) {
    setError(failure.message);
    setProfileIssue(failure.code === 'PROFILE_INCOMPLETE' ? { fields: failure.missingFields || [], url: failure.profileUrl || '/profile?edit=true' } : null);
  }
  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    setError('');
    setProfileIssue(null);
    (async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to buy a license.');
      const k = `license-checkout-web:${user.id}`;
      const [s, e] = await Promise.all([supabase.from('license_seasons').select('*').is('archived_at', null).order('year', {
        ascending: false
      }), fetchUpcomingCalendarEvents(supabase)]);
      if (s.error) throw s.error;
      if (!live) return;
      setKey(k);
      setSeasons(s.data || []);
      setYear(previous => s.data?.some(season => season.year === previous) ? previous : s.data?.[0]?.year || defaultLicenseYear());
      setEvents(e.filter(row => row.allow_temporary_license !== false));
      setType(initialType);
      setEventId(initialEventId || '');
      const stored = localStorage.getItem(k);
      if (stored) {
        const a = JSON.parse(stored);
        setAttempt(a);
        setType(a.type);
        setYear(a.year);
        setEventId(a.eventId || '');
      }
    })().catch(e => {
      if (live) showError(e);
    });
    return () => {
      live = false;
    };
  }, [isOpen, initialEventId, initialType]);
  useEffect(() => {
    if (!isOpen || type === 'temporary' && !eventId) {
      setQuote(null);
      return;
    }
    let live = true;
    setQuote(null);
    licenseCheckout({
      action: 'quote',
      licenseType: type,
      licenseYear: Number(year),
      eventId: Number(eventId),
      beneficiaryPlayerId: attempt?.beneficiaryPlayerId || beneficiaryPlayerId
    }).then(r => {
      if (live) {
        setQuote(r.quote);
        setError('');
        setProfileIssue(null);
      }
    }).catch(e => {
      if (live) showError(e);
    });
    return () => {
      live = false;
    };
  }, [isOpen, type, year, eventId, beneficiaryPlayerId, attempt?.beneficiaryPlayerId]);
  async function verify() {
    setBusy(true);
    setError('');
    try {
      const r = await licenseCheckout({
        action: 'verify',
        reference: attempt.reference
      });
      if (!r.paid) throw new Error('Payment is not confirmed yet. Wait a moment and check again.');
      localStorage.removeItem(key);
      setAttempt(null);
      await onPaymentSuccess?.();
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    setError('');
    try {
      const current = attempt || {
        id: crypto.randomUUID(),
        type,
        year: Number(year),
        eventId: Number(eventId) || null,
        beneficiaryPlayerId,
        returnEventId
      };
      localStorage.setItem(key, JSON.stringify(current));
      setAttempt(current);
      const r = await licenseCheckout({
        action: 'checkout',
        licenseType: current.type,
        licenseYear: current.year,
        eventId: current.eventId,
        attemptId: current.id,
        agreed: true,
        acceptedTotal: quote.total,
        channel: 'web',
        beneficiaryPlayerId: current.beneficiaryPlayerId,
        returnEventId: current.returnEventId
      });
      const url = new URL(r.authorizationUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Unexpected payment address.');
      const saved = {
        ...current,
        reference: r.reference,
        url: url.href
      };
      localStorage.setItem(key, JSON.stringify(saved));
      setAttempt(saved);
      window.location.assign(url.href);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  if (!isOpen) return null;
  const renew = quote?.isRenewal === true;
  return <div className="fixed inset-0 z-[1100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="license-checkout-title" className="relative max-w-md w-full max-h-[90vh] overflow-auto rounded-2xl bg-neutral-950 border border-white/15 p-6 text-white" onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Close license checkout" className="absolute top-4 right-4 p-2" onClick={onClose}><X size={20} /></button><h2 id="license-checkout-title" className="text-xl font-bold pr-8">{quote?.forAnotherPlayer ? `License for ${quote.beneficiaryName}` : 'Your license'}</h2>
        <p className="text-sm text-gray-400 mt-2">Choose annual coverage or a temporary license for one event.</p>
        {error && <p role="alert" className="text-red-300 mt-4">{error}</p>}
        {profileIssue && <div className="mt-3 text-sm"><p className="text-gray-300">Missing: {profileIssue.fields.join(', ') || 'player profile details'}.</p><a href={profileIssue.url} onClick={e => { if (onEditProfile && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onEditProfile(); } }} className="mt-3 inline-flex min-h-11 items-center text-padel-green underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green">Edit profile</a></div>}
        {quote?.licenseNumber && <p className="mt-4 text-xs text-gray-400">4M license number <span className="ml-2 font-mono text-white">{quote.licenseNumber}</span></p>}
        <label className="block mt-5 text-sm">License type<select disabled={!!attempt || busy} value={type} onChange={e => {
          setError('');
          setType(e.target.value);
        }} className="block w-full mt-2 p-3 rounded-lg bg-neutral-900 border border-white/20"><option value="full">Full annual license</option><option value="temporary">Temporary event license</option></select></label>
        {type === 'full' ? <label className="block mt-4 text-sm">License year<select disabled={!!attempt || busy} value={year} onChange={e => setYear(Number(e.target.value))} className="block w-full mt-2 p-3 rounded-lg bg-neutral-900 border border-white/20">{seasons.map(s => <option key={s.year} value={s.year}>{s.year}{s.sales_open ? '' : ' · Sales closed'}</option>)}</select></label> : <label className="block mt-4 text-sm">Event<select disabled={!!attempt || busy} value={eventId} onChange={e => setEventId(e.target.value)} className="block w-full mt-2 p-3 rounded-lg bg-neutral-900 border border-white/20"><option value="">Select an event</option>{events.map(e => <option key={e.id} value={e.id}>{e.event_name}</option>)}</select></label>}
        {quote && <div className="mt-5 border-y border-white/10 py-4 space-y-2"><p className="flex justify-between"><span>{type === 'full' ? renew ? 'Full license renewal' : 'New Full license' : 'Temporary license'}</span><span>{formatCurrency(quote.base)}</span></p>{quote.fee > 0 && <p className="flex justify-between"><span>{quote.feeLabel}</span><span>{formatCurrency(quote.fee)}</span></p>}<p className="flex justify-between font-bold"><span>Total</span><span>{formatCurrency(quote.total)}</span></p>{type === 'full' && quote.startsOn && <p className="text-sm text-gray-400">Valid {licenseDate(quote.startsOn)} – {licenseDate(quote.endsOn)}</p>}{quote.active && <p className="text-padel-green text-sm">{quote.coveredByFull ? 'The Full license already covers this event.' : quote.forAnotherPlayer ? 'This player already holds this license. Contact support if it has been revoked.' : 'You already hold this license. Contact support if it has been revoked.'}</p>}{!quote.enabled && !quote.active && <p className="text-amber-300 text-sm">Sales are closed for this license.</p>}</div>}
        {attempt?.reference && <button type="button" disabled={busy} onClick={verify} className="w-full mt-4 p-3 rounded-xl border border-white/20">Check payment status</button>}
        <button type="button" disabled={busy || !quote?.enabled || quote?.active || !key} onClick={pay} className="w-full mt-4 p-3 rounded-xl bg-padel-green text-black font-bold disabled:opacity-40">{busy ? 'Please wait…' : attempt ? 'Continue payment' : type === 'full' && renew ? `Renew for ${year}` : type === 'full' ? `Buy ${year} Full license` : 'Buy temporary license'}</button>
        {attempt && <button type="button" disabled={busy} onClick={() => {
        localStorage.removeItem(key);
        setAttempt(null);
        setError('');
      }} className="w-full mt-3 text-xs text-gray-400 underline">Start a different checkout (check any payment already made first)</button>}
        <p className="text-xs text-gray-400 mt-4">Pay securely with Paystack. Your license is issued after payment is verified.</p>
    </section></div>;
}
