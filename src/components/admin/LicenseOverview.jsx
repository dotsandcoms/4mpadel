import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, CreditCard, Download, RefreshCw, ShieldCheck, Ticket } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { licenseRpc } from '../../utils/licenses';

const number = value => Number(value || 0).toLocaleString('en-ZA');
const month = value => new Date(`${value}T12:00:00+02:00`).toLocaleDateString('en-ZA', { month: 'short', timeZone: 'Africa/Johannesburg' });
const seriesTypes = [
  { key: 'new_full', label: 'New Full', color: '#ccff00' },
  { key: 'renewals', label: 'Renewals', color: '#6acbb9' },
  { key: 'temporary', label: 'Temporary', color: '#a8a3f5' },
];

function SalesTooltip({ active, payload, label, temporaryOnly }) {
  if (!active || !payload?.length) return null;
  return <div className="license-chart-tooltip"><strong>{new Date(`${label}T12:00:00+02:00`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</strong>{payload.map(item => <div key={item.dataKey}><span style={{ color: item.color }}>{item.name}</span><b>{number(item.value)}</b></div>)}{!temporaryOnly && <div className="license-tooltip-total"><span>Total sold</span><b>{number(payload.reduce((sum, item) => sum + Number(item.value || 0), 0))}</b></div>}</div>;
}

export function LicenseSalesChart({ series = [], temporaryOnly = false, runningTotal = false }) {
  const types = temporaryOnly ? [{ key: runningTotal ? 'cumulative' : 'sold', label: runningTotal ? 'Total sold by month end' : 'Temporary sold', color: '#a8a3f5' }] : seriesTypes;
  return <div className="license-sales-chart" role="img" aria-label={temporaryOnly ? (runningTotal ? 'Total temporary licenses sold by the end of each month' : 'Temporary licenses sold each month') : 'Monthly license sales, split into new Full licenses, renewals and temporary licenses'}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={series} barSize={series.length > 16 ? undefined : 28} margin={{ top: 20, right: 6, left: -20, bottom: 4 }} accessibilityLayer>
      <CartesianGrid stroke="#ffffff10" vertical={false} />
      <XAxis dataKey="month" tickFormatter={month} stroke="#a1a1aa" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickMargin={14} minTickGap={22} />
      <YAxis allowDecimals={false} stroke="#a1a1aa" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
      <Tooltip content={<SalesTooltip temporaryOnly={temporaryOnly} />} cursor={{ fill: '#ffffff05' }} />
      {types.map((type, i) => <Bar key={type.key} name={type.label} dataKey={type.key} stackId="sales" fill={type.color} radius={i === types.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />)}
    </BarChart></ResponsiveContainer>
  </div>;
}

function Metric({ label, value, description, icon: Icon, tone }) {
  return <article className={`license-metric license-metric-${tone}`}><div className="license-metric-heading"><span>{label}</span>{React.createElement(Icon, { size: 19, strokeWidth: 1.7, 'aria-hidden': true })}</div><p className="license-metric-value">{number(value)}</p><p className="license-metric-description">{description}</p></article>;
}

export default function LicenseOverview({ year, onYearChange, years, refreshKey, onRegister, onTemporary }) {
  const [response, setResponse] = useState(null);
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
  const difference = latest && prior ? Number(latest.total) - Number(prior.total) : null;
  const period = year || 'All time';
  const full = Number(report?.full_sold || 0);
  function download() {
    const rows = [['Month', 'New Full licenses', 'Full renewals', 'Temporary licenses', 'Total paid licenses', 'With completed refunds'], ...report.series.map(row => [row.month, row.new_full, row.renewals, row.temporary, row.total, row.refunded])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `4M-license-sales-${year || 'all-time'}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <section className="license-overview" aria-label="License sales overview" aria-busy={loading}>
    <div className="license-section-heading"><div><p className="license-eyebrow">The bigger picture</p><h2>Every license. A clearer picture.</h2><p>See what sold, who came back and how sales are moving.</p></div><label className="license-year-select">Sales year<select className="license-input" value={year} onChange={e => onYearChange(e.target.value)}><option value="">All time</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label></div>
    <p className="license-period-note"><span className="license-live-dot" />{year ? `Purchased in ${year}` : 'All recorded purchases'}<span>Includes licenses bought early for a future year.</span>{loading && <span role="status">Loading sales…</span>}</p>
    {error && <div role="alert" className="license-error"><strong>Sales overview could not load.</strong><p>{error}</p></div>}
    {!error && (!report ? <div className="license-loading" role="status">Building your sales overview…</div> : <>
      <div className="license-metrics">
        <article className="license-metric license-metric-total"><div className="license-metric-heading"><span>Total licenses sold</span><CreditCard size={20} aria-hidden="true" /></div><p className="license-metric-value">{number(total)}</p><div className="license-total-bottom"><span>{period} · paid licenses</span><span className="license-total-check"><Check size={13} />Verified sales</span></div></article>
        <Metric label="New Full licenses" value={report.new_full} description="First Full license purchases" icon={ShieldCheck} tone="full" />
        <Metric label="Full renewals" value={report.renewals} description="Previous Full holders buying again" icon={RefreshCw} tone="renewal" />
        <Metric label="Temporary licenses" value={report.temporary} description="One player, one event, one sale" icon={Ticket} tone="temporary" />
      </div>

      <div className="license-analytics-grid">
        <section className="license-surface license-trend"><div className="license-panel-heading"><div><h3>Sales, month by month</h3><p>{period} · number of paid licenses</p></div><button type="button" className="license-icon-button" onClick={download} aria-label="Export monthly license sales"><Download size={17} /></button></div><div className="license-chart-legend">{seriesTypes.map(type => <span key={type.key}><i style={{ background: type.color }} />{type.label}</span>)}</div><LicenseSalesChart series={report.series} /><div className="license-chart-footer"><span>{latest ? `${month(latest.month)}: ${number(latest.total)} sold` : 'No sales yet'}{year && Number(year) === new Date().getFullYear() ? ' so far' : ''}</span>{difference !== null && <span className={difference >= 0 ? 'license-change-positive' : 'license-change-neutral'}>{difference >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{number(Math.abs(difference))} {difference >= 0 ? 'more' : 'fewer'} than previous month{year && Number(year) === new Date().getFullYear() ? ' · month in progress' : ''}</span>}</div></section>
        <section className="license-surface license-sales-mix"><div className="license-panel-heading"><div><h3>What makes up the total?</h3><p>{period} · paid sales breakdown</p></div></div><div className="license-mix-total"><strong>{number(total)}</strong><span>licenses sold</span></div><div className="license-mix-bar" aria-hidden="true">{seriesTypes.map(type => <span key={type.key} style={{ width: `${total ? Number(report[type.key] || 0) / total * 100 : 0}%`, background: type.color }} />)}</div><div className="license-mix-rows">{seriesTypes.map(type => <div key={type.key}><span><i style={{ background: type.color }} />{type.label === 'New Full' ? 'New Full licenses' : type.label}</span><strong>{number(report[type.key])}</strong><small>{total ? Math.round(Number(report[type.key] || 0) / total * 100) : 0}%</small></div>)}</div><div className="license-full-total"><ShieldCheck size={19} /><div><strong>{number(full)} Full licenses sold</strong><span>{number(report.new_full)} new + {number(report.renewals)} renewals</span></div></div></section>
      </div>

      <div className="license-alltime-strip"><div className="license-alltime-icon"><Ticket size={24} strokeWidth={1.5} /></div><div><p>Temporary licenses · all time</p><strong>{number(report.all_time_temporary)} <span>sold in total</span></strong></div><p>Every paid event license, across all years.<br />Split checkout records count once.</p><button type="button" className="license-button license-button-secondary" onClick={onTemporary}>Explore temporary sales <ArrowUpRight size={15} /></button></div>

      <div className="license-analytics-grid license-bottom-grid"><section className="license-surface"><div className="license-panel-heading"><div><h3>Full licenses by coverage year</h3><p>All purchases for each license year, including early sales.</p></div><button type="button" className="license-text-button" onClick={onRegister}>View register <ArrowUpRight size={15} /></button></div><div className="license-table-scroll"><table className="license-table"><thead><tr><th>License year</th><th className="numeric">New Full</th><th className="numeric">Renewals</th><th className="numeric">Total sold</th><th className="numeric">Free / unverified</th></tr></thead><tbody>{report.seasons.map(season => <tr key={season.season_year}><td><span className="license-season-tag">{season.season_year}</span></td><td className="numeric">{number(season.new_full)}</td><td className="numeric">{number(season.renewals)}</td><td className="numeric license-table-emphasis">{number(Number(season.new_full) + Number(season.renewals))}</td><td className="numeric license-muted">{number(season.complimentary)} / {number(season.unverified)}</td></tr>)}</tbody></table>{!report.seasons.length && <p className="license-empty">No Full licenses issued yet.</p>}</div></section><section className="license-surface license-counting-notes"><div className="license-panel-heading"><div><h3>Beyond paid sales</h3><p>{period}</p></div></div><div><span>Complimentary licenses</span><strong>{number(report.complimentary)}</strong></div><div><span>Sales with completed refunds</span><strong>{number(report.refunded)}</strong></div><p>Free licenses are separate. Refunded sales stay in the sold totals and are counted above.</p>{report.unverified_full > 0 && <p className="license-review-note">{number(report.unverified_full)} Full records {year ? `for coverage year ${year}` : ''} have no verified payment match. These are excluded from sold totals.</p>}</section></div>
      <p className="license-footnote">A renewal means a previous Full holder bought another Full license. Sales count licenses, not payment rows. Temporary-only players buying their first Full license count as new Full holders.</p>
    </>)}
  </section>;
}
