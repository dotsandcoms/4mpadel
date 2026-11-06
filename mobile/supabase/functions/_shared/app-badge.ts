import { entryBalance } from '../native-entry-balance/balance.ts';

const norm = (value: unknown) => String(value || '').trim().toLowerCase();
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');
const checked = async (query: any) => { const { data, error } = await query; if (error) throw new Error('Badge count unavailable'); return data; };

/** Same two profile actions and registration/payment rules as native Home. */
export function pendingBadgeCount(player: any, registrations: any[], events: any[], divisions: any[], payments: any[], now = new Date()) {
  if (!player) return 0;
  let count = Number(!String(player.region || '').trim()) + Number(!String(player.racket_brand || '').trim());
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  for (const row of registrations) {
    const event = events.find(e => e.id === row.event_id);
    const own = norm(row.email) === norm(player.email);
    const status = own ? row.payment_status : row.partner_payment_status;
    if (own && status === 'paid' && event) {
      const balance = entryBalance(event, divisions.find(d => d.id === row.division_id || (d.event_id === row.event_id && d.name === row.division)), row, payments.filter(p => p.event_id === row.event_id));
      if (balance.known && balance.due != null && balance.due > 0) { count++; continue; }
    }
    if (event?.start_date && String(event.start_date).slice(0, 10) < today) continue;
    if (['pending', 'failed', 'unpaid'].includes(String(status || '').toLowerCase())) count++;
  }
  return count;
}

/** Service-side only. The caller supplies an already authenticated/owned email. */
export async function appBadgeState(client: any, email: string, ownUnread?: number) {
  const address = norm(email);
  const player = await checked(client.from('players').select('id,email,region,racket_brand').ilike('email', literal(address)).maybeSingle());
  if (!player) return { unread: 0, pending: 0, total: 0 };
  const cached = await checked(client.rpc('app_badge_cache', { p_action: 'get', p_email: address }));
  if (cached.valid) {
    const unread = ownUnread === undefined ? await checked(client.rpc('app_badge_unread_for_email', { p_email: address })) : ownUnread;
    return { unread: Number(unread), pending: cached.pending, total: Math.min(99999, Number(unread) + cached.pending) };
  }
  const [own, partner, unread] = await Promise.all([
    checked(client.from('event_registrations').select('*').ilike('email', literal(address)).neq('status', 'withdrawn')),
    checked(client.from('event_registrations').select('*').ilike('partner_email', literal(address)).neq('status', 'withdrawn')),
    ownUnread === undefined ? checked(client.rpc('app_badge_unread_for_email', { p_email: address })) : Promise.resolve(ownUnread),
  ]);
  const registrations = [...new Map([...own, ...partner].map((r: any) => [r.id, r])).values()];
  const eventIds = [...new Set(registrations.map((r: any) => r.event_id))];
  const paidIds = [...new Set(own.filter((r: any) => r.payment_status === 'paid').map((r: any) => r.event_id))];
  const [events, divisions, payments] = await Promise.all([
    eventIds.length ? checked(client.from('calendar').select('*').in('id', eventIds)) : [],
    paidIds.length ? checked(client.from('tournament_divisions').select('*').in('event_id', paidIds)) : [],
    paidIds.length ? checked(client.from('payments').select('*').in('event_id', paidIds).eq('status', 'success')) : [],
  ]);
  const pending = pendingBadgeCount(player, registrations, events, divisions, payments);
  await checked(client.rpc('app_badge_cache', { p_action: 'store', p_email: address, p_count: pending, p_revision: cached.revision }));
  const messages = Math.max(0, Number(unread) || 0);
  return { unread: messages, pending, total: Math.min(99999, messages + pending) };
}

export async function appBadgeForToken(client: any, token: string) {
  const owner = await checked(client.from('player_push_tokens').select('email').eq('token', token).eq('token_kind', 'expo').maybeSingle());
  if (!owner?.email) throw new Error('Badge device unavailable');
  return (await checked(client.rpc('app_badge_cache', { p_action: 'cached', p_email: owner.email }))).total;
}

export async function cachedAppBadge(client: any, email: string) {
  return (await checked(client.rpc('app_badge_cache', { p_action: 'cached', p_email: norm(email) }))).total as number;
}
