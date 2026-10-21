// Scores are always stored in bracket order, even when the second team wins.
export function prepareMatchResult({ kind = 'played', winner, totals = [], sets = [], detailed = true, setsToWin = 2, matchTiebreak = false }) {
    if (!['live', 'played', 'walkover', 'withdrawal', 'retirement'].includes(kind)) throw new Error('Choose a match outcome.');
    const read = (value, label) => {
        if (value === '' || value == null || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 32767) throw new Error(`Enter a whole number for ${label}.`);
        return Number(value);
    };
    if (['walkover', 'withdrawal'].includes(kind)) {
        if (!winner) throw new Error('Choose the winning team.');
        return { kind, winner, sets: [], summary: null };
    }
    const rows = detailed ? sets.filter(s => s.games.some(v => v !== '' && v != null)) : [];
    if (rows.length > setsToWin * 2 - 1) throw new Error('There are too many sets for this match.');
    let wins = [0, 0];
    const payload = rows.map((s, index) => {
        if (wins.some(n => n >= setsToWin)) throw new Error('Remove the sets after the match was won.');
        const games = s.games.map(v => read(v, `set ${index + 1} games`));
        const [a, b] = games, hi = Math.max(a, b), lo = Math.min(a, b);
        const isMatchTiebreak = matchTiebreak && index === setsToWin * 2 - 2;
        const complete = isMatchTiebreak ? hi >= 10 && hi - lo === 2 || hi === 10 && lo <= 8 : hi === 6 && lo <= 4 || hi === 7 && [5, 6].includes(lo);
        const partialRetirement = ['live', 'retirement'].includes(kind) && index === rows.length - 1 && (isMatchTiebreak ? hi < 10 || hi - lo < 2 : hi <= 6);
        if (!complete && !partialRetirement) throw new Error(`Set ${index + 1} is not a valid finished set.`);
        if (complete) wins[a > b ? 0 : 1]++;
        let tiebreak = null;
        if (s.tiebreak?.some(v => v !== '' && v != null)) {
            tiebreak = s.tiebreak.map(v => read(v, `set ${index + 1} tiebreak`));
            const [x, y] = tiebreak, high = Math.max(x, y), low = Math.min(x, y);
            if (isMatchTiebreak || hi !== 7 || lo !== 6 || (high !== 7 || low > 5) && (high < 8 || high - low !== 2) || (a > b) !== (x > y)) throw new Error(`Set ${index + 1} tiebreak must agree with its 7–6 game score.`);
        }
        const duration = s.duration === '' || s.duration == null ? null : read(s.duration, `set ${index + 1} duration`);
        return { games, tiebreak, duration, match_tiebreak: isMatchTiebreak };
    });
    let summary;
    if (detailed && rows.length) summary = wins;
    else if (totals.every(v => v !== '' && v != null) && totals.length === 2) summary = totals.map(v => read(v, 'sets won'));
    else if (kind === 'played') throw new Error('Enter the overall set score, or add detailed set scores.');
    else if (kind === 'live') summary = [0, 0];
    else summary = null;
    if (kind === 'played' && (!summary || Math.max(...summary) !== setsToWin || Math.min(...summary) >= setsToWin)) throw new Error(`The winner must win ${setsToWin} sets.`);
    if (kind === 'played' && summary && winner && Number(winner) !== (summary[0] > summary[1] ? 1 : 2)) throw new Error('The selected winner does not agree with the score.');
    if (kind === 'live' && summary?.some(n => n >= setsToWin)) throw new Error('The match has been won. Save the final result.');
    if (!['played', 'live'].includes(kind) && !winner) throw new Error('Choose the winning team.');
    return { kind, winner: kind === 'live' ? null : kind === 'played' ? (summary[0] > summary[1] ? 1 : 2) : Number(winner), summary, sets: payload };
}

export function matchScoreText(match, sets = []) {
    const rows = sets.filter(s => s.match_id === match.id).sort((a, b) => a.set_number - b.set_number);
    const summary = match.result_summary;
    const label = match.result_type === 'retirement' ? 'Retirement' : match.result_type === 'withdrawal' ? 'Withdrawal' : match.result_type === 'walkover' ? 'Walkover' : '';
    const total = summary ? `${summary[0]}–${summary[1]}` : '';
    const details = rows.map(s => `${s.entry_one_games}–${s.entry_two_games}${s.entry_one_tiebreak != null ? ` (${s.entry_one_tiebreak}–${s.entry_two_tiebreak})` : ''}`).join(', ');
    return [label, total && `${total} sets`, details].filter(Boolean).join(' · ');
}

export function pricePlacement(proposal, rules = [], eventPoints = null) {
    const override = eventPoints?.placements?.[proposal.placement];
    if (Number.isInteger(override) && override >= 0) return { ...proposal, requiresManualPlacement: false, selectedRoundCode: `placement_${proposal.placement.replace(/[^0-9]+/g, '_').replace(/_$/, '')}`, pointsRule: { id: null, round_code: `placement_${proposal.placement.replace(/[^0-9]+/g, '_').replace(/_$/, '')}`, round_label: proposal.placement, points: override, source: eventPoints.source_url, basis: eventPoints.basis } };
    const pointsRule = rules.find(r => r.round_code === proposal.roundCode) || null;
    return { ...proposal, selectedRoundCode: proposal.roundCode || '', pointsRule };
}

export function buildRankingAwardRows({ playerRows, event, divisionId, draw, tier, category, awardedAt = new Date().toISOString() }) {
    return playerRows.map(({ id, name, proposal }) => ({
        player_id: id, event_id: event.id, division_id: divisionId,
        points_table_id: proposal.pointsRule.id || null,
        round_code: proposal.selectedRoundCode, points: proposal.pointsRule.points,
        event_date: String(event.start_date || '').slice(0, 10) || null,
        date_awarded: awardedAt.slice(0, 10),
        config_snapshot: {
            source: 'native_draw', draw_id: draw.id, draw_kind: 'main',
            entry_id: proposal.entry_id, team_name: proposal.entry.team_name, player_name: name,
            final_placement: proposal.placement,
            ranking_tier: { id: tier.id, code: tier.code, name: tier.name }, ranking_category: Number(category),
            points_rule: { id: proposal.pointsRule.id || null, round_code: proposal.pointsRule.round_code,
                round_label: proposal.pointsRule.round_label, points: proposal.pointsRule.points,
                source: proposal.pointsRule.source || 'ranking_points_table', basis: proposal.pointsRule.basis || null },
            awarded_at: awardedAt,
        },
    }));
}
