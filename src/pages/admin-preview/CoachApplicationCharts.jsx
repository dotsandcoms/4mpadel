const dateKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Johannesburg' });
const dateText = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' });

function recordedDays(rows) {
  const dates = new Map();
  for (const row of rows) {
    if (!row.created_at) continue;
    const date = new Date(row.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const parts = Object.fromEntries(dateKey.formatToParts(date).map(part => [part.type, part.value]));
    const key = `${parts.year.padStart(4, '0')}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')}`;
    const existing = dates.get(key);
    dates.set(key, { key, label: dateText.format(date), count: (existing?.count || 0) + 1 });
  }
  return [...dates.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-14);
}

export default function CoachApplicationCharts({ rows }) {
  const days = recordedDays(rows);
  const highest = Math.max(1, ...days.map(day => day.count));
  const statuses = [['approved', 'Approved'], ['pending', 'Pending'], ['rejected', 'Rejected']].map(([key, name]) => ({
    key, name, count: rows.filter(row => row.status === key).length,
  }));
  return <div className="co-charts" aria-label="Coach application charts">
    <figure className="ap-section co-chart">
      <figcaption>Application status</figcaption>
      <ul className="co-chart-rows">
        {statuses.map(item => <li key={item.key}><span>{item.name}</span><div className="co-chart-track" aria-hidden="true">
          <div className={`co-chart-value co-chart-${item.key}`} style={{ width: `${rows.length ? item.count / rows.length * 100 : 0}%` }} />
        </div><strong>{item.count}</strong></li>)}
      </ul>
    </figure>
    <figure className="ap-section co-chart">
      <figcaption>Recent applications</figcaption>
      <p className="co-chart-description">Last 14 recorded application days</p>
      {days.length ? <ul className="co-chart-rows">
        {days.map(day => <li key={day.key}><time dateTime={day.key}>{day.label}</time><div className="co-chart-track" aria-hidden="true">
          <div className="co-chart-value co-chart-days" style={{ width: `${day.count / highest * 100}%` }} />
        </div><strong>{day.count}</strong></li>)}
      </ul> : <p className="co-chart-description">No application dates recorded.</p>}
    </figure>
  </div>;
}
