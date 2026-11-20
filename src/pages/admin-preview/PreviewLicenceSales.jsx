import { useEffect, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { southAfricanToday } from '../../utils/licenseReporting';
import { licenseCsvCell, licenseDate } from './licenseData';

const number = value => Number(value || 0).toLocaleString('en-ZA');
const categories = [
  ['new_full', 'New Full'],
  ['renewals', 'Full renewals'],
  ['temporary', 'Temporary'],
];

export function LicenceSalesOverview({ read, years, year, onYearChange, onRegister, onTemporary, download }) {
  const [response, setResponse] = useState(null);
  const [retry, setRetry] = useState(0);
  const [selectedYear, setSelectedYear] = useState('');
  const key = `${year}:${retry}`;
  useEffect(() => {
    const request = new AbortController();
    read('license_sales_overview', { p_year: year ? Number(year) : null }, request.signal)
      .then(report => { if (!request.signal.aborted) setResponse({ key, report }); })
      .catch(error => { if (!request.signal.aborted) setResponse({ key, error: error.message }); });
    return () => request.abort();
  }, [key, year, read]);
  if (response?.key !== key) return <p role="status">Loading licence sales…</p>;
  if (response.error) return <section role="alert"><p>{response.error}</p><button className="ap-secondary" onClick={() => setRetry(n => n + 1)}>Retry sales overview</button></section>;

  const { report } = response;
  const cohorts = report.license_years || [];
  const cohort = cohorts.find(row => String(row.license_year) === selectedYear)
    || cohorts.find(row => row.total_sold > 0) || cohorts[0];
  const periods = report.series || [];
  const maxSales = Math.max(1, ...periods.map(row => Number(row.total) || 0));
  const register = (type, options) => onRegister({ type, ...options });
  const exportMonthly = () => {
    const rows = [
      ['Purchase month', 'New Full', 'Full renewals', 'Temporary', 'Total paid', 'Completed refunds'],
      ...periods.map(row => [row.month, row.new_full, row.renewals, row.temporary, row.total, row.refunded]),
    ];
    download('\uFEFF' + rows.map(row => row.map(licenseCsvCell).join(',')).join('\r\n'), `4M-licence-sales-${year || 'all-time'}.csv`);
  };

  return <section className="lw-sales-overview">
    {cohort && <section className="lw-editor">
      <header className="lw-actions"><div><h2>{cohort.license_year} Full licences</h2><p>Paid purchases by coverage year · valid through {licenseDate(cohort.ends_on)}</p></div>
        <label className="lw-field"><span>Licence year</span><SearchableDropdown value={String(cohort.license_year)} onChange={e => setSelectedYear(e.target.value)}>
          {cohorts.map(row => <option key={row.license_year} value={String(row.license_year)}>{row.license_year}</option>)}
        </SearchableDropdown></label>
      </header>
      <div className="lw-sales-cards">{[
        ['All paid Full licences', 'total_sold', 'paid_full', {}],
        [`Renewals from ${cohort.license_year - 1}`, 'renewals_from_previous_year', 'renewal', { renewed_from_year: String(cohort.license_year - 1) }],
        ['New Full licences', 'new_full', 'new_full', {}],
      ].map(([label, field, type, extra]) => <button key={field} className="ap-secondary" onClick={() => register(type, { year: String(cohort.license_year), ...extra })}>
        <span>{label}</span><strong>{number(cohort[field])}</strong>
      </button>)}</div>
      <div className="lw-actions">{(cohort.purchase_years || []).map(row => <button type="button" className="ap-secondary" key={row.purchase_year}
        onClick={() => register('paid_full', { year: String(cohort.license_year), purchase_year: String(row.purchase_year) })}>
        Bought in {row.purchase_year} · {number(row.total_sold)} sold
      </button>)}</div>
      {cohort.other_renewals > 0 && <p>{number(cohort.other_renewals)} renewals from earlier Full licence years are included in the total.</p>}
      {(cohort.unverified > 0 || cohort.complimentary > 0) && <p>{number(cohort.complimentary)} complimentary · {number(cohort.unverified)} awaiting verified payment</p>}
    </section>}
    <header className="lw-actions"><div><h2>Sales by purchase date</h2><p>Across all licence years, including early purchases.</p></div>
      <label className="lw-field"><span>Bought in</span><SearchableDropdown value={year} onChange={event => onYearChange(event.target.value)}>
        <option value="">All years</option>{years.map(value => <option value={String(value)} key={value}>{value}</option>)}
      </SearchableDropdown></label>
    </header>
    <div className="lw-counts">{[['total_sold', 'Total paid licences'], ...categories].map(([field, label]) => <div key={field}><small>{label}</small><strong>{number(report[field])}</strong></div>)}</div>
    <section className="lw-editor">
      <header className="lw-actions"><h3>Monthly purchases</h3><button className="ap-secondary" onClick={exportMonthly} disabled={!periods.length}>Export monthly sales</button></header>
      <div className="lw-chart" aria-label="Total paid licences by month">{periods.map(row => <div key={row.month}>
        <span>{licenseDate(row.month)}</span><meter min="0" max={maxSales} value={Number(row.total)} aria-label={`Licences bought in ${licenseDate(row.month)}`} /><strong>{number(row.total)}</strong>
      </div>)}</div>
      <div className="lw-scroll"><table aria-label="Monthly licence purchases"><thead><tr><th>Purchase month</th>{categories.map(([key, label]) => <th key={key}>{label}</th>)}<th>Total paid</th><th>Refunded</th></tr></thead>
        <tbody>{periods.map(row => <tr key={row.month}><td>{licenseDate(row.month)}</td>{[...categories, ['total'], ['refunded']].map(([key]) => <td key={key}>{number(row[key])}</td>)}</tr>)}</tbody>
      </table></div>
      {!periods.length && <p>No monthly purchases found.</p>}
    </section>
    <section className="lw-editor">
      <header className="lw-actions"><h3>Purchase year and licence year</h3><button className="ap-secondary" onClick={() => register('paid_full')}>View paid Full licences</button></header>
      <div className="lw-scroll"><table aria-label="Licence purchase cohorts"><thead><tr><th>Bought in</th><th>Licence year</th><th>New Full</th><th>Renewed</th><th>Total sold</th></tr></thead>
        <tbody>{cohorts.flatMap(group => (group.purchase_years || []).map(row => <tr key={`${group.license_year}-${row.purchase_year}`}>
          <td>{row.purchase_year}</td><td>{group.license_year}</td><td>{number(row.new_full)}</td>
          <td>{number(Number(row.renewals_from_previous_year || 0) + Number(row.other_renewals || 0))}</td><td>{number(row.total_sold)}</td>
        </tr>))}</tbody></table></div>
      <p>{number(report.complimentary)} complimentary · {number(report.refunded)} with completed refunds · {number(report.unverified_full)} Full records awaiting verification</p>
    </section>
    <div className="lw-actions"><p><strong>{number(report.all_time_temporary)}</strong> temporary licences sold across all purchase dates</p>
      <button className="ap-secondary" onClick={onTemporary}>View temporary sales</button></div>
  </section>;
}

export function LicenceFederationExport({ read, year, seasons, isCurrent, onClose }) {
  const today = southAfricanToday();
  const initialYear = year || today.slice(0, 4);
  const [form, setForm] = useState({
    from: `${initialYear}-01-01`, to: year && year !== today.slice(0,4) ? `${year}-12-31` : today,
    licenceYear: '', type: '',
  });
  const [status, setStatus] = useState({});
  const patch = (name, value) => { setForm(previous => ({ ...previous, [name]: value })); setStatus({}); };
  async function download(event) {
    event.preventDefault();
    if (status.busy) return;
    setStatus({ busy: true });
    try {
      const report = await read('license_federation_sales_export', {
        p_from: form.from, p_to: form.to, p_license_year: form.licenceYear ? Number(form.licenceYear) : null, p_type: form.type || null,
      });
      const { buildLicenseSalesWorkbook } = await import('../../utils/licenseSalesExport');
      const buffer = await buildLicenseSalesWorkbook(report).xlsx.writeBuffer();
      if (!isCurrent()) return;
      const { saveAs } = await import('file-saver');
      if (!isCurrent()) return;
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `4M-federation-licence-sales-${form.from}-${form.to}.xlsx`);
      setStatus({ message: `Excel prepared with ${number(report.total_sold)} licences.` });
    } catch (error) {
      if (isCurrent()) setStatus({ error: error.message || 'Could not prepare Excel.' });
    }
  }
  return <section className="lw-editor" aria-busy={status.busy}>
    <header className="lw-actions"><div><h2>Federation sales report</h2><p>Monthly totals, prices and individual sales.</p></div>
      <button className="ap-secondary" type="button" disabled={status.busy} onClick={onClose}>Close Excel export</button></header>
    <form onSubmit={download}>
      <div className="lw-filters">
        <label className="lw-field"><span>Bought from</span><input type="date" required max={form.to} value={form.from} onChange={e => patch('from', e.target.value)} /></label>
        <label className="lw-field"><span>Bought through</span><input type="date" required min={form.from} value={form.to} onChange={e => patch('to', e.target.value)} /></label>
        <label className="lw-field"><span>Licence year</span><SearchableDropdown value={form.licenceYear} onChange={e => patch('licenceYear', e.target.value)}>
          <option value="">All licence years</option>{seasons.map(season => <option key={season.year} value={String(season.year)}>{season.year}</option>)}
        </SearchableDropdown></label>
        <label className="lw-field"><span>Licence type</span><SearchableDropdown value={form.type} onChange={e => patch('type', e.target.value)}>
          <option value="">All paid licences</option><option value="full">Full · new and renewed</option><option value="new_full">New Full</option><option value="renewal">Full renewals</option><option value="temporary">Temporary</option>
        </SearchableDropdown></label>
      </div>
      <button className="ap-primary" disabled={status.busy || !form.from || !form.to || form.to < form.from}>{status.busy ? 'Preparing Excel…' : 'Download Excel (.xlsx)'}</button>
      {status.error && <p role="alert">{status.error}</p>}{status.message && <p role="status">{status.message}</p>}
    </form>
  </section>;
}
