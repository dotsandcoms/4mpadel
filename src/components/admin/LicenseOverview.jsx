import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { licenseRpc } from '../../utils/licenses';
import { southAfricanToday } from '../../utils/licenseReporting';

const number = value => Number(value || 0).toLocaleString('en-ZA');
const date = value => value ? new Date(`${value.slice(0, 10)}T12:00:00+02:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : 'Not recorded';
const month = value => new Date(`${value}T12:00:00+02:00`).toLocaleDateString('en-ZA', { month: 'short', timeZone: 'Africa/Johannesburg' });
const seriesTypes = [
  { key: 'new_full', label: 'New Full', color: '#a1a1a6' },
  { key: 'renewals', label: 'Renewals', color: '#ccff00' },
  { key: 'temporary', label: 'Temporary', color: '#55555d' },
];

function SalesTooltip({ active, payload, label, temporaryOnly }) {
  if (!active || !payload?.length) return null;
  return <div className="license-chart-tooltip"><strong>{new Date(`${label}T12:00:00+02:00`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</strong>{payload.map(item => <div key={item.dataKey}><span style={{ color: item.dataKey === 'renewals' ? item.color : undefined }}>{item.name}</span><b>{number(item.value)}</b></div>)}{!temporaryOnly && <div className="license-tooltip-total"><span>Total sold</span><b>{number(payload.reduce((sum, item) => sum + Number(item.value || 0), 0))}</b></div>}</div>;
}

export function LicenseSalesChart({ series = [], temporaryOnly = false, runningTotal = false }) {
  const types = temporaryOnly ? [{ key: runningTotal ? 'cumulative' : 'sold', label: runningTotal ? 'Total sold by month end' : 'Temporary sold', color: '#ccff00' }] : seriesTypes;
  return <div className="license-sales-chart" role="img" aria-label={temporaryOnly ? (runningTotal ? 'Total temporary licenses sold by the end of each month' : 'Temporary licenses sold each month') : 'Licenses bought each month, split into new Full licenses, renewals and temporary licenses'}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={series} barSize={series.length > 16 ? undefined : 28} margin={{ top: 20, right: 8, left: -20, bottom: 4 }} accessibilityLayer>
      <CartesianGrid stroke="#ededed12" vertical={false} />
      <XAxis dataKey="month" tickFormatter={month} stroke="#a1a1a6" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickMargin={12} minTickGap={24} />
      <YAxis allowDecimals={false} stroke="#a1a1a6" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
      <Tooltip content={<SalesTooltip temporaryOnly={temporaryOnly} />} cursor={{ fill: '#ededed05' }} />
      {types.map((type, i) => <Bar key={type.key} name={type.label} dataKey={type.key} stackId="sales" fill={type.color} radius={i === types.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />)}
    </BarChart></ResponsiveContainer>
  </div>;
}

function LicenseYearSummary({ years, chosenYear, onYearChange, onRegister }) {
  const selected = years.find(row => String(row.license_year) === chosenYear) || years.find(row => Number(row.total_sold) > 0) || years[0];
  if (!selected) return <section className="license-surface license-empty">No Full license years are available</section>;
  const year = Number(selected.license_year);
  const view = (type, extra = {}) => onRegister({ year: String(year), type, status: '', search: '', source: '', purchase_year: '', renewed_from_year: '', ...extra });
  return <section className="license-surface license-cohort-panel" aria-labelledby="license-year-heading">
    <div className="license-cohort-heading"><div><h2 id="license-year-heading">{year} Full licenses</h2><p>All paid purchases for this license year · valid through {date(selected.ends_on)}</p></div><label className="license-year-select">License year<select className="license-input" value={year} onChange={e => onYearChange(e.target.value)}>{years.map(row => <option key={row.license_year} value={row.license_year}>{row.license_year}</option>)}</select></label></div>
    <div className="license-cohort-metrics">
      <button type="button" className="license-cohort-stat license-cohort-total" onClick={() => view('paid_full')}><span>Total {year} Full licenses sold</span><strong>{number(selected.total_sold)}</strong><small>New sales + all Full renewals</small></button>
      <button type="button" className="license-cohort-stat" onClick={() => view('renewal', { renewed_from_year: String(year - 1) })}><span>{year} renewals from {year - 1}</span><strong>{number(selected.renewals_from_previous_year)}</strong><small>Previous {year - 1} Full holders</small></button>
      <button type="button" className="license-cohort-stat" onClick={() => view('new_full')}><span>New {year} Full license sales</span><strong>{number(selected.new_full)}</strong><small>First Full license purchases</small></button>
    </div>
    {Number(selected.other_renewals) > 0 && <p className="license-cohort-exception">{number(selected.other_renewals)} additional {year} renewals are from earlier Full-license years and are included in the total</p>}
    <div className="license-cohort-purchases"><div><h3>When were these bought?</h3><p>The license year stays {year}, even when bought early</p></div><div className="license-purchase-flows">{selected.purchase_years.length ? selected.purchase_years.map(purchase => <button type="button" key={purchase.purchase_year} className="license-year-flow" onClick={() => view('paid_full', { purchase_year: String(purchase.purchase_year) })}><span><span>Bought in <b>{purchase.purchase_year}</b></span><ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /><span><b>{year}</b> license</span></span><strong>{number(purchase.total_sold)} sold</strong><ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" /></button>) : <p className="license-muted">No paid purchases recorded for this year</p>}</div></div>
    {(Number(selected.unverified) > 0 || Number(selected.complimentary) > 0) && <p className="license-cohort-note">Separate from paid sales: {number(selected.complimentary)} complimentary licenses · {number(selected.unverified)} records awaiting a verified payment match</p>}
    <p className="license-cohort-note">Select a figure to view matching licenses, purchase dates and exact validity dates</p>
  </section>;
}

export default function LicenseOverview({ year, onYearChange, years, refreshKey, onRegister, onTemporary }) {
  const [response, setResponse] = useState(null);
  const [licenseYear, setLicenseYear] = useState('');
  const requestKey = `${year}:${refreshKey}`;
  const loading = response?.requestKey !== requestKey;
  const report = loading ? null : response?.data;
  const error = loading ? '' : response?.error;
  useEffect(() => {
    let live = true;
    licenseRpc('license_sales_overview', { p_year: year ? Number(year) : null })
      .then(data => { if (live) setResponse({ requestKey, data }); })
      .catch(e => { if (live) setResponse({ requestKey, error: e.message }); });
    return () => { live = false; };
  }, [year, refreshKey, requestKey]);

  const total = Number(report?.total_sold || 0);
  const latest = report?.series?.at(-1);
  const prior = report?.series?.at(-2);
  const monthInProgress = latest?.month.slice(0, 7) === southAfricanToday().slice(0, 7);
  const difference = latest && prior && !monthInProgress ? Number(latest.total) - Number(prior.total) : null;
  const period = year ? `Bought in ${year}` : 'All purchase dates';
  const licenseYears = report?.license_years || [];
  const purchaseRows = licenseYears.flatMap(cohort => cohort.purchase_years.map(purchase => ({ ...purchase, license_year: cohort.license_year })));
  function download() {
    const rows = [['Purchase month', 'New Full licenses', 'Full renewals', 'Temporary licenses', 'Total paid licenses', 'With completed refunds'], ...report.series.map(row => [row.month, row.new_full, row.renewals, row.temporary, row.total, row.refunded])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `4M-license-sales-${year || 'all-time'}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <section className="license-overview" aria-label="License sales overview" aria-busy={loading}>
    {error && <div role="alert" className="license-error"><strong>Sales could not load</strong><p>{error}</p></div>}
    {!error && (!report ? <div className="license-loading" role="status">Loading license sales…</div> : <>
      <LicenseYearSummary years={licenseYears} chosenYear={licenseYear} onYearChange={setLicenseYear} onRegister={onRegister} />
      <div className="license-purchase-heading"><div><h2>Sales by purchase date</h2><p>{period} · all license years, including early purchases</p></div><label className="license-year-select">Bought in<select className="license-input" value={year} onChange={e => onYearChange(e.target.value)}><option value="">All years</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
      <div className="license-metrics license-purchase-metrics">{[
        ['Total paid licenses', report.total_sold, 'Full + temporary'],
        ['New Full purchases', report.new_full, 'Across all license years'],
        ['Full renewal purchases', report.renewals, 'Across all license years'],
        ['Temporary purchases', report.temporary, 'One player, one event'],
      ].map(([label, value, caption]) => <article className="license-metric" key={label}><p className="license-metric-heading">{label}</p><p className="license-metric-value">{number(value)}</p><p className="license-metric-description">{caption}</p></article>)}</div>

      <div className="license-analytics-grid">
        <section className="license-surface license-trend"><div className="license-panel-heading"><div><h3>Monthly purchases</h3><p>{period} · paid license units</p></div><button type="button" className="license-icon-button" onClick={download} aria-label="Export monthly license sales"><Download size={16} strokeWidth={1.5} /></button></div><div className="license-chart-legend">{seriesTypes.map(type => <span key={type.key}><i style={{ background: type.color }} />{type.label}</span>)}</div><LicenseSalesChart series={report.series} /><div className="license-chart-footer"><span>{latest ? `${month(latest.month)}: ${number(latest.total)} bought${monthInProgress ? ' so far' : ''}` : 'No purchases yet'}</span>{monthInProgress ? <span>Month still in progress</span> : difference !== null && <span className={difference >= 0 ? 'license-change-positive' : 'license-change-neutral'}>{difference >= 0 ? <ArrowUpRight size={16} strokeWidth={1.5} /> : <ArrowDownRight size={16} strokeWidth={1.5} />}{number(Math.abs(difference))} {difference >= 0 ? 'more' : 'fewer'} than previous month</span>}</div></section>
        <section className="license-surface license-sales-mix"><div className="license-panel-heading"><div><h3>Purchase breakdown</h3><p>{period}</p></div></div><div className="license-mix-total"><strong>{number(total)}</strong><span>paid licenses</span></div><div className="license-mix-bar" aria-hidden="true">{seriesTypes.map(type => <span key={type.key} style={{ width: `${total ? Number(report[type.key] || 0) / total * 100 : 0}%`, background: type.color }} />)}</div><div className="license-mix-rows">{seriesTypes.map(type => <div key={type.key}><span><i style={{ background: type.color }} />{type.label}</span><strong>{number(report[type.key])}</strong><small>{total ? Math.round(Number(report[type.key] || 0) / total * 100) : 0}%</small></div>)}</div><div className="license-full-total"><div><strong>{number(report.full_sold)} Full purchases</strong><span>{number(report.new_full)} new + {number(report.renewals)} renewals</span></div></div></section>
      </div>

      <div className="license-alltime-strip"><div><p>Temporary licenses · all purchase dates</p><strong>{number(report.all_time_temporary)} <span>sold in total</span></strong></div><p>One paid license per player and event</p><button type="button" className="license-button license-button-secondary" onClick={onTemporary}>View temporary sales <ArrowUpRight size={16} strokeWidth={1.5} /></button></div>

      <div className="license-analytics-grid license-bottom-grid"><section className="license-surface"><div className="license-panel-heading"><div><h3>Purchase year and license year</h3><p>Full licenses across all purchase dates</p></div><button type="button" className="license-text-button" onClick={() => onRegister({ year: '', purchase_year: '', type: 'paid_full', status: '', source: '', search: '', renewed_from_year: '' })}>View paid Full licenses <ArrowUpRight size={16} strokeWidth={1.5} /></button></div><div className="license-table-scroll"><table className="license-table license-year-table"><thead><tr><th>Bought in</th><th>License year</th><th className="numeric">New Full</th><th className="numeric">Renewed</th><th className="numeric">Total sold</th></tr></thead><tbody>{purchaseRows.map(row => <tr key={`${row.license_year}-${row.purchase_year}`}><td>{row.purchase_year}</td><td>{row.license_year} Full</td><td className="numeric">{number(row.new_full)}</td><td className="numeric">{number(Number(row.renewals_from_previous_year) + Number(row.other_renewals))}</td><td className="numeric license-table-emphasis">{number(row.total_sold)}</td></tr>)}</tbody></table>{!purchaseRows.length && <p className="license-empty">No paid Full purchases recorded</p>}</div><p className="license-table-note">Bought in 2026 → 2027 license means an early purchase for the 2027 license year</p></section><section className="license-surface license-counting-notes"><div className="license-panel-heading"><div><h3>Other records</h3><p>{period}</p></div></div><div><span>Complimentary licenses</span><strong>{number(report.complimentary)}</strong></div><div><span>Sales with completed refunds</span><strong>{number(report.refunded)}</strong></div><p>Free licenses are excluded from sold totals. Refunded sales remain in the paid totals and are shown separately here.</p>{report.unverified_full > 0 && <p className="license-review-note">{number(report.unverified_full)} Full records {year ? `for license year ${year}` : ''} await a verified payment match and are excluded from paid totals</p>}</section></div>
      <p className="license-footnote">License year identifies the Full license purchased. Purchase date records when it was bought. Valid-from/to dates show when the player is covered.</p>
    </>)}
  </section>;
}
