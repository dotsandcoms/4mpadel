import { createClient } from '@supabase/supabase-js';

export const CACHE_BUCKET = 'pro-padel';
export const CACHE_PATH = 'rankings-v1.json';
const cleanText = (value) => typeof value === 'string' && value !== 'hidden_free_plan' ? value.trim() || null : null;
const number = (value) => (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) && Number.isFinite(Number(value)) ? Number(value) : null;
const date = (value) => cleanText(value) && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
function photo(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

export function normalizeCategory(rankingPage, profilePage, category) {
  if (!Array.isArray(rankingPage?.data) || !rankingPage.data.length || !Array.isArray(profilePage?.data)) throw new Error('Provider returned an empty or invalid ranking snapshot.');
  const profiles = new Map(profilePage.data.map((p) => [p.id, p]));
  const seen = new Set();
  const players = rankingPage.data.map((row) => {
    if (!Number.isSafeInteger(row.id) || row.id <= 0 || seen.has(row.id) || !cleanText(row.name) ||
      row.category !== category || row.type !== 'official' || !Number.isInteger(row.ranking) || row.ranking < 1) throw new Error('Provider ranking contract changed; previous snapshot preserved.');
    seen.add(row.id);
    const profile = profiles.get(row.id);
    if (profile && profile.category !== category) throw new Error('Provider player category mismatch.');
    return {
      id: row.id, name: cleanText(row.name), category, nationality: cleanText(row.nationality),
      rank: row.ranking, points: number(row.points), rankingDate: date(row.date),
      rankChange: Number.isSafeInteger(number(row.ranking_diff)) ? number(row.ranking_diff) : null,
      pointsChange: number(row.points_diff),
      photoUrl: photo(profile?.photo_url), height: number(profile?.height),
      side: ['drive', 'backhand'].includes(profile?.side) ? profile.side : null,
      hand: ['left', 'right'].includes(profile?.hand) ? profile.hand : null,
      birthplace: cleanText(profile?.birthplace), birthdate: date(profile?.birthdate),
      detailsAvailable: Boolean(profile),
    };
  }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return { total: number(rankingPage.meta?.total), players };
}

export async function buildSnapshot({ token, fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => new Date() }) {
  if (!token?.trim() || /[\r\n]/.test(token)) throw new Error('PADEL_API_TOKEN is not configured.');
  let calls = 0;
  async function read(resource, category) {
    if (calls++) await wait(6500);
    const url = new URL(`https://padelapi.org/api/${resource}`);
    Object.entries({ category, sort_by: 'ranking', order_by: 'asc', per_page: 50, page: 1, ...(resource === 'rankings' ? { type: 'official' } : {}) }).forEach(([key, value]) => url.searchParams.set(key, value));
    let response;
    try {
      response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    } catch { throw new Error('Provider connection failed; previous snapshot preserved.'); }
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}; previous snapshot preserved.`);
    try { return await response.json(); } catch { throw new Error('Invalid provider JSON; previous snapshot preserved.'); }
  }
  const categories = {};
  for (const category of ['men', 'women']) {
    const ranks = await read('rankings', category);
    const profiles = await read('players', category);
    categories[category] = normalizeCategory(ranks, profiles, category);
  }
  return { version: 1, updatedAt: now().toISOString(), source: 'Padel API', limit: 50, categories };
}

export async function publishSnapshot(snapshot, { url, serviceKey, cachePath = CACHE_PATH }) {
  if (![CACHE_PATH, 'tour-v1.json', 'fixtures-v1.json'].includes(cachePath)) throw new Error('Invalid cache path.');
  if (!url || !serviceKey) throw new Error('Server Supabase credentials are not configured.');
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: bucket, error: bucketError } = await client.storage.getBucket(CACHE_BUCKET);
  if (bucketError) {
    if (String(bucketError.statusCode) !== '404') throw new Error('Could not inspect the Pro Padel storage bucket.');
    const { error: createError } = await client.storage.createBucket(CACHE_BUCKET, {
      public: true, allowedMimeTypes: ['application/json'], fileSizeLimit: 1048576,
    });
    if (createError) throw new Error('Could not create the Pro Padel storage bucket.');
  } else if (!bucket.public) {
    throw new Error('Could not publish: Pro Padel requires a public cache bucket.');
  }
  const { error } = await client.storage.from(CACHE_BUCKET).upload(cachePath, JSON.stringify(snapshot), {
    upsert: true, contentType: 'application/json', cacheControl: '300',
  });
  if (error) throw new Error('Could not publish the Pro Padel snapshot to Supabase Storage.');
}

export function normalizeTournament(row) {
  if (!Number.isSafeInteger(row?.id) || !cleanText(row.name) || !date(row.start_date) || !date(row.end_date)) throw new Error('Provider tournament contract changed.');
  return { id: row.id, name: cleanText(row.name), level: cleanText(row.level), status: cleanText(row.status),
    startDate: date(row.start_date), endDate: date(row.end_date), country: cleanText(row.country),
    location: cleanText(row.location), venue: cleanText(row.venue?.name), photoUrl: photo(row.photo_url) };
}

export function normalizeMatch(row, tournament) {
  if (!Number.isSafeInteger(row?.id) || !['men', 'women'].includes(row.category) || !Number.isInteger(row.round)) throw new Error('Provider match contract changed.');
  const teams = ['team_1', 'team_2'].map((key) => {
    if (!Array.isArray(row.players?.[key])) throw new Error('Provider match players unavailable.');
    return row.players[key].map((p) => {
      if (!Number.isSafeInteger(p?.id) || !cleanText(p.name)) throw new Error('Provider match player identity invalid.');
      return { id: p.id, name: cleanText(p.name) };
    });
  });
  const scoreValue = (v) => typeof v === 'number' || typeof v === 'string' && /^\d+(\(\d+\))?$/.test(v) ? String(v) : null;
  return { id: row.id, category: row.category, round: row.round, roundName: cleanText(row.round_name),
    playedAt: date(row.played_at), status: cleanText(row.status),
    winner: ['team_1', 'team_2'].includes(row.winner) ? row.winner : null,
    teams, score: Array.isArray(row.score) ? row.score.map((set) => [scoreValue(set.team_1), scoreValue(set.team_2)]) : [],
    tournamentId: tournament.id, tournamentName: tournament.name, level: tournament.level };
}

// Separate three-request refresh keeps each daily job within the execution budget.
export async function buildTourSnapshot({ token, fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => new Date() }) {
  if (!token?.trim() || /[\r\n]/.test(token)) throw new Error('PADEL_API_TOKEN is not configured.');
  let calls = 0;
  async function read(path, params) {
    if (calls++) await wait(6500);
    const url = new URL(`https://padelapi.org/api/${path}`);
    Object.entries({ per_page: 50, page: 1, ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
    let response;
    try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000) }); }
    catch { throw new Error('Provider connection failed; previous tour snapshot preserved.'); }
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}; previous tour snapshot preserved.`);
    const body = await response.json();
    if (!Array.isArray(body.data)) throw new Error('Provider returned invalid tour data.');
    return body.data;
  }
  const current = now();
  const day = (offset) => new Date(current.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const tournaments = (await read('tournaments', { level: 'major,p1,p2,finals', after_date: day(-90), before_date: day(120), sort_by: 'start_date', order_by: 'desc' })).map(normalizeTournament);
  const covered = tournaments.filter((t) => t.status === 'finished').sort((a, b) => b.endDate.localeCompare(a.endDate)).slice(0, 2);
  const matches = [];
  for (const tournament of covered) {
    const rows = await read(`tournaments/${tournament.id}/matches`, { draw: 'main', sort_by: 'round', order_by: 'asc' });
    matches.push(...rows.filter((row) => [1, 2, 4].includes(row.round)).map((row) => normalizeMatch(row, tournament)));
  }
  return { version: 1, updatedAt: now().toISOString(), coverage: 'Quarter-finals onward from the two latest completed Premier Padel tournaments',
    tournaments, coveredTournamentIds: covered.map((t) => t.id), matches: [...new Map(matches.map((m) => [m.id, m])).values()] };
}

// Next event only: bounded to five paced requests, including complete main-draw pagination.
export async function buildFixtureSnapshot({ token, fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => new Date() }) {
  if (!token?.trim() || /[\r\n]/.test(token)) throw new Error('PADEL_API_TOKEN is not configured.');
  let calls = 0;
  async function read(path, params) {
    if (calls++) await wait(6500);
    const url = new URL(`https://padelapi.org/api/${path}`);
    Object.entries({ per_page: 50, page: 1, ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
    let response;
    try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) }); }
    catch { throw new Error('Provider connection failed; previous fixtures preserved.'); }
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}; previous fixtures preserved.`);
    const body = await response.json();
    if (!Array.isArray(body.data) || !Number.isInteger(body.meta?.last_page) || body.meta.last_page < 1) throw new Error('Provider fixture pagination invalid.');
    return body;
  }
  const current = now();
  const day = (offset) => new Date(current.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const listing = await read('tournaments', { level: 'major,p1,p2,finals', after_date: day(-14), before_date: day(120), sort_by: 'start_date', order_by: 'asc' });
  if (listing.meta.last_page !== 1) throw new Error('Provider tournament pagination exceeds fixture coverage.');
  const tournament = listing.data.map(normalizeTournament).filter((t) => ['pending', 'live'].includes(t.status) && t.endDate.slice(0, 10) >= day(0)).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
  const rows = [];
  if (tournament) {
    for (let page = 1, last = 1; page <= last; page++) {
      const body = await read(`tournaments/${tournament.id}/matches`, { draw: 'main', sort_by: 'round', order_by: 'desc', page });
      last = body.meta.last_page;
      if (last > 4 || body.meta.current_page !== page) throw new Error('Provider fixture pagination exceeds refresh budget.');
      rows.push(...body.data);
    }
  }
  const matches = rows.filter((row) => row.status === 'scheduled').map((row) => {
    const normalized = normalizeMatch({ ...row, players: { team_1: row.players?.team_1 ?? [], team_2: row.players?.team_2 ?? [] } }, tournament);
    // Offset-free provider times cannot safely be interpreted in the visitor's timezone.
    const instant = [row.scheduled_at_local, row.scheduled_at].find((value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
    return { ...normalized, scheduledAt: instant ? new Date(instant).toISOString() : null, scheduleLabel: cleanText(row.schedule_label), court: cleanText(row.court) };
  }).filter((match) => match.teams.some((team) => team.length));
  return { version: 1, updatedAt: current.toISOString(), coverage: 'Published main-draw fixtures for the next Premier Padel event', tournament,
    drawPublished: rows.length > 0, matches: [...new Map(matches.map((match) => [match.id, match])).values()] };
}
