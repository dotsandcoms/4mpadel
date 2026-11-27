const active = new Set(['live', 'ongoing']);
const terminal = new Set(['ended', 'finished', 'retired', 'walkover', 'bye', 'not_played', 'cancelled', 'canceled']);
const systemScore = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/;
/** @returns {[number, number] | null} */
const pair = (value) => {
  const parts = systemScore.exec(typeof value === 'string' ? value.trim() : '');
  return parts ? [Number(parts[1]), Number(parts[2])] : null;
};

/** @returns {import('./pro-live-score-push.ts').Score | null} */
export function scoreFromFeed(feed, match, observedAt) {
  if (!feed || feed.id !== match || !Number.isFinite(observedAt)) return null;
  const status = active.has(feed.status) ? 'live' : terminal.has(feed.status) ? 'final' : null;
  if (!status) return null;
  if (!Array.isArray(feed.sets) || feed.sets.length > 5) return null;
  const sets = [];
  let games = null;
  for (const set of feed.sets) {
    if (set == null || typeof set !== 'object') return null;
    const completed = pair(set.set_score);
    if (completed) {
      sets.push(completed);
      games = null;
    } else {
      const last = Array.isArray(set.games) ? set.games.at(-1) : null;
      games = pair(last?.game_score);
      if (status === 'final' && games) sets.push(games);
    }
  }
  return { status, games, sets, timestamp: Math.floor(observedAt / 1000), freshUntil: Math.floor(observedAt / 1000) + 180 };
}

export function hasScoreChanged(a, b) {
  return !b || a.status !== b.status || JSON.stringify(a.games) !== JSON.stringify(b.games)
    || JSON.stringify(a.sets) !== JSON.stringify(b.sets);
}

export async function getScore(fetcher, token, match, clock = Date.now) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const query = (path) => fetcher(`https://padelapi.org/api/matches/${match}${path}`, {
    headers, signal: AbortSignal.timeout(8000),
  });
  const read = async (response) => {
    if (!response.ok || response.headers.get('x-4m-cache') === 'stale') return null;
    const stamp = response.headers.get('x-4m-fetched-at');
    const observedAt = stamp ? Date.parse(stamp) : clock();
    if (!Number.isFinite(observedAt)) return null;
    const value = await response.json();
    if (terminal.has(value?.status)) return { value, observedAt: clock() };
    return clock() - observedAt >= 180_000 ? null : { value, observedAt };
  };
  const response = await query('/live');
  const snapshot = await read(response);
  if (snapshot) {
    const score = scoreFromFeed(snapshot.value, match, snapshot.observedAt);
    if (score) return score;
  }
  // Some matches stop exposing the point feed before their result is published.
  if (![200, 404, 410, 422].includes(response.status) || response.headers.get('x-4m-cache') === 'stale') return null;
  const detail = await read(await query(''));
  if (!detail || detail.value?.id !== match || !terminal.has(detail.value.status)) return null;
  const rawSets = Array.isArray(detail.value.score)
    ? detail.value.score.map((set) => `${set?.team_1}-${set?.team_2}`)
    : typeof detail.value.score === 'string' ? detail.value.score.split(',') : [];
  return scoreFromFeed({ id: match, status: detail.value.status, sets: rawSets.map(set_score => ({ set_score })) }, match, detail.observedAt);
}

export async function getMatchTeams(fetcher, token, match) {
  const response = await fetcher(`https://padelapi.org/api/matches/${match}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok || response.headers.get('x-4m-cache') === 'stale') return null;
  const data = await response.json();
  if (data.id !== match) return null;
  const teams = ['team_1', 'team_2'].map(side => {
    if (!Array.isArray(data.players?.[side])) return '';
    return data.players[side].slice(0, 2)
      .map(player => typeof player?.name === 'string' ? player.name.trim().slice(0, 42) : '')
      .filter(Boolean).join(' / ');
  });
  return teams.every(Boolean) ? teams : null;
}
