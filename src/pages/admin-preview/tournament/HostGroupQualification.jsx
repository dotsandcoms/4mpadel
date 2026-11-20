import { useState } from 'react';
import DrawBracketPreview from './DrawBracketPreview';
import { generateElimination } from './utils/tournament/draws';

const RESOLVED_GROUP = ['completed', 'walkover', 'retired'];

export default function HostGroupQualification({ data, draw, client, act, busy }) {
    const [preview, setPreview] = useState(null);
    const [reviewed, setReviewed] = useState(false);
    const [error, setError] = useState('');
    const matches = data.matches.filter(match => match.draw_id === draw.id && match.stage === 'group');
    const entries = new Map(data.entries.filter(entry => entry.draw_id === draw.id).map(entry => [entry.id, entry]));
    const standings = data.standings.filter(standing => standing.draw_id === draw.id);
    const groupIds = [...new Set([...entries.values()].map(entry => entry.group_id).filter(Boolean))].sort();
    const groupMatchIds = new Set(matches.map(match => match.id));
    const latestReview = JSON.stringify([
        matches.map(match => [match.id, match.updated_at]),
        data.sets.filter(set => groupMatchIds.has(set.match_id)).map(set => [set.id, set.entry_one_games, set.entry_two_games, set.is_match_tiebreak]),
        standings.map(standing => [standing.group_id, standing.entry_id, standing.position, standing.requires_manual_resolution]),
    ]);
    const planned = preview?.revision === latestReview ? preview.matches : null;
    const rules = draw.scoring_rules || {};
    const hasPlate = Array.isArray(rules.plate_mode) ? rules.plate_mode.length > 0 : Boolean(rules.plate_mode && rules.plate_mode !== 'none');
    const extended = (rules.qualification?.mode || 'fixed') !== 'fixed' || hasPlate || (rules.playoff_mode || 'none') !== 'none';
    const resolved = matches.length > 0 && matches.every(match => RESOLVED_GROUP.includes(match.status));
    const tied = standings.some(standing => standing.requires_manual_resolution);
    const qualifiers = groupIds.map(groupId => standings
        .filter(standing => standing.group_id === groupId && standing.position <= draw.advancers_per_group)
        .sort((first, second) => first.position - second.position));
    const ready = resolved && !tied && groupIds.length === Number(draw.group_count)
        && qualifiers.every(group => group.length === Number(draw.advancers_per_group));
    const makePreview = () => {
        try {
            setPreview({ revision: latestReview, matches: generateElimination(data, draw) });
            setReviewed(false);
            setError('');
        } catch (failure) { setError(failure.message); }
    };

    return <section className="tm-panel tm-stack" aria-label="Elimination phase">
        <h3>Elimination phase</h3>
        {extended ? <p className="muted">This division’s qualification or placement rules require an assigned Tournament Manager account.</p>
            : !resolved ? <p className="muted">Finish all group matches to review their qualifiers.</p>
                : !ready ? <p className="muted">Resolve ties and refresh the final group standings to continue.</p>
                    : <>
                        <p className="muted">Review the qualifying teams and their bracket. Reserved court times carry over.</p>
                        <ul>{qualifiers.map((group, index) => <li key={groupIds[index]}>Group {index + 1} · {group.map(standing => entries.get(standing.entry_id)?.team_name).join(', ')}</li>)}</ul>
                        <div><button className="tm-button" disabled={busy} onClick={makePreview}>Review elimination bracket</button></div>
                        {planned && <>
                            <DrawBracketPreview title="Elimination preview" matches={planned.map(match => ({ ...match,
                                entry_one: entries.get(match.entry_one_id), entry_two: entries.get(match.entry_two_id),
                            }))} />
                            <label className="tm-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I have checked the qualifiers and opening matchups.</label>
                            <div><button className="tm-button primary" disabled={busy || !reviewed}
                                onClick={() => act(() => client.qualify(data, draw, planned), 'Elimination matches created from group standings')}>Create elimination phase</button></div>
                        </>}
                    </>}
        {error && <p role="alert" className="tm-notice">{error}</p>}
    </section>;
}
