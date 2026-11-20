import { useEffect, useRef, useState } from 'react';

const SAST = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export default function HostRotationSchedule({ data, draw, client, act, busy }) {
    const [minutes, setMinutes] = useState('15');
    const [rest, setRest] = useState('5');
    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);
    const mounted = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const booked = data.matches.filter(match => match.draw_id === draw.id && match.scheduled_start && match.scheduled_end)
        .sort((one, two) => one.scheduled_start.localeCompare(two.scheduled_start) || one.court_name?.localeCompare(two.court_name));
    const count = draw.scoring_rules.americano.fixtures.length;
    const valid = Boolean(minutes.trim() && rest.trim()) && Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440
        && Number.isInteger(Number(rest)) && Number(rest) >= 0 && Number(rest) <= 1440;
    const updateTiming = setter => event => { setter(event.target.value); setPreview(null); setError(''); };
    const reviewSchedule = async () => {
        if (pending.current || !valid || busy) return;
        pending.current = true;
        setPreviewing(true);
        setPreview(null);
        setError('');
        try {
            const result = await client.previewRotationSchedule(data, draw, Number(minutes), Number(rest));
            if (mounted.current) setPreview(result);
        } catch (failure) {
            if (mounted.current) setError(failure.message);
        } finally {
            pending.current = false;
            if (mounted.current) setPreviewing(false);
        }
    };

    return <section className="tm-panel tm-stack" aria-label="Americano court schedule">
        <div>
            <h3>Americano court schedule</h3>
            <p className="muted">{booked.length} of {count} matches booked · South Africa time (SAST)</p>
        </div>
        {booked.length > 0 && <details className="tm-backdraw-help">
            <summary>Existing court bookings</summary>
            <ul>{booked.map(match => <li key={match.id}>Round {match.round_number} · {match.court_name} · {SAST.format(new Date(match.scheduled_start))}</li>)}</ul>
        </details>}
        {booked.length < count && <>
            <p className="muted">Assign courts to the remaining rotation waves. Existing bookings are kept.</p>
            <div className="tm-field-row">
                <label className="tm-field">Americano match minutes<input className="tm-input" type="number" min={1} max={1440}
                    value={minutes} disabled={busy || previewing} onChange={updateTiming(setMinutes)} /></label>
                <label className="tm-field">Rest between rounds<input className="tm-input" type="number" min={0} max={1440}
                    value={rest} disabled={busy || previewing} onChange={updateTiming(setRest)} /></label>
            </div>
            <div><button className="tm-button" disabled={busy || previewing || !valid} onClick={reviewSchedule}>
                {previewing ? 'Checking court times…' : 'Automatically assign courts & times'}
            </button></div>
        </>}
        {error && <p role="alert" className="tm-notice">{error}</p>}
        {preview && preview.bookings.length === 0 && <p role="status">Every rotation match already has a court time.</p>}
        {preview?.bookings.length > 0 && <>
            <div className="tm-table-wrap"><table aria-label="Reviewed rotation court times">
                <thead><tr><th>Round</th><th>Wave</th><th>Court</th><th>Starts (SAST)</th><th>Finishes (SAST)</th></tr></thead>
                <tbody>{preview.bookings.map(row => <tr key={row.matchId}><td>{row.round}</td><td>{row.wave}</td><td>{row.court}</td>
                    <td>{SAST.format(new Date(row.starts))}</td><td>{SAST.format(new Date(row.finishes))}</td></tr>)}</tbody>
            </table></div>
            <div className="tm-actions">
                <button className="tm-button primary" disabled={busy} onClick={async () => {
                    await act(() => client.applyRotationSchedule(data, draw, Number(minutes), Number(rest), preview.review), 'Rotation court schedule saved');
                    if (mounted.current) setPreview(null);
                }}>Save schedule</button>
                <button className="tm-button quiet" disabled={busy} onClick={() => setPreview(null)}>Discard preview</button>
            </div>
        </>}
    </section>;
}
