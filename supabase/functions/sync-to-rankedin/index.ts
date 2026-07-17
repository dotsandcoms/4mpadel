/**
 * sync-to-rankedin
 *
 * Phase 1 — link + class mapping (read RankedIn, write mappings to 4M).
 * Phase 2 — push paid doubles teams into mapped RankedIn classes via
 *   tournament/GetAutoAddModelAsync → MultiSignInDoublesAsync
 *   (same flow as https://www.rankedin.com/en/tournament/autoadd/{id}?tournamentclassid=…)
 * Phase 3 — push tournament details (name, dates, location, regulations) via
 *   tournament/GetEditModelAsync → tournament/editasync
 *
 * POST body: { eventId: number, rankedinId?: string, pushEntries?: boolean, pushDetails?: boolean }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_BASE = 'https://api.rankedin.com/v1';
/** RankedIn EventTypes.Tournament */
const EVENT_TYPE_TOURNAMENT = 4;

const SUPER_ADMINS = [
  'bradein@dotsandcoms.co.za',
  'brad@dotsandcoms.co.za',
  'admin@4mpadel.co.za',
  'markstillerman@gmail.com',
];

const extractRankedinId = (value: unknown): string | null => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/\/(?:tournament|clubleague|draws|results)\/(\d+)/i)
    || raw.match(/[?&]id=(\d+)/i)
    || raw.match(/\/(\d+)(?:\/|$)/);
  return match ? match[1] : null;
};

const normalizeName = (name: string) =>
  String(name || '')
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const buildTournamentUrl = (id: string, slug = '') => {
  const cleanSlug = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  return cleanSlug
    ? `https://www.rankedin.com/en/tournament/${id}/${cleanSlug}`
    : `https://www.rankedin.com/en/tournament/${id}`;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const LOG_PREFIX = '[sync-to-rankedin]';

/** Structured edge logs — visible in Supabase → Edge Functions → Logs */
function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  details?: Record<string, unknown>,
) {
  const payload = details ? { msg: message, ...details } : { msg: message };
  const line = `${LOG_PREFIX} ${JSON.stringify(payload)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const isPaidStatus = (status: unknown) =>
  String(status || '').toLowerCase() === 'paid';

const isWithdrawn = (reg: { status?: string | null }) =>
  String(reg.status || '').toLowerCase() === 'withdrawn';

type RankedinAuth = { cookie: string };

function extractSetCookieHeader(res: Response): string {
  const fromGetter = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [];
  if (fromGetter.length > 0) {
    return fromGetter.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
  }
  // Deno/edge fallbacks — Set-Cookie may be a single joined header.
  const raw = res.headers.get('set-cookie') || '';
  if (!raw) return '';
  return raw
    .split(/,(?=\s*[^;=]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function loginRankedin(email: string, password: string): Promise<RankedinAuth> {
  log('info', 'RankedIn login starting', {
    emailDomain: String(email).includes('@') ? String(email).split('@')[1] : '(invalid)',
  });
  const res = await fetch(`${API_BASE}/Account/LogInAsync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://www.rankedin.com',
      Referer: 'https://www.rankedin.com/',
    },
    body: JSON.stringify({
      username: email,
      password,
      rememberMe: true,
      TimezoneOffset: 120,
      ClientPlatform: '4m-padel-sync',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log('error', 'RankedIn login HTTP failure', {
      status: res.status,
      body: body.slice(0, 300),
    });
    throw new Error(`RankedIn login failed (HTTP ${res.status})`);
  }
  const cookie = extractSetCookieHeader(res);
  if (!cookie || !/rin-auth=/i.test(cookie)) {
    log('error', 'RankedIn login missing rin-auth cookie', {
      cookieKeys: cookie
        ? cookie.split('; ').map((p) => p.split('=')[0])
        : [],
    });
    throw new Error('RankedIn login succeeded but no rin-auth session cookie was returned');
  }
  log('info', 'RankedIn login ok');
  return { cookie };
}

function rankedinHeaders(auth: RankedinAuth, referer?: string): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://www.rankedin.com',
    Referer: referer || 'https://www.rankedin.com/',
    Cookie: auth.cookie,
  };
}

/**
 * Format a timestamptz into RankedIn's local wall-clock string
 * (e.g. 2026-07-24T17:00:00) using the tournament UTC offset.
 */
function formatRankedinLocalDate(
  iso: string | null | undefined,
  offsetMinutes: number,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() + offsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = String(local.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
}

function venueNameFromEvent(event: {
  venue?: string | null;
  venues?: string[] | null;
}): string {
  if (Array.isArray(event.venues) && event.venues.length > 0) {
    return event.venues.map((v) => String(v || '').trim()).filter(Boolean).join(' / ');
  }
  return String(event.venue || '').trim();
}

/** Build RankedIn Regulations HTML from 4M event content fields. */
function buildRegulationsHtml(event: {
  description?: string | null;
  sanctioning_details?: string | null;
  rules_regs?: string | null;
}): string {
  const parts: string[] = [];
  if (String(event.description || '').trim()) {
    parts.push(`<h3>Event Information</h3>${event.description}`);
  }
  if (String(event.sanctioning_details || '').trim()) {
    parts.push(`<h3>Sanctioning</h3>${event.sanctioning_details}`);
  }
  if (String(event.rules_regs || '').trim()) {
    parts.push(`<h3>Rules &amp; Regulations</h3>${event.rules_regs}`);
  }
  return parts.join('\n');
}

type DetailsPushResult = {
  status: string;
  updated: string[];
  errors: string[];
  message?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

/**
 * Push 4M tournament details onto RankedIn edit model (get → merge → editasync).
 * Preserves RankedIn-only fields (club, payment, courts metadata, etc.).
 */
async function pushTournamentDetails(opts: {
  event: Record<string, unknown>;
  rankedinId: string;
  auth: RankedinAuth;
}): Promise<DetailsPushResult> {
  const { event, rankedinId, auth } = opts;
  const result: DetailsPushResult = {
    status: 'ok',
    updated: [],
    errors: [],
  };

  const referer = `https://www.rankedin.com/en/tournament/edit/${rankedinId}`;
  log('info', 'Phase 3 details sync starting', { rankedinId });

  const modelRes = await fetch(
    `${API_BASE}/tournament/GetEditModelAsync?tournamentId=${rankedinId}`,
    { headers: rankedinHeaders(auth, referer) },
  );
  if (!modelRes.ok) {
    const body = await modelRes.text().catch(() => '');
    log('error', 'GetEditModelAsync failed', {
      rankedinId,
      status: modelRes.status,
      body: body.slice(0, 300),
    });
    result.status = 'error';
    result.errors.push(`GetEditModelAsync failed (HTTP ${modelRes.status})`);
    result.message = result.errors[0];
    return result;
  }

  const model = await modelRes.json();
  const offset = Number(model.UtcoffsetInMinutes ?? 120) || 120;
  const location = { ...(model.Location || {}) };
  const updated: string[] = [];

  result.before = {
    TournamentName: model.TournamentName,
    StartDate: model.StartDate,
    EndDate: model.EndDate,
    CloseSignInDate: model.CloseSignInDate,
    Location: {
      mp_name: location.mp_name,
      mp_city: location.mp_city,
      mp_address: location.mp_address,
    },
    RegulationsLength: String(model.Regulations || '').length,
  };

  const name = String(event.event_name || '').trim();
  if (name && name !== String(model.TournamentName || '').trim()) {
    model.TournamentName = name;
    updated.push('TournamentName');
  }

  const start = formatRankedinLocalDate(event.start_date as string, offset);
  if (start && start !== model.StartDate) {
    model.StartDate = start;
    updated.push('StartDate');
  }

  const end = formatRankedinLocalDate(event.end_date as string, offset);
  if (end && end !== model.EndDate) {
    model.EndDate = end;
    updated.push('EndDate');
  }

  const close = formatRankedinLocalDate(event.registration_closes_at as string, offset);
  if (close && close !== model.CloseSignInDate) {
    model.CloseSignInDate = close;
    updated.push('CloseSignInDate');
  }

  const venueName = venueNameFromEvent(event as { venue?: string; venues?: string[] });
  const city = String(event.city || '').trim();
  const address = String(event.address || '').trim();
  if (venueName && venueName !== String(location.mp_name || '').trim()) {
    location.mp_name = venueName;
    updated.push('Location.mp_name');
  }
  if (city && city !== String(location.mp_city || '').trim()) {
    location.mp_city = city;
    updated.push('Location.mp_city');
  }
  if (address && address !== String(location.mp_address || '').trim()) {
    location.mp_address = address;
    updated.push('Location.mp_address');
  }
  model.Location = location;

  const regulations = buildRegulationsHtml(event as {
    description?: string;
    sanctioning_details?: string;
    rules_regs?: string;
  });
  if (regulations && regulations !== String(model.Regulations || '')) {
    model.Regulations = regulations;
    updated.push('Regulations');
  }

  // Required by RankedIn editasync — omitting SelectedRankings returns Code: 1
  if (!Array.isArray(model.SelectedRankings)) {
    model.SelectedRankings = [];
  }
  model.IsEdit = true;
  model.Id = Number(rankedinId);

  if (updated.length === 0) {
    result.status = 'noop';
    result.message = 'RankedIn tournament details already match 4M';
    log('info', 'Phase 3 details noop — nothing to update', { rankedinId });
    return result;
  }

  log('info', 'Phase 3 posting editasync', { rankedinId, updated });

  const saveRes = await fetch(`${API_BASE}/tournament/editasync`, {
    method: 'POST',
    headers: rankedinHeaders(auth, referer),
    body: JSON.stringify(model),
  });
  const saveText = await saveRes.text();
  if (!saveRes.ok) {
    log('error', 'editasync failed', {
      rankedinId,
      status: saveRes.status,
      body: saveText.slice(0, 400),
      updated,
    });
    result.status = 'error';
    result.errors.push(`editasync failed (HTTP ${saveRes.status}): ${saveText.slice(0, 200)}`);
    result.message = result.errors[0];
    return result;
  }

  result.updated = updated;
  result.after = {
    TournamentName: model.TournamentName,
    StartDate: model.StartDate,
    EndDate: model.EndDate,
    CloseSignInDate: model.CloseSignInDate,
    Location: {
      mp_name: model.Location?.mp_name,
      mp_city: model.Location?.mp_city,
      mp_address: model.Location?.mp_address,
    },
    RegulationsLength: String(model.Regulations || '').length,
  };
  result.message = `Updated ${updated.join(', ')}`;
  log('info', 'Phase 3 details sync ok', {
    rankedinId,
    updated,
    saveResponse: saveText.slice(0, 80),
  });
  return result;
}

/** Resolve players.rankedin_id (numeric or R00…) to RankedIn numeric PlayerId. */
async function resolveNumericPlayerId(
  auth: RankedinAuth,
  rankedinIdRaw: string | number | null | undefined,
  cache: Map<string, number | null>,
): Promise<number | null> {
  if (rankedinIdRaw == null) return null;
  const raw = String(rankedinIdRaw).trim();
  if (!raw) return null;
  if (cache.has(raw)) return cache.get(raw) ?? null;

  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    cache.set(raw, id);
    return id;
  }

  const rCode = raw.toUpperCase().startsWith('R') ? raw.toUpperCase() : `R${raw}`;
  try {
    const res = await fetch(
      `${API_BASE}/player/playerprofileinfoasync?rankedinId=${encodeURIComponent(rCode)}&language=en`,
      { headers: rankedinHeaders(auth) },
    );
    if (!res.ok) {
      cache.set(raw, null);
      return null;
    }
    const data = await res.json();
    const id = Number(data?.Id ?? data?.Header?.PlayerId ?? 0);
    const resolved = id > 0 ? id : null;
    cache.set(raw, resolved);
    return resolved;
  } catch {
    cache.set(raw, null);
    return null;
  }
}

type ExistingTeamIds = Set<string>;

function teamKey(idA: number, idB: number) {
  return [idA, idB].sort((a, b) => a - b).join(':');
}

function collectPlayerIdsFromNode(node: unknown, into: number[]) {
  if (!node || typeof node !== 'object') return;
  const p = node as Record<string, unknown>;
  for (const key of ['Id', 'PlayerId', 'ParticipantId']) {
    const n = Number(p[key]);
    // ParticipantId can equal FirstPlayer id for doubles — still useful for membership.
    if (n > 0 && !into.includes(n)) into.push(n);
  }
}

/**
 * RankedIn GetPlayersForClassAsync nests doubles as:
 * Participants[].Participant.{FirstPlayer,SecondPlayer}.Id
 */
async function loadExistingClassPlayerIds(
  auth: RankedinAuth,
  tournamentId: string,
  classId: string,
): Promise<{ playerIds: Set<number>; teamKeys: ExistingTeamIds }> {
  const playerIds = new Set<number>();
  const teamKeys: ExistingTeamIds = new Set();
  const url =
    `${API_BASE}/tournament/GetPlayersForClassAsync?tournamentId=${tournamentId}`
    + `&tournamentClassId=${classId}&language=en`;
  const res = await fetch(url, { headers: rankedinHeaders(auth) });
  if (!res.ok) return { playerIds, teamKeys };
  const data = await res.json();

  const registerPair = (idA: number, idB: number) => {
    if (idA > 0) playerIds.add(idA);
    if (idB > 0) playerIds.add(idB);
    if (idA > 0 && idB > 0) teamKeys.add(teamKey(idA, idB));
  };

  const walkEntry = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') return;
    const root = entry as Record<string, unknown>;
    const participant = (root.Participant && typeof root.Participant === 'object')
      ? root.Participant as Record<string, unknown>
      : root;

    const first = participant.FirstPlayer || participant.Player1 || participant.PlayerOne;
    const second = participant.SecondPlayer || participant.Player2 || participant.PlayerTwo;
    const firstIds: number[] = [];
    const secondIds: number[] = [];
    collectPlayerIdsFromNode(first, firstIds);
    collectPlayerIdsFromNode(second, secondIds);

    if (firstIds[0] || secondIds[0]) {
      registerPair(firstIds[0] || 0, secondIds[0] || 0);
      return;
    }

    // Fallback: flatten any nested id-looking fields
    const flat: number[] = [];
    collectPlayerIdsFromNode(participant, flat);
    collectPlayerIdsFromNode(root, flat);
    for (const id of flat) playerIds.add(id);
    if (flat.length >= 2) teamKeys.add(teamKey(flat[0], flat[1]));
  };

  for (const p of data?.Participants || []) walkEntry(p);
  for (const t of data?.Teams || []) {
    walkEntry(t);
    for (const p of t?.Players || t?.Participants || []) walkEntry(p);
  }
  return { playerIds, teamKeys };
}

type PushSkip = {
  reason: string;
  division?: string;
  names?: string[];
  emails?: string[];
};

function summarizeSkips(skipped: PushSkip[]) {
  const counts: Record<string, number> = {};
  for (const s of skipped) {
    const key = s.reason || 'other';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

type PushResult = {
  status: string;
  credentialsConfigured: boolean;
  pushed: number;
  skipped: PushSkip[];
  errors: string[];
  byDivision: Array<{
    divisionName: string;
    rankedinClassId: string;
    pushed: number;
    skipped: number;
  }>;
  message?: string;
};

async function pushPaidRegistrations(opts: {
  supabaseAdmin: ReturnType<typeof createClient>;
  eventId: number;
  rankedinId: string;
  mapped: Array<{
    divisionId: string;
    divisionName: string;
    rankedinClassId: string;
    rankedinClassName: string;
  }>;
  auth: RankedinAuth;
}): Promise<PushResult> {
  const { supabaseAdmin, eventId, rankedinId, mapped, auth } = opts;
  const result: PushResult = {
    status: 'ok',
    credentialsConfigured: true,
    pushed: 0,
    skipped: [],
    errors: [],
    byDivision: [],
  };

  log('info', 'Phase 2 push starting', {
    eventId,
    rankedinId,
    mappedDivisions: mapped.map((m) => ({
      name: m.divisionName,
      classId: m.rankedinClassId,
    })),
  });

  if (mapped.length === 0) {
    result.status = 'skipped';
    result.message = 'No divisions mapped to RankedIn classes — create matching classes then re-sync';
    log('warn', 'Phase 2 skipped — no mapped divisions', { eventId, rankedinId });
    return result;
  }

  const { data: regs, error: regError } = await supabaseAdmin
    .from('event_registrations')
    .select(
      'id, email, full_name, partner_email, partner_name, partner_payment_status, payment_status, status, division, division_id',
    )
    .eq('event_id', eventId);
  if (regError) throw regError;

  const active = (regs || []).filter((r) => !isWithdrawn(r));
  log('info', 'Loaded registrations', {
    eventId,
    total: regs?.length || 0,
    active: active.length,
    withdrawn: (regs?.length || 0) - active.length,
  });

  const emails = new Set<string>();
  for (const r of active) {
    if (r.email) emails.add(String(r.email).toLowerCase());
    if (r.partner_email) emails.add(String(r.partner_email).toLowerCase());
  }

  const emailList = [...emails];
  const playersByEmail = new Map<string, { email: string; name: string | null; rankedin_id: string | null }>();
  const chunkSize = 40;
  for (let i = 0; i < emailList.length; i += chunkSize) {
    const chunk = emailList.slice(i, i + chunkSize);
    const orFilter = chunk.map((email) => `email.ilike.${email}`).join(',');
    const { data: players, error: playersError } = await supabaseAdmin
      .from('players')
      .select('email, name, rankedin_id')
      .or(orFilter);
    if (playersError) throw playersError;
    for (const p of players || []) {
      if (p.email) playersByEmail.set(String(p.email).toLowerCase(), p);
    }
  }

  const withRankedinId = [...playersByEmail.values()].filter((p) => p.rankedin_id).length;
  log('info', 'Player profiles resolved', {
    emails: emailList.length,
    profilesFound: playersByEmail.size,
    withRankedinId,
  });

  const playerIdCache = new Map<string, number | null>();

  type Couple = {
    divisionName: string;
    classId: string;
    names: [string, string];
    emails: [string, string];
    playerIds: [number, number];
  };

  const couplesByClass = new Map<string, Couple[]>();

  for (const m of mapped) {
    const divRegs = active.filter((r) => {
      if (r.division_id && r.division_id === m.divisionId) return true;
      return normalizeName(r.division || '') === normalizeName(m.divisionName);
    });
    const processed = new Set<string>();
    log('info', 'Building couples for division', {
      division: m.divisionName,
      classId: m.rankedinClassId,
      registrationRows: divRegs.length,
    });

    for (const reg of divRegs) {
      if (processed.has(reg.id)) continue;
      processed.add(reg.id);

      const partnerEmail = (reg.partner_email || '').toLowerCase();
      const partner = partnerEmail
        ? divRegs.find((r) => r.id !== reg.id && (r.email || '').toLowerCase() === partnerEmail)
        : null;

      if (!partner) {
        if (partnerEmail || (reg.partner_name || '').trim()) {
          result.skipped.push({
            reason: 'partner_row_missing',
            division: m.divisionName,
            names: [reg.full_name, reg.partner_name].filter(Boolean) as string[],
            emails: [reg.email, reg.partner_email].filter(Boolean) as string[],
          });
        } else {
          result.skipped.push({
            reason: 'solo_entry',
            division: m.divisionName,
            names: [reg.full_name].filter(Boolean) as string[],
            emails: [reg.email].filter(Boolean) as string[],
          });
        }
        continue;
      }
      processed.add(partner.id);

      if (!isPaidStatus(reg.payment_status) || !isPaidStatus(partner.payment_status)) {
        result.skipped.push({
          reason: 'not_both_paid',
          division: m.divisionName,
          names: [reg.full_name, partner.full_name],
          emails: [reg.email, partner.email],
        });
        continue;
      }

      const p1 = playersByEmail.get((reg.email || '').toLowerCase());
      const p2 = playersByEmail.get((partner.email || '').toLowerCase());
      if (!p1?.rankedin_id || !p2?.rankedin_id) {
        result.skipped.push({
          reason: 'missing_rankedin_id',
          division: m.divisionName,
          names: [reg.full_name, partner.full_name],
          emails: [reg.email, partner.email],
        });
        continue;
      }

      const id1 = await resolveNumericPlayerId(auth, p1.rankedin_id, playerIdCache);
      const id2 = await resolveNumericPlayerId(auth, p2.rankedin_id, playerIdCache);
      if (!id1 || !id2) {
        log('warn', 'Could not resolve RankedIn numeric player id', {
          division: m.divisionName,
          names: [reg.full_name, partner.full_name],
          rankedinIds: [p1.rankedin_id, p2.rankedin_id],
          resolved: [id1, id2],
        });
        result.skipped.push({
          reason: 'rankedin_id_unresolved',
          division: m.divisionName,
          names: [reg.full_name, partner.full_name],
          emails: [reg.email, partner.email],
        });
        continue;
      }
      if (id1 === id2) {
        result.skipped.push({
          reason: 'same_rankedin_id',
          division: m.divisionName,
          names: [reg.full_name, partner.full_name],
          emails: [reg.email, partner.email],
        });
        continue;
      }

      const couple: Couple = {
        divisionName: m.divisionName,
        classId: m.rankedinClassId,
        names: [reg.full_name || p1.name || '', partner.full_name || p2.name || ''],
        emails: [reg.email, partner.email],
        playerIds: [id1, id2],
      };
      const list = couplesByClass.get(m.rankedinClassId) || [];
      list.push(couple);
      couplesByClass.set(m.rankedinClassId, list);
    }
  }

  for (const m of mapped) {
    const couples = couplesByClass.get(m.rankedinClassId) || [];
    const divStats = {
      divisionName: m.divisionName,
      rankedinClassId: m.rankedinClassId,
      pushed: 0,
      skipped: 0,
    };

    if (couples.length === 0) {
      log('info', 'No eligible paid couples for division', {
        division: m.divisionName,
        classId: m.rankedinClassId,
      });
      result.byDivision.push(divStats);
      continue;
    }

    const { playerIds: existingPlayers, teamKeys: existingTeams } =
      await loadExistingClassPlayerIds(auth, rankedinId, m.rankedinClassId);
    log('info', 'Existing RankedIn class participants', {
      division: m.divisionName,
      classId: m.rankedinClassId,
      existingPlayerCount: existingPlayers.size,
      existingTeamCount: existingTeams.size,
      eligibleCouples: couples.length,
    });

    const toPush: Couple[] = [];
    for (const c of couples) {
      const key = teamKey(c.playerIds[0], c.playerIds[1]);
      // Skip if this pair exists, or either player is already in the class
      // (RankedIn returns Code 1315 on duplicate / conflict sign-ins).
      if (
        existingTeams.has(key)
        || existingPlayers.has(c.playerIds[0])
        || existingPlayers.has(c.playerIds[1])
      ) {
        log('info', 'Skip couple — already on RankedIn', {
          division: m.divisionName,
          names: c.names,
          playerIds: c.playerIds,
        });
        result.skipped.push({
          reason: 'already_on_rankedin',
          division: m.divisionName,
          names: c.names,
          emails: c.emails,
        });
        divStats.skipped += 1;
        continue;
      }
      toPush.push(c);
    }

    if (toPush.length === 0) {
      log('info', 'Nothing left to push for division after dedupe', {
        division: m.divisionName,
        classId: m.rankedinClassId,
      });
      result.byDivision.push(divStats);
      continue;
    }

    const referer =
      `https://www.rankedin.com/en/tournament/autoadd/${rankedinId}?tournamentclassid=${m.rankedinClassId}`;
    const modelRes = await fetch(
      `${API_BASE}/tournament/GetAutoAddModelAsync?tournamentId=${rankedinId}&tournamentClassId=${m.rankedinClassId}`,
      { headers: rankedinHeaders(auth, referer) },
    );
    if (!modelRes.ok) {
      const body = await modelRes.text().catch(() => '');
      log('error', 'GetAutoAddModelAsync failed', {
        division: m.divisionName,
        classId: m.rankedinClassId,
        status: modelRes.status,
        body: body.slice(0, 300),
      });
      result.errors.push(
        `GetAutoAddModelAsync failed for ${m.divisionName} (HTTP ${modelRes.status})`,
      );
      result.byDivision.push(divStats);
      continue;
    }
    const model = await modelRes.json();
    const endPoint = String(model?.EndPoint || model?.endPoint || '').trim();
    if (!endPoint) {
      log('error', 'AutoAdd model missing EndPoint', {
        division: m.divisionName,
        classId: m.rankedinClassId,
        modelKeys: Object.keys(model || {}),
      });
      result.errors.push(`No AutoAdd EndPoint for class ${m.rankedinClassId} (${m.divisionName})`);
      result.byDivision.push(divStats);
      continue;
    }
    log('info', 'AutoAdd endpoint ready', {
      division: m.divisionName,
      classId: m.rankedinClassId,
      endPoint,
      toPush: toPush.length,
    });

    // One couple per request — a single Code 1315 must not fail the whole class batch.
    for (const c of toPush) {
      const payload = {
        addedInvitedCouples: [[
          { PlayerId: c.playerIds[0], Invited: false, Index: 0 },
          { PlayerId: c.playerIds[1], Invited: false, Index: 1 },
        ]],
        eventId: Number(rankedinId),
        eventType: EVENT_TYPE_TOURNAMENT,
        tournamentClassId: Number(m.rankedinClassId),
      };

      log('info', 'MultiSignIn attempt', {
        division: m.divisionName,
        names: c.names,
        playerIds: c.playerIds,
        emails: c.emails,
      });

      const postRes = await fetch(endPoint, {
        method: 'POST',
        headers: rankedinHeaders(auth, referer),
        body: JSON.stringify(payload),
      });
      const postText = await postRes.text();
      let postJson: { ok?: boolean; Ok?: boolean; message?: string; Code?: number } = {};
      try {
        postJson = postText ? JSON.parse(postText) : {};
      } catch {
        postJson = {};
      }

      const isDuplicate = postRes.status === 500 && Number(postJson.Code) === 1315;
      if (isDuplicate) {
        log('warn', 'MultiSignIn duplicate (Code 1315) — treating as already on RankedIn', {
          division: m.divisionName,
          names: c.names,
          playerIds: c.playerIds,
        });
        result.skipped.push({
          reason: 'already_on_rankedin',
          division: m.divisionName,
          names: c.names,
          emails: c.emails,
        });
        divStats.skipped += 1;
        existingPlayers.add(c.playerIds[0]);
        existingPlayers.add(c.playerIds[1]);
        existingTeams.add(teamKey(c.playerIds[0], c.playerIds[1]));
        continue;
      }

      if (!postRes.ok || postJson.ok === false || postJson.Ok === false) {
        log('error', 'MultiSignIn failed', {
          division: m.divisionName,
          names: c.names,
          playerIds: c.playerIds,
          status: postRes.status,
          code: postJson.Code ?? null,
          body: postText.slice(0, 400),
        });
        result.errors.push(
          `MultiSignIn failed for ${m.divisionName} (${c.names.join(' / ')}): HTTP ${postRes.status} ${
            postJson.message || postText.slice(0, 200) || 'unknown error'
          }`,
        );
        continue;
      }

      log('info', 'MultiSignIn success', {
        division: m.divisionName,
        names: c.names,
        playerIds: c.playerIds,
      });
      divStats.pushed += 1;
      result.pushed += 1;
      existingPlayers.add(c.playerIds[0]);
      existingPlayers.add(c.playerIds[1]);
      existingTeams.add(teamKey(c.playerIds[0], c.playerIds[1]));
    }

    log('info', 'Division push complete', divStats);
    result.byDivision.push(divStats);
  }

  result.message = result.pushed > 0
    ? `Pushed ${result.pushed} paid team(s) to RankedIn`
    : (result.errors.length > 0
      ? 'No teams pushed — see errors'
      : 'No new paid teams to push (all skipped or already on RankedIn)');

  if (result.errors.length > 0 && result.pushed === 0) result.status = 'error';
  else if (result.pushed === 0) result.status = 'noop';

  log('info', 'Phase 2 push finished', {
    status: result.status,
    pushed: result.pushed,
    skippedTotal: result.skipped.length,
    skipReasons: summarizeSkips(result.skipped),
    errorCount: result.errors.length,
    errors: result.errors.slice(0, 10),
    message: result.message,
  });

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let isAuthorized = SUPER_ADMINS.some(
      (email) => email.toLowerCase() === user.email?.toLowerCase(),
    );
    if (!isAuthorized) {
      const { data: adminData } = await supabaseAdmin
        .from('admin_sidebar_permissions')
        .select('role, allowed_tabs')
        .ilike('email', user.email ?? '')
        .maybeSingle();
      if (
        adminData?.role === 'super_admin'
        || adminData?.allowed_tabs?.includes('calendar')
        || adminData?.allowed_tabs?.includes('event-management')
      ) {
        isAuthorized = true;
      }
    }
    if (!isAuthorized) throw new Error('Forbidden: Insufficient privileges');

    const body = await req.json().catch(() => ({}));
    const eventId = Number(body.eventId);
    if (!eventId) throw new Error('eventId is required');
    const pushEntries = body.pushEntries !== false;
    const pushDetails = body.pushDetails !== false;

    log('info', 'Sync request received', {
      eventId,
      pushEntries,
      pushDetails,
      requestedBy: user.email || null,
      bodyRankedinId: body.rankedinId || null,
    });

    const { data: event, error: eventError } = await supabaseAdmin
      .from('calendar')
      .select(
        'id, event_name, slug, is_manual, rankedin_id, rankedin_url, start_date, end_date, venue, venues, city, address, description, sanctioning_details, rules_regs, registration_closes_at',
      )
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) throw new Error('Event not found');
    if (!event.is_manual) {
      throw new Error('Sync to RankedIn is only available for manual (4M-hosted) events');
    }

    const rankedinId = extractRankedinId(body.rankedinId)
      || extractRankedinId(event.rankedin_id)
      || extractRankedinId(event.rankedin_url);
    if (!rankedinId) {
      throw new Error('Paste a RankedIn tournament ID or URL on the event first');
    }

    const rankedinUrl = buildTournamentUrl(rankedinId, event.slug || event.event_name || '');
    log('info', 'Event linked for sync', {
      eventId,
      eventName: event.event_name,
      rankedinId,
      rankedinUrl,
    });

    const { error: linkError } = await supabaseAdmin
      .from('calendar')
      .update({
        rankedin_id: rankedinId,
        rankedin_url: rankedinUrl,
      })
      .eq('id', eventId);
    if (linkError) throw linkError;

    const infoUrl = `${API_BASE}/tournament/GetInfoAsync?id=${rankedinId}&language=en`;
    const classesUrl = `${API_BASE}/tournament/GetClassesAndDrawNamesAsync/?tournamentId=${rankedinId}`;

    const [infoRes, classesRes] = await Promise.all([
      fetch(infoUrl, { headers: { Accept: 'application/json' } }),
      fetch(classesUrl, { headers: { Accept: 'application/json' } }),
    ]);

    if (!infoRes.ok) {
      log('error', 'RankedIn GetInfoAsync failed', {
        rankedinId,
        status: infoRes.status,
      });
      throw new Error(`RankedIn tournament ${rankedinId} not found (HTTP ${infoRes.status})`);
    }

    const infoData = await infoRes.json();
    const classesData = classesRes.ok ? await classesRes.json() : [];
    const rankedinClasses = Array.isArray(classesData)
      ? classesData
      : (classesData?.Payload || classesData?.payload || []);

    if (!classesRes.ok) {
      log('warn', 'RankedIn GetClassesAndDrawNamesAsync failed', {
        rankedinId,
        status: classesRes.status,
      });
    }

    const sidebar = infoData?.TournamentSidebarModel || infoData?.ClubleagueSidebarModel || infoData || {};
    const tournamentName = sidebar.Name || sidebar.name || infoData?.Name || `Tournament ${rankedinId}`;

    const { data: divisions, error: divError } = await supabaseAdmin
      .from('tournament_divisions')
      .select('id, name, rankedin_class_id, is_active, sort_order')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true });
    if (divError) throw divError;

    const localDivisions = (divisions || []).filter((d) => d.is_active !== false);
    const usedClassIds = new Set<string>();
    const mapped: Array<{
      divisionId: string;
      divisionName: string;
      rankedinClassId: string;
      rankedinClassName: string;
      matched: boolean;
    }> = [];
    const unmatchedLocal: Array<{ divisionId: string; divisionName: string }> = [];
    const unmatchedRankedin: Array<{ classId: string; className: string }> = [];

    for (const div of localDivisions) {
      const localNorm = normalizeName(div.name);
      let match = rankedinClasses.find((c: { Id?: string | number; Name?: string }) => {
        const classId = String(c.Id ?? '');
        if (!classId || usedClassIds.has(classId)) return false;
        return normalizeName(c.Name || '') === localNorm;
      });
      if (!match) {
        match = rankedinClasses.find((c: { Id?: string | number; Name?: string }) => {
          const classId = String(c.Id ?? '');
          if (!classId || usedClassIds.has(classId)) return false;
          const classNorm = normalizeName(c.Name || '');
          return classNorm.includes(localNorm) || localNorm.includes(classNorm);
        });
      }

      if (match?.Id != null) {
        const classId = String(match.Id);
        usedClassIds.add(classId);
        if (String(div.rankedin_class_id || '') !== classId) {
          await supabaseAdmin
            .from('tournament_divisions')
            .update({ rankedin_class_id: classId })
            .eq('id', div.id);
        }
        mapped.push({
          divisionId: div.id,
          divisionName: div.name,
          rankedinClassId: classId,
          rankedinClassName: match.Name || classId,
          matched: true,
        });
      } else {
        unmatchedLocal.push({ divisionId: div.id, divisionName: div.name });
      }
    }

    for (const c of rankedinClasses) {
      const classId = String(c.Id ?? '');
      if (!classId || usedClassIds.has(classId)) continue;
      unmatchedRankedin.push({ classId, className: c.Name || classId });
    }

    log('info', 'Phase 1 class mapping complete', {
      tournamentName,
      localDivisions: localDivisions.length,
      rankedinClasses: rankedinClasses.length,
      mapped: mapped.length,
      unmatchedLocal: unmatchedLocal.map((d) => d.divisionName),
      unmatchedRankedin: unmatchedRankedin.map((d) => d.className),
    });

    const rankedinEmail = Deno.env.get('RANKEDIN_EMAIL') || '';
    const rankedinPassword = Deno.env.get('RANKEDIN_PASSWORD') || '';
    const writePushAvailable = Boolean(rankedinEmail && rankedinPassword);

    let writePush: PushResult = {
      status: 'not_configured',
      credentialsConfigured: writePushAvailable,
      pushed: 0,
      skipped: [],
      errors: [],
      byDivision: [],
      message: writePushAvailable
        ? undefined
        : 'Set RANKEDIN_EMAIL and RANKEDIN_PASSWORD as Edge Function secrets to push paid entries.',
    };

    let detailsPush: DetailsPushResult = {
      status: 'not_configured',
      updated: [],
      errors: [],
      message: writePushAvailable
        ? undefined
        : 'Set RANKEDIN_EMAIL and RANKEDIN_PASSWORD as Edge Function secrets to push tournament details.',
    };

    if ((pushEntries || pushDetails) && writePushAvailable) {
      try {
        const auth = await loginRankedin(rankedinEmail, rankedinPassword);

        if (pushDetails) {
          try {
            detailsPush = await pushTournamentDetails({
              event: event as Record<string, unknown>,
              rankedinId,
              auth,
            });
          } catch (detailsErr) {
            const message = detailsErr instanceof Error ? detailsErr.message : String(detailsErr);
            log('error', 'Phase 3 details threw', {
              eventId,
              rankedinId,
              error: message,
              stack: detailsErr instanceof Error ? detailsErr.stack?.slice(0, 500) : undefined,
            });
            detailsPush = {
              status: 'error',
              updated: [],
              errors: [message],
              message,
            };
          }
        } else {
          detailsPush = {
            status: 'skipped_by_request',
            updated: [],
            errors: [],
            message: 'pushDetails=false',
          };
        }

        if (pushEntries) {
          writePush = await pushPaidRegistrations({
            supabaseAdmin,
            eventId,
            rankedinId,
            mapped,
            auth,
          });
        } else {
          writePush = {
            status: 'skipped_by_request',
            credentialsConfigured: true,
            pushed: 0,
            skipped: [],
            errors: [],
            byDivision: [],
            message: 'pushEntries=false — class mapping + details only',
          };
        }
      } catch (pushErr) {
        const message = pushErr instanceof Error ? pushErr.message : String(pushErr);
        log('error', 'RankedIn write phase threw', {
          eventId,
          rankedinId,
          error: message,
          stack: pushErr instanceof Error ? pushErr.stack?.slice(0, 500) : undefined,
        });
        if (pushEntries && writePush.status === 'not_configured') {
          writePush = {
            status: 'error',
            credentialsConfigured: true,
            pushed: 0,
            skipped: [],
            errors: [message],
            byDivision: [],
            message,
          };
        }
        if (pushDetails && detailsPush.status === 'not_configured') {
          detailsPush = {
            status: 'error',
            updated: [],
            errors: [message],
            message,
          };
        }
      }
    } else if ((pushEntries || pushDetails) && !writePushAvailable) {
      writePush.status = 'not_configured';
      detailsPush.status = 'not_configured';
      log('warn', 'Write phases skipped — RankedIn secrets not configured');
    } else {
      writePush.status = 'skipped_by_request';
      writePush.message = 'pushEntries=false — class mapping only';
      detailsPush = {
        status: 'skipped_by_request',
        updated: [],
        errors: [],
        message: 'pushDetails=false',
      };
      log('info', 'Write phases skipped by request');
    }

    const nextSteps: string[] = [];
    if (unmatchedLocal.length > 0) {
      nextSteps.push(
        `Create ${unmatchedLocal.length} missing class(es) on RankedIn: ${unmatchedLocal.map((d) => d.divisionName).join(', ')}`,
      );
      nextSteps.push('Re-run Sync to RankedIn to map them');
    }
    if (writePush.status === 'not_configured' || detailsPush.status === 'not_configured') {
      nextSteps.push('Configure RANKEDIN_EMAIL / RANKEDIN_PASSWORD edge secrets to push details + paid teams');
    } else if (writePush.skipped.some((s) => s.reason === 'missing_rankedin_id')) {
      nextSteps.push('Link RankedIn IDs on player profiles for skipped entries, then re-sync');
    } else if (writePush.skipped.some((s) => s.reason === 'solo_entry')) {
      nextSteps.push('Pair solo entries before they can be pushed as doubles');
    } else if (writePush.pushed > 0 || detailsPush.updated.length > 0) {
      nextSteps.push('Open RankedIn edit / players to verify synced details and entries');
    }

    const phase = detailsPush.updated.length > 0
      ? 3
      : (writePush.pushed > 0 || writePush.status === 'noop' || writePush.status === 'ok' ? 2 : 1);

    const responseBody = {
      ok: true,
      phase,
      eventId,
      rankedinId,
      rankedinUrl,
      tournament: {
        name: tournamentName,
        classCount: rankedinClasses.length,
      },
      mapping: {
        mapped,
        unmatchedLocal,
        unmatchedRankedin,
      },
      detailsPush,
      writePush,
      nextSteps,
    };

    log('info', 'Sync request complete', {
      eventId,
      rankedinId,
      phase: responseBody.phase,
      mapped: mapped.length,
      detailsStatus: detailsPush.status,
      detailsUpdated: detailsPush.updated,
      writePushStatus: writePush.status,
      pushed: writePush.pushed,
      skipped: writePush.skipped.length,
      skipReasons: summarizeSkips(writePush.skipped),
      errors: writePush.errors.length + detailsPush.errors.length,
      durationMs: Date.now() - startedAt,
    });

    return json(responseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === 'Unauthorized' || message.startsWith('Forbidden')
      ? (message === 'Unauthorized' ? 401 : 403)
      : 400;
    log('error', 'Sync request failed', {
      error: message,
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      durationMs: Date.now() - startedAt,
    });
    return json({ ok: false, error: message }, status);
  }
});
