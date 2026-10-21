import { normalizeMatch, normalizeTournament } from './pro-padel.mjs';
const text = v => typeof v === 'string' && v !== 'hidden_free_plan' ? v.trim() || null : null;
const numeric = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const instant = v => typeof v === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
export function normalizePlayer(row) {
  if (!Number.isSafeInteger(row?.id) || row.id < 1 || !text(row.name) || !['men', 'women'].includes(row.category)) throw new Error('Invalid player data.');
  let photoUrl = null;
  try { const url = new URL(row.photo_url); if (url.protocol === 'https:') photoUrl = url.href; } catch { /* Portrait optional. */ }
  return { id: row.id, name: text(row.name), category: row.category, nationality: text(row.nationality), rank: numeric(row.ranking) || null, points: numeric(row.points), elo: numeric(row.elo), photoUrl, height: numeric(row.height), side: ['drive','backhand'].includes(row.side) ? row.side : null, hand: ['left','right'].includes(row.hand) ? row.hand : null, birthplace: text(row.birthplace), birthdate: /^\d{4}-\d{2}-\d{2}$/.test(row.birthdate || '') ? row.birthdate : null, detailsAvailable: true };
}
export function normalizePlayerStats(row, id) {
  if (row?.id !== id) throw new Error('Invalid player statistics.');
  return { coverage: ['full','partial','finals_only'].includes(row.coverage) ? row.coverage : null, performanceSince: /^\d{4}-\d{2}-\d{2}$/.test(row.performance_since || '') ? row.performance_since : null,
    ...Object.fromEntries(['matches_played','matches_won','win_percentage','sets_won','sets_lost','games_won','games_lost','titles','finals','semifinals','avg_sets_per_match','avg_games_per_match'].map(key => [key, numeric(row[key])])) };
}
export const statLabels = { total_points_won: 'Points won', break_points_converted: 'Break points converted', longest_streak: 'Longest point streak', aces: 'Aces', double_faults: 'Double faults', won_on_1st_serve: 'Points won on first serve', won_on_2nd_serve: 'Points won on second serve', service_games: 'Service games', won_on_1st_return: 'Points won on first return', won_on_2nd_return: 'Points won on second return', return_games: 'Return games', total_won_on_serve: 'Points won on serve', total_won_on_return: 'Points won on return' };
export function normalizeMatchStats(row, id) {
  if (row?.id !== id) throw new Error('Invalid match statistics.');
  const value = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? String(v) : typeof v === 'string' && /^\d+(?:\.\d+)?%?$/.test(v) ? v : null;
  return Object.fromEntries(['match','set_1','set_2','set_3'].map(scope => [scope, Object.entries(statLabels).map(([key,label]) => ({ key, label, values: [value(row[scope]?.[key]?.team_1), value(row[scope]?.[key]?.team_2)] })).filter(stat => stat.values.some(v => v !== null))]));
}
export function exploreRequest(query) {
  const kind = query.kind;
  if (!['search','player','player-stats','player-matches','match','match-stats','head-to-head','comparison-history','current-tour'].includes(kind)) throw new Error('Invalid request.');
  const id = Number(query.id);
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !['search','current-tour'].includes(kind) && (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)) throw new Error('Invalid request.');
  const against = Number(query.against);
  if (kind === 'comparison-history' && (!Number.isSafeInteger(against) || against < 1 || against === id || against > 2147483647)) throw new Error('Invalid request.');
  const params = new URLSearchParams();
  let path;
  if (kind === 'current-tour') {
    path = 'tournaments';
    const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0,10);
    params.set('after_date',day(-14)); params.set('before_date',day(7)); params.set('per_page','50');
  } else if (kind === 'search') {
    if (!['men','women'].includes(query.category) || typeof (query.q || '') !== 'string' || (query.q || '').length > 100) throw new Error('Invalid request.');
    path = 'players'; params.set('category',query.category); if (query.q?.trim()) params.set('name',query.q.trim());
    if (query.country) { if (!/^[A-Z]{2}$/.test(query.country)) throw new Error('Invalid request.'); params.set('nationality',query.country); }
    if (query.side) { if (!['drive','backhand'].includes(query.side)) throw new Error('Invalid request.'); params.set('side',query.side); }
    params.set('per_page','20'); params.set('page',String(page)); params.set('sort_by','ranking'); params.set('order_by','asc');
  } else {
    path = ({ player: `players/${id}`, 'player-stats': `players/${id}/stats`, 'player-matches': `players/${id}/matches`, match: `matches/${id}`, 'match-stats': `matches/${id}/stats`, 'head-to-head': `matches/${id}/headtohead`, 'comparison-history': 'matches/headtohead' })[kind];
    if (['player-matches','head-to-head','comparison-history','current-tour'].includes(kind)) { params.set('per_page','20'); params.set('page',String(page)); params.set('sort_by','played_at'); params.set('order_by','desc'); }
  }
  return { kind, id, page, ...(kind === 'comparison-history' ? { body: { team_1: [id], team_2: [against] } } : {}), url: `https://padelapi.org/api/${path}${params.size ? `?${params}` : ''}` };
}
function pagination(body) {
  const p = body.meta;
  if (!Array.isArray(body.data) || !Number.isSafeInteger(p?.last_page) || p.last_page < 1 || !Number.isSafeInteger(p.current_page) || !Number.isSafeInteger(p.total)) throw new Error('Invalid pagination.');
  return { page: p.current_page, pages: p.last_page, total: p.total };
}
export function normalizeExploreMatch(row, tournament) {
  const linked = /^\/api\/tournaments\/(\d+)$/.exec(row.connections?.tournament || '');
  const base = normalizeMatch({ ...row, players: { team_1: row.players?.team_1 || [], team_2: row.players?.team_2 || [] } }, tournament || { id: linked ? Number(linked[1]) : null, name: linked ? `Tournament #${linked[1]}` : 'Tournament', level: null });
  return { ...base, duration: /^\d{1,3}:\d{2}$/.test(row.duration || '') ? row.duration : null, startedAt: instant(row.started_time), scheduledAt: instant(row.scheduled_at), scheduleLabel: text(row.schedule_label), court: text(row.court), watchability: numeric(row.watchability) !== null && numeric(row.watchability) <= 100 ? numeric(row.watchability) : null };
}
export async function fetchExplore(request, { token, read }) {
  if (!token?.trim()) throw new Error('Provider unavailable.');
  const body = await read(request.url, request.body);
  if (body === null) return { unavailable: true };
  const { kind, id } = request;
  if (kind === 'current-tour') return currentTour(body, read);
  if (kind === 'search') return { players: body.data?.map(normalizePlayer), ...pagination(body) };
  if (kind === 'player') return { player: normalizePlayer(body) };
  if (kind === 'player-stats') return { stats: normalizePlayerStats(body,id) };
  if (kind === 'match-stats') return { stats: normalizeMatchStats(body,id) };
  if (kind === 'match') {
    const linked = /^\/api\/tournaments\/(\d+)$/.exec(body.connections?.tournament || '');
    const event = body.tournament || (linked ? await read(`https://padelapi.org/api/tournaments/${linked[1]}`) : null);
    const tournament = event ? normalizeTournament(event) : null;
    return { match: normalizeExploreMatch(body,tournament), tournament };
  }
  const meta = pagination(body);
  const embedded = new Map(body.data.filter(row => row.tournament).map(row => [row.tournament.id, normalizeTournament(row.tournament)]));
  const ids = [...new Set(body.data.filter(row => !row.tournament).map(row => /^\/api\/tournaments\/(\d+)$/.exec(row.connections?.tournament || '')?.[1]).filter(Boolean))];
  const events = new Map([...embedded, ...await Promise.all(ids.map(async eventId => {
    const event = await read(`https://padelapi.org/api/tournaments/${eventId}`);
    return [Number(eventId), event ? normalizeTournament(event) : null];
  }))]);
  return { matches: body.data.map(row => {
    const eventId = Number(/^\/api\/tournaments\/(\d+)$/.exec(row.connections?.tournament || '')?.[1]);
    return normalizeExploreMatch(row, events.get(row.tournament?.id || eventId));
  }), ...meta };
}

export async function currentTour(listing, read, now = () => new Date()) {
  const meta = pagination(listing);
  if (meta.pages !== 1) throw new Error('Current tournament listing is incomplete.');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
  const tournaments = listing.data.map(normalizeTournament).filter(event => event.status === 'live' || event.status === 'pending' && event.startDate.slice(0,10) <= day && event.endDate.slice(0,10) >= day);
  if (tournaments.length > 12) throw new Error('Current tournament coverage exceeds request budget.');
  const matches = [];
  for (const tournament of tournaments) {
    for (let page = 1, pages = 1; page <= pages; page++) {
      const body = await read(`https://padelapi.org/api/tournaments/${tournament.id}/matches?draw=main&per_page=50&page=${page}&sort_by=played_at&order_by=desc`);
      const paginationInfo = pagination(body);
      pages = paginationInfo.pages;
      if (paginationInfo.page !== page || pages > 8) throw new Error('Current tournament pagination is incomplete.');
      matches.push(...body.data.map(row => normalizeExploreMatch(row,tournament)));
    }
  }
  return { tournaments, matches: [...new Map(matches.map(match => [match.id,match])).values()], updatedAt: now().toISOString(), coverage: 'All published main-draw rounds from current international events' };
}
