import React, { useRef, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { licenseRpc } from '../../utils/licenses';
import { southAfricanToday } from '../../utils/licenseReporting';

export default function LicenseFederationExport({ year, seasons, onClose }) {
  const today = southAfricanToday();
  const initialYear = year || today.slice(0, 4);
  const [form, setForm] = useState({ from: `${initialYear}-01-01`, to: initialYear === today.slice(0, 4) ? today : `${initialYear}-12-31`, licenseYear: '', type: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const fromRef = useRef(null);
  useEffect(() => { fromRef.current?.focus(); }, []);
  const patch = change => { setForm(value => ({ ...value, ...change })); setDone(''); };
  async function download(event) {
    event.preventDefault(); setBusy(true); setError(''); setDone('');
    try {
      const report = await licenseRpc('license_federation_sales_export', { p_from: form.from, p_to: form.to, p_license_year: form.licenseYear ? Number(form.licenseYear) : null, p_type: form.type || null });
      const { downloadLicenseSalesWorkbook } = await import('../../utils/licenseSalesExport');
      await downloadLicenseSalesWorkbook(report);
      setDone(`Excel report downloaded · ${Number(report.total_sold).toLocaleString('en-ZA')} licenses`);
    } catch (failure) { setError(failure.message || 'Could not export license sales. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="license-surface license-export-panel" aria-labelledby="license-export-title" aria-busy={busy}>
    <div className="license-panel-heading"><div><h2 id="license-export-title">Federation sales report</h2><p>Excel workbook with monthly totals, prices and individual sales</p></div><button type="button" disabled={busy} className="license-icon-button" aria-label="Close Excel export" onClick={onClose}><X size={16} /></button></div>
    <form onSubmit={download} className="license-export-form">
      <label className="license-field"><span>Bought from</span><input ref={fromRef} type="date" required className="license-input" value={form.from} max={form.to} onChange={event => patch({ from: event.target.value })} /></label>
      <label className="license-field"><span>Bought through</span><input type="date" required className="license-input" value={form.to} min={form.from} onChange={event => patch({ to: event.target.value })} /></label>
      <label className="license-field"><span>License year</span><select className="license-input" value={form.licenseYear} onChange={event => patch({ licenseYear: event.target.value })}><option value="">All license years</option>{seasons.map(season => <option key={season.year} value={season.year}>{season.year}</option>)}</select></label>
      <label className="license-field"><span>License type</span><select className="license-input" value={form.type} onChange={event => patch({ type: event.target.value })}><option value="">All paid licenses</option><option value="full">Full · new and renewed</option><option value="new_full">New Full</option><option value="renewal">Full renewals</option><option value="temporary">Temporary</option></select></label>
      <div className="license-export-footer"><p>Actual prices paid in ZAR. Purchase times use South African time. Refunds and records needing review are identified separately. Complimentary licenses and payment attempts are excluded.</p><button type="submit" disabled={busy} className="license-button license-button-primary"><Download size={16} />{busy ? 'Preparing Excel…' : 'Download Excel (.xlsx)'}</button></div>
      {error && <p role="alert" className="license-error">{error}</p>}{done && <p role="status" className="license-export-success">{done}</p>}
    </form>
  </section>;
}
