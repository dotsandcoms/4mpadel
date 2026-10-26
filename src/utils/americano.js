/** Individual Americano: fixed partner rotation, fixed-total rally scoring. */
export function americanoPlayers(registrations) {
    const players = new Map();
    for (const row of registrations) {
        if (String(row.status || '').toLowerCase() === 'withdrawn' || (String(row.payment_status || '').toLowerCase() !== 'paid' && !row.draw_exception?.trim())) continue;
        // Every player needs their own paid registration. Never infer an entrant
        // from an optional partner name (which may be unpaid or ambiguous).
        const key = row.player_id ? `player:${row.player_id}` : String(row.email || row.id).trim().toLowerCase();
        if (!players.has(key)) players.set(key, { id: String(row.id), name: row.full_name || `Player ${players.size + 1}` });
    }
    return [...players.values()];
}

export function generateAmericano(players, { rounds = players.length - 1, points = 24, courts = players.length / 4 } = {}) {
    const n = players.length;
    if (n < 4 || n > 64 || n % 4) throw new Error('Americano needs 4–64 individual players, in multiples of four.');
    if (new Set(players.map(p => p.id)).size !== n) throw new Error('Each player must appear once.');
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > n - 1) throw new Error(`Choose 1–${n - 1} rounds.`);
    if (!Number.isInteger(points) || points < 1 || points > 2147483647) throw new Error('Enter total rally points as a positive whole number (up to 2,147,483,647).');
    if (!Number.isInteger(courts) || courts < 1 || courts > n / 4) throw new Error(`Choose 1–${n / 4} courts.`);
    const rotation = players.map(p => p.id);
    const opponents = new Map();
    const meetings = (a, b) => opponents.get([a, b].sort().join(':')) || 0;
    const fixtures = [];
    for (let round = 1; round <= rounds; round++) {
        const pairs = Array.from({ length: n / 2 }, (_, i) => [rotation[i], rotation[n - 1 - i]]);
        // Match the fixed partnerships against the least-repeated opponents.
        let match = 0;
        while (pairs.length) {
            const one = pairs.shift();
            let best = 0;
            let cost = Infinity;
            pairs.forEach((two, i) => {
                const score = one.reduce((sum, a) => sum + two.reduce((s, b) => s + meetings(a, b), 0), 0);
                if (score < cost) { cost = score; best = i; }
            });
            const two = pairs.splice(best, 1)[0];
            one.forEach(a => two.forEach(b => opponents.set([a, b].sort().join(':'), meetings(a, b) + 1)));
            fixtures.push({ id: `r${round}-m${++match}`, round, court: (match - 1) % courts + 1, wave: Math.floor((match - 1) / courts) + 1, one, two, score: null });
        }
        rotation.splice(1, 0, rotation.pop());
    }
    return { players, rounds, points, courts, fixtures };
}

export function validateAmericanoScore(score, points) {
    return Number.isInteger(points) && points > 0 && points <= 2147483647 && Array.isArray(score) && score.length === 2 && score.every(n => Number.isInteger(n) && n >= 0) && score[0] + score[1] === points;
}

export function americanoStandings(state) {
    const rows = new Map(state.players.map(p => [p.id, { ...p, played: 0, won: 0, points: 0, against: 0 }]));
    state.fixtures.forEach(m => {
        if (!validateAmericanoScore(m.score, state.points)) return;
        [m.one, m.two].forEach((side, i) => side.forEach(id => {
            const row = rows.get(id);
            row.played++; row.points += m.score[i]; row.against += m.score[1 - i];
            if (m.score[i] > m.score[1 - i]) row.won++;
        }));
    });
    const sorted = [...rows.values()].sort((a, b) => b.points - a.points || (b.points - b.against) - (a.points - a.against) || b.won - a.won || a.name.localeCompare(b.name));
    return sorted.map((row) => ({ ...row, position: 1 + sorted.findIndex(p => p.points === row.points && p.points - p.against === row.points - row.against && p.won === row.won) }));
}

/** Schedule complete waves; all players finish a round before the next starts. */
export function scheduleAmericano(state, playDays, existingMatches = [], { minutes = 15, restMinutes = 5 } = {}) {
    if (!Number.isInteger(minutes) || minutes < 1 || !Number.isInteger(restMinutes) || restMinutes < 0) throw new Error('Use whole minutes for match duration and rest.');
    const days = playDays.filter(d => d.is_active && Number(d.courts_count) >= state.courts)
        .map(d => ({start: Date.parse(`${d.play_date}T${d.start_time}`), end: Date.parse(`${d.play_date}T${d.end_time}`)}))
        .filter(d => Number.isFinite(d.start) && d.end > d.start).sort((a,b) => a.start - b.start);
    const reservations = existingMatches.filter(m => m.status !== 'cancelled' && m.scheduled_start).map(m => ({ court: m.court_name, start: Date.parse(m.scheduled_start), end: m.scheduled_end ? Date.parse(m.scheduled_end) : Date.parse(m.scheduled_start) + minutes * 60000 }));
    // Preserve the played portion of the rotation, including partially scored waves.
    const waveOrder = m => (m.round - 1) * Math.max(1, ...state.fixtures.map(m=>m.wave)) + m.wave;
    const lastPlayedWave = Math.max(0, ...state.fixtures.filter(m => m.score).map(waveOrder));
    let cursor = days[0]?.start;
    const fixtures = [];
    for (let round = 1; round <= state.rounds; round++) {
        for (let wave = 1; wave <= Math.max(1, ...state.fixtures.map(m=>m.wave)); wave++) {
            const matches = state.fixtures.filter(m => m.round === round && m.wave === wave);
            if (matches.length && waveOrder(matches[0]) <= lastPlayedWave) {
                if (matches.some(m => !Number.isFinite(Date.parse(m.scheduled_start)) || !Number.isFinite(Date.parse(m.scheduled_end)))) {
                    throw new Error('Played rounds need recorded court times before the remaining rounds can be scheduled.');
                }
                fixtures.push(...matches);
                cursor = Math.max(cursor || 0, ...matches.map(m => Date.parse(m.scheduled_end)));
                continue;
            }
            let slot;
            for (const day of days) {
                let start = Math.max(day.start, cursor);
                while (start + minutes * 60000 <= day.end) {
                    const end = start + minutes * 60000;
                    const conflicts = reservations.filter(r => matches.some(m => `Court ${m.court}` === r.court) && r.start < end && r.end > start);
                    if (!conflicts.length) { slot = {start,end}; break; }
                    start = Math.max(...conflicts.map(r => r.end));
                }
                if (slot) break;
            }
            if (!slot) throw new Error('Not enough court time for every Americano round. Add play time or reduce rounds.');
            matches.forEach(m => fixtures.push({...m, scheduled_start:new Date(slot.start).toISOString(), scheduled_end:new Date(slot.end).toISOString()}));
            cursor = slot.end;
        }
        cursor += restMinutes * 60000;
    }
    return {...state, fixtures};
}
