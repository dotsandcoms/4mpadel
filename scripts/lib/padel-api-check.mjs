// Server/terminal use only. Do not import this module into the React application.
const API_ORIGIN = 'https://padelapi.org';
const HIDDEN = 'hidden_free_plan';

export class PadelCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PadelCheckError';
  }
}

export function createPadelReader(token, fetchImpl = fetch) {
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) {
    throw new PadelCheckError('Set PADEL_API_TOKEN in .env.local before running this check.');
  }
  return async (path, params = {}) => {
    // Construct our own URLs; never send credentials to provider-supplied links.
    if (!/^\/api\/(rankings|players\/\d+(\/matches)?)$/.test(path)) {
      throw new PadelCheckError('Unsupported Padel API check endpoint.');
    }
    const url = new URL(path, API_ORIGIN);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      // Do not print raw transport exceptions, request headers or provider bodies.
      throw new PadelCheckError('Padel API could not be reached within 20 seconds. Check the connection and retry.');
    }
    if (!response.ok) {
      const messages = {
        401: 'Padel API rejected the token. Check that it is active and copied correctly.',
        402: 'This endpoint requires a different Padel API plan. Review access before building this feature.',
        403: 'Padel API denied access to this endpoint.',
        404: 'Padel API could not find this resource. Check for a merged or removed player.',
        422: 'Padel API rejected the query parameters. Recheck the current endpoint contract.',
        429: 'Padel API rate limit reached. Wait for the quota to reset before retrying.',
      };
      throw new PadelCheckError(messages[response.status] || `Padel API returned HTTP ${response.status}; the check stopped.`);
    }
    try {
      return await response.json();
    } catch {
      throw new PadelCheckError('Padel API returned a response that is not valid JSON.');
    }
  };
}

function requireRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PadelCheckError('Unexpected Padel API resource shape. Inspect the contract before integration.');
  }
  return value;
}

function requirePlayer(value) {
  const player = requireRecord(value);
  if (!Number.isSafeInteger(player.id) || player.id < 1 || typeof player.name !== 'string' || !player.name.trim()) {
    throw new PadelCheckError('Padel API player is missing a usable ID or name.');
  }
  return player;
}

function requirePage(value) {
  const page = requireRecord(value);
  if (!Array.isArray(page.data) || !page.meta || !Number.isInteger(page.meta.current_page)) {
    throw new PadelCheckError('Unexpected Padel API pagination. Inspect the contract before integration.');
  }
  return page.data;
}

export function hiddenFields(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return item === HIDDEN ? [path] : hiddenFields(item, path);
  });
}

// Six small sequential reads, paced below the documented free-tier minute limit.
// This samples one player per category; it is not a full coverage or reliability audit.
export async function checkPadelAccess({ read, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = new Date() }) {
  const report = { checkedAt: now.toISOString(), categories: [] };
  let requests = 0;
  const get = async (path, params) => {
    if (requests++) await wait(6_500);
    return read(path, params);
  };
  const recentDate = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  for (const category of ['men', 'women']) {
    const rankings = requirePage(await get('/api/rankings', {
      category, type: 'official', sort_by: 'ranking', order_by: 'asc', per_page: 5, page: 1,
    }));
    if (!rankings.length) throw new PadelCheckError(`No ${category} rankings returned. We need a usable sample before continuing.`);
    rankings.forEach((row) => {
      requirePlayer(row);
      if (row.category !== category || row.type !== 'official' || !Number.isInteger(row.ranking) || row.ranking < 1) {
        throw new PadelCheckError('Current official rankings were unavailable or did not match the requested category.');
      }
    });
    const selected = rankings[0];
    const player = requirePlayer(await get(`/api/players/${selected.id}`));
    if (player.id !== selected.id || player.category !== category) {
      throw new PadelCheckError('Player identity differs between rankings and profile. Check provider identity redirects.');
    }
    const matches = requirePage(await get(`/api/players/${player.id}/matches`, {
      after_date: recentDate, sort_by: 'played_at', order_by: 'desc', per_page: 5, page: 1,
    }));
    matches.forEach((match) => {
      requireRecord(match);
      const teams = match.players;
      if (!Number.isSafeInteger(match.id) || match.id < 1 || typeof match.status !== 'string' ||
          !Array.isArray(teams?.team_1) || !Array.isArray(teams?.team_2) ||
          ![...teams.team_1, ...teams.team_2].some((item) => item?.id === player.id)) {
        throw new PadelCheckError('Match data is missing the player relationships required for the following feed.');
      }
    });
    report.categories.push({
      category,
      rankingRows: rankings.length,
      player: { id: player.id, name: player.name },
      matchRows: matches.length,
      matchStatuses: [...new Set(matches.map((match) => match.status))],
      restrictedFields: [...new Set(hiddenFields({ rankings, player, matches }))],
      note: matches.length ? 'Sample relationships verified; full coverage remains to be checked.' : 'No recent matches in sample; feed coverage is not yet verified.',
    });
  }
  return report;
}
