// SELECT-only data boundary. Do not add RPCs, edge functions or mutations here.
export const PLAYER_FIELDS = 'id,name,email,contact_number,image_url,points,rank_label,win_rate,category,level,age_group,gender,region,home_club,club_id,nationality,license_type,paid_registration,rankedin_id,bio,approved,account_type,created_at,last_login,racket_brand,sponsors,playing_hand,court_side';
export const PAGE_SIZE = 50;
export const activeTemporaryLicenses = player => ({...player,temporary_licenses:(player.temporary_licenses||[]).filter(row=>!row.revoked_at)});

export async function readAll(makeQuery, signal, onProgress) {
  const rows = [];
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  onProgress?.(0);
  // Match the server's actual returned page size; do not assume its row cap is 1000.
  for (let offset = 0; ; ) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    let query = makeQuery().range(offset, offset + 499);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    offset += data.length;
    onProgress?.(rows.length);
  }
  return rows;
}

export function directoryLicense(player) {
  if (player.paid_registration !== true) return { key: 'unpaid', label: 'Unpaid / no licence', tone: 'warning' };
  if (player.license_type === 'full') return { key: 'full', label: 'Full licence', tone: 'payment' };
  if (player.license_type === 'temporary') return { key: 'temporary', label: 'Temporary licence', tone: 'info' };
  return { key: 'unknown', label: 'Licence needs checking', tone: 'neutral' };
}

export const isPublicPlayer = (player) => player.approved !== false && player.paid_registration === true && player.license_type === 'full';
export const textValue = (value, fallback = 'Not recorded') => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(v => textValue(v, '')).filter(Boolean).join(', ') || fallback;
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k.replaceAll('_', ' ')}: ${textValue(v)}`).join(' · ');
  return String(value);
};
export const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not recorded';
export const moneyLabel = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value)) : 'Not available';

export function filterPlayers(players, filters) {
  const q = (filters.q || '').trim().toLowerCase();
  return players.filter(p => (!q || [p.name, p.email, p.id, p.contact_number, p.home_club, p.rankedin_id].some(v => String(v || '').toLowerCase().includes(q)))
    && (!filters.licence || directoryLicense(p).key === filters.licence)
    && (!filters.visibility || (filters.visibility === 'visible') === isPublicPlayer(p))
    && (!filters.region || (p.region || '__unassigned') === filters.region)
    && (!filters.category || (p.category || '__unassigned') === filters.category))
    .sort((a, b) => filters.sort === 'name' ? (a.name || '').localeCompare(b.name || '')
      : filters.sort === 'points' ? (Number(b.points) || 0) - (Number(a.points) || 0)
        : String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

export function playerStats(players) {
  const counts = { total: players.length, full: 0, temporary: 0, unpaid: 0, unknown: 0, visible: 0 };
  for (const player of players) { counts[directoryLicense(player).key]++; if (isPublicPlayer(player)) counts.visible++; }
  return counts;
}

export function distribution(rows, field) {
  const counts = new Map();
  rows.forEach(row => { const key = textValue(row[field], 'Unassigned'); counts.set(key, (counts.get(key) || 0) + 1); });
  return [...counts].sort((a, b) => b[1] - a[1]);
}

export async function loadDirectory(client, signal) {
  const [players, paymentResult, eventResult, clubResult] = await Promise.all([
    readAll(() => client.from('players').select(`${PLAYER_FIELDS},temporary_licenses(id,event_id,event_name,event_date,created_at,revoked_at)`).order('id'), signal),
    readAll(() => client.from('payments').select('id,player_id,created_at,amount,payment_type,status').in('payment_type', ['membership', 'full_license']).eq('status', 'success').order('id'), signal).then(data => ({ data }), error => ({ error })),
    readAll(() => client.from('calendar').select('id,event_name,start_date').order('id'), signal).then(data => ({ data }), error => ({ error })),
    readAll(() => client.from('clubs').select('id,name').order('id'), signal).then(data => ({ data }), error => ({ error })),
  ]);
  const clubs = clubResult.data || [];
  return { players: players.map(p => ({ ...activeTemporaryLicenses(p), home_club: p.home_club || clubs.find(c => String(c.id) === String(p.club_id))?.name || null })), clubs, membershipPayments: paymentResult.data || [], events: eventResult.data || [], warnings: [paymentResult.error && 'Licence-payment history could not be read.', eventResult.error && 'The calendar could not be read.', clubResult.error && 'Club names could not be read.'].filter(Boolean), paymentsAvailable: !paymentResult.error };
}

export async function loadPlayerConnections(client, player, signal) {
  const warnings = [];
  const safe = async (label, promise) => { try { return await promise; } catch (error) { if (signal?.aborted) throw error; warnings.push(`${label} could not be read. This is not a zero balance or an empty history.`); return []; } };
  // Escape ILIKE wildcards so one identity never expands into other players.
  const email = String(player.email || '').trim().replace(/[\\%_]/g, '\\$&');
  const registrations = email ? await safe('Registrations', readAll(() => client.from('event_registrations').select('*').ilike('email', email).order('id'), signal)) : [];
  if (!email) warnings.push('No email is recorded; event registrations cannot be matched safely.');
  const ids = [...new Set(registrations.map(r => r.event_id).filter(Boolean))];
  const ownPayments = await safe('Player payments', readAll(() => client.from('payments').select('*').eq('player_id', player.id).order('id'), signal));
  const eventPayments = [];
  const teamRegistrations = [];
  const events = [];
  for (let i = 0; i < ids.length; i += 30) {
    const batch = ids.slice(i, i + 30);
    const result = await Promise.all([
      safe('Event payments', readAll(() => client.from('payments').select('*').in('event_id', batch).order('id'), signal)),
      safe('Team registrations', readAll(() => client.from('event_registrations').select('*').in('event_id', batch).order('id'), signal)),
      safe('Event details', readAll(() => client.from('calendar').select('id,event_name,start_date,venue').in('id', batch).order('id'), signal)),
    ]);
    eventPayments.push(...result[0]); teamRegistrations.push(...result[1]); events.push(...result[2]);
  }
  const payments = [...new Map([...ownPayments, ...eventPayments].map(p => [p.id, p])).values()];
  const emails = [...new Set(registrations.map(r => r.partner_email?.trim().toLowerCase()).filter(Boolean))];
  const partners = [];
  for (const partnerEmail of emails) {
    const matches = await safe('Partner profiles', readAll(() => client.from('players').select(`${PLAYER_FIELDS},temporary_licenses(id,event_id,event_name,event_date,created_at,revoked_at)`).ilike('email', partnerEmail.replace(/[\\%_]/g, '\\$&')).order('id'), signal));
    if (matches.length > 1) warnings.push('Multiple profiles match a partner email. The ambiguous profile link has been left unresolved.');
    else partners.push(...matches.map(activeTemporaryLicenses));
  }
  return { registrations, payments, ownPayments, teamRegistrations, events, partners, warnings: [...new Set(warnings)] };
}
