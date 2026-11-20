import { useState } from 'react';
import { rankGroupQualifiers } from '../../../utils/drawQualification.js';
import DrawBracketPreview from './DrawBracketPreview';
import { generateElimination, generateRankedElimination } from './utils/tournament/draws';

const RESOLVED_GROUP = ['completed', 'walkover', 'retired'];
const RANKED_MODES = ['all', 'best_placed'];

export default function HostGroupQualification({ data, draw, client, act, busy }) {
    const [preview, setPreview] = useState(null);
    const [override, setOverride] = useState(null);
    const [reviewed, setReviewed] = useState(false);
    const [error, setError] = useState('');
    const matches = data.matches.filter(match => match.draw_id === draw.id && match.stage === 'group');
    const entries = new Map(data.entries.filter(entry => entry.draw_id === draw.id).map(entry => [entry.id, entry]));
    const standings = data.standings.filter(standing => standing.draw_id === draw.id);
    const groupIds = [...new Set([...entries.values()].map(entry => entry.group_id).filter(Boolean))].sort();
    const groupMatchIds = new Set(matches.map(match => match.id));
    const matchSets = data.sets.filter(set => groupMatchIds.has(set.match_id));
    const rules = draw.scoring_rules || {};
    const mode = rules.qualification?.mode || 'fixed';
    const rankedMode = RANKED_MODES.includes(mode);
    const places = Number(draw.advancers_per_group);
    const extras = Number(rules.qualification?.extras || 0);
    const unsupportedQualification = mode !== 'fixed' && !rankedMode;
    const hasPlacement = (Array.isArray(rules.plate_mode) ? rules.plate_mode.length > 0 : Boolean(rules.plate_mode && rules.plate_mode !== 'none'))
        || Boolean(rules.playoff_mode && rules.playoff_mode !== 'none');
    const bookingReview = data.groupPlacementReservations?.[draw.id];
    const resolved = (matches.length > 0 || mode === 'all') && matches.every(match => RESOLVED_GROUP.includes(match.status)
        && entries.get(match.entry_one_id)?.group_id === match.group_id && entries.get(match.entry_two_id)?.group_id === match.group_id
        && [match.entry_one_id, match.entry_two_id].includes(match.winner_entry_id));
    const latestReview = JSON.stringify([
        draw.id, draw.updated_at,
        rules.qualification, rules.plate_mode, rules.playoff_mode, places, bookingReview?.token,
        matches.map(match => [match.id, match.updated_at, match.group_id, match.entry_one_id, match.entry_two_id, match.winner_entry_id, match.status, match.result_summary]),
        matchSets.map(set => [set.id, set.set_number, set.entry_one_games, set.entry_two_games, set.is_match_tiebreak]),
        [...entries.values()].map(entry => [entry.id, entry.group_id, entry.seed_number]),
        standings.map(standing => [standing.group_id, standing.entry_id, standing.position, standing.requires_manual_resolution]),
    ]);
    const planned = preview?.revision === latestReview ? preview : null;
    const qualifiers = groupIds.map(groupId => standings
        .filter(standing => standing.group_id === groupId && standing.position <= places)
        .sort((first, second) => first.position - second.position));
    const rankingInput = {
        groups: groupIds.map((id, index) => ({ id, name: 'Group ' + (index + 1) })),
        entries: [...entries.values()], matches, matchSets, mode, places, extras,
        rules: rules.qualification?.rules, drawId: draw.id,
    };
    const automatic = resolved && rankedMode ? rankGroupQualifiers(rankingInput) : null;
    const selection = mode === 'best_placed' && override?.revision === latestReview ? override : null;
    const changed = selection && (selection.ids.length !== automatic?.autoIds.length
        || selection.ids.some(id => !automatic?.autoIds.includes(id)));
    const ranked = automatic && changed ? rankGroupQualifiers({ ...rankingInput, overrideIds: selection.ids }) : automatic;
    const reason = selection?.reason.trim() || '';
    const validSelection = !changed || Boolean(reason && ranked?.comparison.filter(row => row.qualified).length === extras);
    const validRanking = automatic && automatic.advancing.length >= 2
        && (mode === 'all' || (Number.isInteger(places) && places > 0 && Number.isInteger(extras) && extras > 0
            && automatic.autoIds.length === extras));
    const validFixed = !standings.some(standing => standing.requires_manual_resolution)
        && qualifiers.every(group => group.length === places);
    const ready = resolved && groupIds.length === Number(draw.group_count) && (rankedMode ? validRanking : validFixed);
    const changeOverride = next => {
        setOverride(next);
        setPreview(null);
        setReviewed(false);
        setError('');
    };
    const makePreview = () => {
        if (!validSelection || (hasPlacement && !bookingReview?.token)) return;
        try {
            setPreview({ revision: latestReview,
                matches: rankedMode ? generateRankedElimination(ranked.advancing, draw) : generateElimination(data, draw),
                rankedQualifiers: rankedMode ? ranked.advancing.map(entry => entry.id) : undefined,
                bookingToken: hasPlacement ? bookingReview.token : undefined,
                rankedOverride: changed ? {
                    candidate_ids: automatic.comparison.map(row => row.entry_id),
                    entry_ids: ranked.comparison.filter(row => row.qualified).map(row => row.entry_id),
                    reason,
                } : undefined,
            });
            setReviewed(false);
            setError('');
        } catch (failure) { setError(failure.message); }
    };

    return <section className="tm-panel tm-stack" aria-label="Elimination phase">
        <h3>Elimination phase</h3>
        {unsupportedQualification ? <p className="muted">This division’s qualification rules require an assigned Tournament Manager account.</p>
            : !resolved ? <p className="muted">Finish all group matches to review their qualifiers.</p>
                : !ready ? <p className="muted">{rankedMode ? 'Check the saved qualification settings and refresh the group results.' : 'Resolve ties and refresh the final group standings to continue.'}</p>
                    : <>
                        <p className="muted">Review the qualifying teams and their bracket. Compatible reserved court times carry over.</p>
                        {rankedMode ? <>
                            <h4>{mode === 'all' ? 'All teams in ranked order' : 'Qualifiers, including best-placed teams'}</h4>
                            <ol>{ranked.advancing.map(entry => <li key={entry.id}>{entry.team_name}</li>)}</ol>
                            {ranked.comparison.length > 0 && <>
                                <div>
                                    <button className="tm-button" type="button" disabled={busy} onClick={() => changeOverride(selection ? null : {
                                        revision: latestReview, ids: automatic.autoIds, reason: '',
                                    })}>{selection ? 'Use automatic selection' : 'Override selection'}</button>
                                </div>
                                <div className="tm-table-wrap">
                                    <table aria-label="Best-placed comparison">
                                        <thead><tr><th>Team</th><th>Group</th><th>Wins</th><th>Set difference</th><th>Game difference</th><th>Outcome</th></tr></thead>
                                        <tbody>{ranked.comparison.map(row => <tr key={row.entry_id}>
                                            <td>{row.team}</td><td>{row.group}</td><td>{row.won}</td><td>{row.set_difference}</td><td>{row.game_difference}</td>
                                            <td>{selection ? <label className="tm-check"><input type="checkbox" checked={row.qualified} disabled={busy}
                                                aria-label={'Advance ' + row.team} onChange={event => changeOverride({ ...selection,
                                                    ids: event.target.checked ? [...selection.ids, row.entry_id] : selection.ids.filter(id => id !== row.entry_id),
                                                })} />Advance</label> : <>{row.qualified ? 'Qualified' : 'Did not qualify'}{row.decidedByLot ? ' · Draw lots' : ''}</>}</td>
                                        </tr>)}</tbody>
                                    </table>
                                    {ranked.comparison.some(row => row.excluded > 0) && <small>The comparison removes results against lower-placed teams so eligible groups are compared at the same size.</small>}
                                </div>
                                {selection && <>
                                    <p className="muted" aria-live="polite">{selection.ids.length} of {extras} extra {extras === 1 ? 'place' : 'places'} selected.</p>
                                    <label className="tm-field">Reason for overriding qualifiers
                                        <textarea className="tm-input" value={selection.reason} disabled={busy} maxLength={500} required={Boolean(changed)}
                                            onChange={event => changeOverride({ ...selection, reason: event.target.value })} />
                                    </label>
                                </>}
                            </>}
                        </> : <ul>{qualifiers.map((group, index) => <li key={groupIds[index]}>Group {index + 1} · {group.map(standing => entries.get(standing.entry_id)?.team_name).join(', ')}</li>)}</ul>}
                        {hasPlacement && !bookingReview?.token && <p className="tm-notice">Reload the draw to review its reserved courts.</p>}
                        <div><button className="tm-button" disabled={busy || !validSelection || (hasPlacement && !bookingReview?.token)}
                            onClick={makePreview}>Review elimination bracket</button></div>
                        {planned && <>
                            <DrawBracketPreview title="Elimination preview" matches={planned.matches.map(match => ({ ...match, ...bookingReview?.fixtures?.[match.key],
                                entry_one: entries.get(match.entry_one_id), entry_two: entries.get(match.entry_two_id),
                            }))} />
                            {planned.rankedOverride && <p><strong>Override reason</strong> {planned.rankedOverride.reason}</p>}
                            <label className="tm-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I have checked the qualifiers and opening matchups.</label>
                            <div><button className="tm-button primary" disabled={busy || !reviewed}
                                onClick={() => act(() => client.qualify(data, draw, planned.matches, planned.rankedQualifiers, planned.rankedOverride, planned.bookingToken), 'Elimination matches created from group standings')}>Create elimination phase</button></div>
                        </>}
                    </>}
        {error && <p role="alert" className="tm-notice">{error}</p>}
    </section>;
}
