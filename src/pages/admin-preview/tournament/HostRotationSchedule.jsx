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
    const [draftPlan, setDraftPlan] = useState(null);
    const [confirmRemoval, setConfirmRemoval] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);
    const mounted = useRef(false);
    const draft = draw.status === 'draft';
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        if (!draft) return;
        let current = true;
        client.readDraftRotationSchedule(data, draw).then(plan => {
            if (!current) return;
            setDraftPlan(plan);
            if (Number.isInteger(plan.matchMinutes)) setMinutes(String(plan.matchMinutes));
            if (Number.isInteger(plan.restMinutes)) setRest(String(plan.restMinutes));
        }).catch(failure => { if (current) setError(failure.message); });
        return () => { current = false; };
    }, [client, data, draw, draft]);
    const booked = draft ? draftPlan?.bookings || [] : data.matches
        .filter(match => match.draw_id === draw.id && match.scheduled_start && match.scheduled_end)
        .map(match => ({ matchId: match.id, round: match.round_number, court: match.court_name, starts: match.scheduled_start }))
        .sort((one, two) => one.starts.localeCompare(two.starts) || one.court?.localeCompare(two.court));
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
            <h3>{draft ? 'Private Americano court schedule' : 'Americano court schedule'}</h3>
            <p className="muted">{booked.length} of {count} matches {draft ? 'planned privately' : 'booked'} · South Africa time (SAST)</p>
        </div>
        {booked.length > 0 && <details className="tm-backdraw-help">
            <summary>{draft ? 'Saved private court times' : 'Existing court bookings'}</summary>
            <ul>{booked.map(match => <li key={match.matchId}>Round {match.round} · {match.court} · {SAST.format(new Date(match.starts))}</li>)}</ul>
        </details>}
        {draftPlan?.stale && <p className="tm-notice">The draw changed. Review or remove the saved private court times before publishing.</p>}
        {(draft ? Boolean(draftPlan) : booked.length < count) && <>
            <p className="muted">{draft ? 'Plan court times for the private draw. The courts are reserved when the draw is published.' : 'Assign courts to the remaining rotation waves. Existing bookings are kept.'}</p>
            <div className="tm-field-row">
                <label className="tm-field">Americano match minutes<input className="tm-input" type="number" min={1} max={1440}
                    value={minutes} disabled={busy || previewing} onChange={updateTiming(setMinutes)} /></label>
                <label className="tm-field">Rest between rounds<input className="tm-input" type="number" min={0} max={1440}
                    value={rest} disabled={busy || previewing} onChange={updateTiming(setRest)} /></label>
            </div>
            <div className="tm-actions">
                <button className="tm-button" disabled={busy || previewing || !valid} onClick={reviewSchedule}>
                    {previewing ? 'Checking court times…' : 'Automatically assign courts & times'}
                </button>
                {draft && (draftPlan?.hasPlan || booked.length > 0) && <button className="tm-button quiet" disabled={busy}
                    onClick={() => setConfirmRemoval(true)}>Remove saved private court times</button>}
            </div>
        </>}
        {confirmRemoval && <div className="tm-notice">
            <p>Remove the saved court times from this draft?</p>
            <div className="tm-actions">
                <button className="tm-button" disabled={busy} onClick={async () => {
                    await act(() => client.discardDraftRotationSchedule(data, draw), 'Private court times removed');
                    if (mounted.current) setConfirmRemoval(false);
                }}>Remove court times</button>
                <button className="tm-button quiet" onClick={() => setConfirmRemoval(false)}>Cancel</button>
            </div>
        </div>}
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
                    await act(() => client.applyRotationSchedule(data, draw, Number(minutes), Number(rest), preview.review),
                        draft ? 'Private court times saved' : 'Rotation court schedule saved');
                    if (mounted.current) setPreview(null);
                }}>{draft ? 'Save private court times' : 'Save schedule'}</button>
                <button className="tm-button quiet" disabled={busy} onClick={() => setPreview(null)}>Discard preview</button>
            </div>
        </>}
    </section>;
}
