import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { licenseRpc, licenseDate, licenseLabel } from '../utils/licenses';
import { licenseStartDate } from '../utils/licenseDates';

export default function PlayerLicenseCard({ onManage, playerId, refreshKey }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(false);
  const dialog = useRef(null);
  const viewButton = useRef(null);
  useEffect(() => {
    let live = true;
    licenseRpc('get_player_licenses', playerId ? { p_player_id: Number(playerId) } : {}).then(data => {
      if (live) { setBundle(data); setError(''); }
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [refreshKey, playerId]);
  useEffect(() => {
    if (!viewing) return;
    const modal = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.showModal();
    return () => {
      modal.close();
      document.body.style.overflow = overflow;
      viewButton.current?.focus();
    };
  }, [viewing]);
  const fullHolder = bundle?.licenses?.some(l => l.license_type === 'full' && l.status === 'active');
  const status = fullHolder ? 'Full license holder' : bundle?.licenses?.some(l => l.license_type === 'temporary' && l.status === 'active') ? 'Temporary event license holder' : 'No current Full license';
  const renewed = bundle?.licenses?.some(l => l.license_type === 'full' && l.season_year === 2027);
  const existing = bundle?.licenses?.some(l => l.license_type === 'full' && l.season_year < 2027 && l.status !== 'revoked');
  const number = bundle?.license_number || (bundle ? 'Number allocated with your first license' : 'Loading license details…');
  const button = 'rounded-xl bg-padel-green px-4 py-3 text-sm font-bold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-padel-green disabled:opacity-40';
  return <>
    <section className="mb-5 rounded-2xl border border-padel-green/25 bg-neutral-950 p-5" aria-label="Your licenses">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-padel-green"><ShieldCheck size={18} aria-hidden="true" /><h3 className="font-bold">Your licenses</h3></div>
          <p className="mt-2 font-semibold text-white">{bundle?.name}</p>
          {bundle && <p className="mt-2 text-sm font-semibold text-padel-green">{status}</p>}
          <p className="mt-3 text-[11px] text-gray-500">4M license number</p><p className="mt-1 font-mono text-base text-white">{number}</p>
        </div>
        <button ref={viewButton} type="button" aria-haspopup="dialog" disabled={!bundle} onClick={() => setViewing(true)} className={button}>View</button>
      </div>
      {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    </section>
    {viewing && <dialog ref={dialog} aria-labelledby="license-details-title" onCancel={event => { event.preventDefault(); setViewing(false); }} onClick={event => { if (event.target === event.currentTarget) setViewing(false); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-neutral-950 p-0 text-white backdrop:bg-black/75">
      <div className="p-5 sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div><h2 id="license-details-title" className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck size={21} className="text-padel-green" aria-hidden="true" />Your licenses</h2><p className="mt-3 font-semibold">{bundle?.name}</p><p className="mt-1 text-sm text-padel-green">{status}</p></div>
          <button type="button" aria-label="Close license details" onClick={() => setViewing(false)} className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green"><X size={22} /></button>
        </header>
        <p className="mt-5 text-xs text-gray-500">4M license number</p><p className="mt-1 font-mono text-lg">{number}</p>
        <div className="mt-5 space-y-4">{bundle?.licenses?.map(row => <div key={row.id} className="flex flex-wrap justify-between gap-3 border-t border-white/10 pt-4 text-sm">
          <div><p>{licenseLabel(row)}</p><p className="mt-1 text-xs text-gray-400">{licenseDate(licenseStartDate(row))} – {licenseDate(row.ends_on)}</p>
            {row.license_type === 'full' && <p className="mt-1 text-xs text-gray-400">{row.source === 'complimentary' ? `Granted ${licenseDate(row.granted_on)}` : row.purchased_on || Number(row.season_year) === 2026 ? `Purchased ${licenseDate(row.purchased_on || '2026-01-01')}` : 'Purchase date unavailable'}</p>}
          </div>
          <span className={row.status === 'active' ? 'text-padel-green' : 'text-gray-300'}>{row.status === 'upcoming' ? `Starts ${licenseDate(licenseStartDate(row))}` : row.status.charAt(0).toUpperCase() + row.status.slice(1)}</span>
        </div>)}</div>
        {!bundle?.licenses?.length && <p className="mt-5 border-t border-white/10 pt-4 text-sm text-gray-400">No licenses on file yet.</p>}
        <p className="mt-5 text-xs leading-relaxed text-gray-400">Temporary event licenses are also available when you do not need annual coverage.</p>
        <footer className="mt-6 flex justify-end border-t border-white/10 pt-5"><button type="button" onClick={() => { setViewing(false); onManage?.(); }} className={button}>{renewed ? 'Manage licenses' : existing ? 'Renew for 2027' : 'Buy 2027 Full license'}</button></footer>
      </div>
    </dialog>}
  </>;
}
