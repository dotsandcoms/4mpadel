import React, { useEffect, useState } from 'react';
import { Download, Gift, RotateCcw, Ticket } from 'lucide-react';
import { licenseRpc } from '../../utils/licenses';
import { southAfricanToday } from '../../utils/licenseReporting';
import { LicenseSalesChart } from './LicenseOverview';

const number = value => Number(value || 0).toLocaleString('en-ZA');
const monthLabel = date => new Date(`${date}T12:00:00+02:00`).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' });

export default function TemporaryLicenseSales() {
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [metric, setMetric] = useState('sold'), [report, setReport] = useState(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        if (from && to && to < from) throw new Error('Choose an end date on or after the start date.');
        const data = await licenseRpc('temporary_license_sales_report', { p_from: from || null, p_to: to || null });
        if (live) setReport(data);
      } catch (e) { if (live) { setError(e.message); setReport(null); } }
      finally { if (live) setLoading(false); }
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [from, to]);
  function download() {
    const rows = [['Month', 'Sold this month', 'Total sold by month end (all time)', 'With completed refunds', 'Complimentary'], ...report.series.map(row => [row.month, row.sold, row.cumulative, row.refunded, row.complimentary])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = '4M-temporary-license-sales.csv'; a.click(); URL.revokeObjectURL(url);
  }
  const thisYear = () => { const today = southAfricanToday(); setFrom(`${today.slice(0, 4)}-01-01`); setTo(today); };
  return <section aria-label="Temporary license sales" aria-busy={loading}>
    <div className="license-section-heading"><div><p className="license-eyebrow">Event by event</p><h2>Temporary license sales</h2><p>Every paid event license, counted once per player and event.</p></div><button type="button" disabled={!report || loading} onClick={download} className="license-button license-button-secondary"><Download size={15} /><span className="hidden sm:inline">Export sales</span></button></div>
    {error && <p role="alert" className="license-error">{error}</p>}
    {loading && <p role="status" className="mb-4 text-xs text-gray-400">Loading temporary sales…</p>}
    {report && <div className="license-metrics">
      <article className="license-metric license-metric-total"><div className="license-metric-heading"><span>Total sold · all time</span><Ticket size={19} /></div><p className="license-metric-value">{number(report.all_time_sold)}</p><p className="license-total-bottom">Across every year and event</p></article>
      <article className="license-metric license-metric-temporary"><div className="license-metric-heading"><span>Sold in selected dates</span><Ticket size={19} /></div><p className="license-metric-value">{number(report.sold)}</p><p className="license-metric-description">{!from && !to ? 'All recorded purchases' : `${monthLabel(report.from)} – ${monthLabel(report.to)}`}</p></article>
      <article className="license-metric"><div className="license-metric-heading"><span>With refunds</span><RotateCcw size={19} className="text-[#d9bd92]" /></div><p className="license-metric-value">{number(report.refunded)}</p><p className="license-metric-description">Still included in paid sales above</p></article>
      <article className="license-metric"><div className="license-metric-heading"><span>Complimentary</span><Gift size={19} className="text-[#6acbb9]" /></div><p className="license-metric-value">{number(report.complimentary)}</p><p className="license-metric-description">Free grants · excluded from sold totals</p></article>
    </div>}
    <section className="license-surface">
      <div className="license-temp-toolbar"><label className="license-field"><span>From</span><input type="date" className="license-input" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="license-field"><span>To</span><input type="date" className="license-input" value={to} onChange={e => setTo(e.target.value)} /></label><button type="button" className="license-text-button" onClick={thisYear}>This year</button><button type="button" className="license-text-button" onClick={() => { setFrom(''); setTo(''); }}>All time</button><div className="license-chart-switch" aria-label="Chart measurement"><button type="button" aria-pressed={metric === 'sold'} onClick={() => setMetric('sold')}>Sold each month</button><button type="button" aria-pressed={metric === 'total'} onClick={() => setMetric('total')}>Total sold so far</button></div></div>
      <div className="license-panel-heading"><div><h3>{metric === 'sold' ? 'How many sold each month?' : 'How has the total grown?'}</h3><p>{metric === 'sold' ? 'Each bar shows paid temporary licenses sold in that month.' : 'Each bar adds all sales up to the end of that month, including earlier years.'}</p></div></div>
      {report && <LicenseSalesChart series={report.series} temporaryOnly runningTotal={metric === 'total'} />}
      {!report && !loading && !error && <p className="license-empty">No temporary sales recorded yet.</p>}
    </section>
    {report && <>
      <section className="license-surface mt-5"><div className="license-panel-heading"><div><h3>The monthly breakdown</h3><p>“Total sold to date” adds this month’s sales to all earlier sales.</p></div></div><div className="license-table-scroll"><table className="license-table"><thead><tr>{['Month', 'Sold this month', 'Total sold to date', 'With refunds', 'Complimentary'].map((label, i) => <th key={label} className={i ? 'numeric' : ''}>{label}</th>)}</tr></thead><tbody>{report.series.map(row => <tr key={row.month}><td className="whitespace-nowrap">{monthLabel(row.month)}</td>{['sold', 'cumulative', 'refunded', 'complimentary'].map(key => <td key={key} className={`numeric ${key === 'sold' ? 'license-table-emphasis' : 'license-muted'}`}>{number(row[key])}</td>)}</tr>)}</tbody></table></div></section>
      <p className="license-footnote">Successful, non-test purchases only, using South African dates. Split payments and multiple divisions count as one license per player and event. Refunds appear against the original sale month.{report.legacy_without_payment > 0 && ` ${number(report.legacy_without_payment)} imported player/event records have no matching payment evidence and are excluded.`}{report.unattributed > 0 && ` ${number(report.unattributed)} paid records have incomplete player/event details.`}</p>
    </>}
  </section>;
}
