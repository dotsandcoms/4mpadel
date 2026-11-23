import { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../../components/SearchableDropdown';
import { americanoStandings, validateAmericanoScore } from './utils/americano.js';
import { teamAmericanoStandings } from './utils/teamAmericano.js';

const SCORABLE = ['pending', 'scheduled', 'in_progress', 'completed'];

export default function HostRotationResults({ data, draw, client, act, busy, saving, error }) {
    const rotation = draw.scoring_rules.americano;
    const [round, setRound] = useState('all');
    const [review, setReview] = useState(null);
    const names = new Map(rotation.players.map(player => [player.id, player.name]));
    const pairName = pair => pair.map(id => names.get(id)).join(' / ');
    const matches = new Map(data.matches.filter(match => match.draw_id === draw.id).map(match => [match.americano_fixture_key, match]));
    const finished = draw.status === 'completed';
    const editable = Boolean(data.event.is_visible && !finished);
    const standings = rotation.variant === 'team' ? teamAmericanoStandings(rotation) : americanoStandings(rotation);
    const scored = rotation.fixtures.filter(fixture => matches.get(fixture.id)?.status === 'completed'
        && validateAmericanoScore(fixture.score, rotation.points)).length;
    const complete = scored > 0 && scored === rotation.fixtures.length && matches.size === rotation.fixtures.length;
    return <section className="tm-panel tm-stack" aria-label="Americano results">
        <div className="tm-between">
            <div><h3>Americano results</h3><p className="muted">{scored} of {rotation.fixtures.length} matches scored · {rotation.points} points per match</p></div>
            <label className="tm-field">Round<SearchableDropdown className="tm-input" value={round} onChange={event => setRound(event.target.value)}>
                <option value="all">All rounds</option>
                {Array.from({ length: rotation.rounds }, (_, index) => <option key={index + 1} value={index + 1}>Round {index + 1}</option>)}
            </SearchableDropdown></label>
        </div>
        <div className="tm-table-wrap"><table>
            <thead><tr><th>Round</th><th>Pair 1</th><th>Pair 2</th><th>Score</th>{editable && <th>Actions</th>}</tr></thead>
            <tbody>{rotation.fixtures.filter(fixture => round === 'all' || fixture.round === Number(round)).map(fixture => {
                const match = matches.get(fixture.id);
                return <tr key={fixture.id}>
                    <td>{fixture.round}</td><td>{pairName(fixture.one)}</td><td>{pairName(fixture.two)}</td>
                    <td>{fixture.score?.join('–') || 'Awaiting score'}</td>
                    {editable && <td>{SCORABLE.includes(match?.status) && <button className="tm-button quiet" disabled={busy}
                        onClick={() => setReview({ fixture, match })}>{match.status === 'completed' ? 'Correct score' : 'Enter score'}</button>}</td>}
                </tr>;
            })}</tbody>
        </table></div>
        <h4>{rotation.variant === 'team' ? 'Team standings' : 'Player standings'}</h4>
        <div className="tm-table-wrap"><table>
            <thead><tr><th>Position</th><th>{rotation.variant === 'team' ? 'Team' : 'Player'}</th><th>Played</th><th>Won</th><th>Points</th></tr></thead>
            <tbody>{standings.map(row => <tr key={row.id}><td>{row.position}</td><td>{row.name}</td><td>{row.played}</td><td>{row.won}</td><td>{row.points}</td></tr>)}</tbody>
        </table></div>
        {finished && <p className="tm-notice">This rotation is complete.</p>}
        {!finished && !editable && <p className="muted">Make the event public to record rotation scores.</p>}
        {editable && <div className="tm-between"><small>{!complete && 'Score every match to complete this rotation.'}</small>
            <button className="tm-button primary" disabled={busy || !complete} onClick={() => setReview({ complete: true })}>Complete rotation</button></div>}
        {review && <RotationReview key={review.match?.id || 'complete'} {...{ review, rotation, pairName, busy, saving, error }}
            onClose={() => setReview(null)} onSubmit={async (score, reason) => {
                const saved = review.complete
                    ? await act(() => client.completeRotation(data, draw), 'Americano rotation completed')
                    : await act(() => client.recordRotationScore(data, draw, review.match, score, reason), review.match.status === 'completed' ? 'Score corrected' : 'Score saved');
                if (saved) setReview(null);
                return saved;
            }} />}
    </section>;
}

function RotationReview({ review, rotation, pairName, busy, saving, error, onClose, onSubmit }) {
    const dialog = useRef(null);
    const [score, setScore] = useState(review.fixture?.score?.map(String) || ['', '']);
    const [reason, setReason] = useState('');
    const [failed, setFailed] = useState(false);
    const correcting = review.match?.status === 'completed';
    const valid = review.complete || (score.every(value => value.trim()) && validateAmericanoScore(score.map(Number), rotation.points)
        && (!correcting || reason.trim()));
    const title = review.complete ? 'Complete rotation' : correcting ? 'Correct score' : 'Enter score';
    useEffect(() => {
        const node = dialog.current;
        const previous = document.activeElement;
        node.showModal();
        return () => { node.close(); previous?.focus(); };
    }, []);
    return <dialog className="tm-dialog" ref={dialog} onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} aria-labelledby="host-rotation-review-title">
        <form className="tm-stack" onSubmit={async event => {
            event.preventDefault();
            if (!busy && valid) setFailed(!await onSubmit(score.map(Number), reason.trim()));
        }}>
            <div className="tm-between"><h2 id="host-rotation-review-title">{title}</h2>
                <button type="button" className="tm-button quiet" disabled={saving} onClick={onClose}>Cancel</button></div>
            {review.complete ? <p>Finish this rotation and lock its scores and standings.</p> : <>
                <p>Round {review.fixture.round} · Both pairs’ scores must add up to {rotation.points}.</p>
                <div className="tm-score-fields">{[review.fixture.one, review.fixture.two].map((pair, index) => <label className="tm-field" key={index}>
                    {pairName(pair)}<input className="tm-input" aria-label={`Pair ${index + 1} rally points`} type="number" min={0} max={rotation.points} step={1}
                        required value={score[index]} disabled={saving} onChange={event => setScore(current => current.map((value, i) => i === index ? event.target.value : value))} />
                </label>)}</div>
                {correcting && <label className="tm-field">Correction reason<input className="tm-input" required maxLength={500} value={reason}
                    disabled={saving} onChange={event => setReason(event.target.value)} /></label>}
            </>}
            {failed && <p role="alert" className="tm-notice">{error || 'The change could not be saved. Refresh the rotation and review it again.'}</p>}
            <button className="tm-button primary" type="submit" disabled={busy || !valid}>{review.complete ? 'Confirm completion' : 'Save score'}</button>
        </form>
    </dialog>;
}
