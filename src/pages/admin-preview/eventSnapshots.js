import { readAll } from './playersData.js';
import { resolveRegistrationLicenseCategory } from '../../utils/registrationLicense.js';
import { registrationCountsAsPaid, registrationIsCompedEntry } from '../../utils/paymentRegistrationMatch.js';
import { hydrateEventLicenses, eventLicenseCategory } from './eventLicenseData.js';

export async function readEventProfiles(client, emails, signal) {
  const rows = [];
  const unique = [...new Set(emails.filter(Boolean).map(email => String(email).trim().toLowerCase()))];
  for (let i = 0; i < unique.length; i += 40) {
    const filter = unique.slice(i, i + 40).map(email => `email.ilike."${email.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',');
    rows.push(...await readAll(() => client.from('players').select('id,name,email,contact_number,image_url,home_club,rank_label,license_type,paid_registration,points,created_at,temporary_licenses(id,event_id,revoked_at)').or(filter).order('id'), signal));
  }
  return rows;
}

// Same at-a-glance fee basis as EventFinance, not the net settlement ledger.
export function eventSnapshot(event, registrations, participants, players, payments) {
  const result = { entries: 0, paid: 0, comped: 0, billed: 0, collected: 0, outstanding: 0, full: 0, temp: 0, none: 0 };
  const counted = new Set();
  if (event.is_manual) {
    const byEmail = new Map(players.map(player => [String(player.email || '').trim().toLowerCase(), player]));
    registrations.filter(row => String(row.event_id) === String(event.id) && String(row.status).toLowerCase() !== 'withdrawn').forEach(row => {
      result.entries++;
      const comped = registrationIsCompedEntry(row, payments);
      const fee = Number(row.tournament_divisions?.entry_fee || 0);
      if (comped) result.comped++;
      else { result.billed += fee; if (registrationCountsAsPaid(row)) { result.paid++; result.collected += fee; } }
      const email = String(row.email || '').trim().toLowerCase();
      if (email && !counted.has(email)) { counted.add(email); result[resolveRegistrationLicenseCategory(email, event.id, byEmail.get(email), payments)]++; }
    });
  } else {
    const byId = new Map(players.map(player => [String(player.id), player]));
    participants.filter(row => String(row.event_id) === String(event.id)).forEach(row => {
      result.entries++;
      const fee = Number(event.category_fees?.[row.class_name] || event.entry_fee || 0);
      result.billed += fee;
      if (row.is_paid) { result.paid++; result.collected += fee; }
      const key = row.profile_id || String(row.full_name || '').trim().toLowerCase();
      if (key && !counted.has(key)) {
        counted.add(key);
        const player = byId.get(String(row.profile_id));
        const type = eventLicenseCategory(player, event.id) || (player?.license_type === 'full' ? 'full' : player?.temporary_licenses?.some(license => !license.revoked_at && String(license.event_id) === String(event.id)) ? 'temp' : 'none');
        result[type]++;
      }
    });
  }
  result.outstanding = result.billed - result.collected;
  return result;
}

export async function loadEventSnapshots(client, events, signal) {
  if (!events.length) return {};
  const manualIds = events.filter(event => event.is_manual).map(event => event.id);
  const otherIds = events.filter(event => !event.is_manual).map(event => event.id);
  const [regs, parts, payments] = await Promise.all([
    manualIds.length ? readAll(() => client.from('event_registrations').select('id,event_id,email,division,payment_status,status,partner_email,partner_payment_status,division_id,tournament_divisions(entry_fee)').in('event_id', manualIds).order('id'), signal) : [],
    otherIds.length ? readAll(() => client.from('tournament_participants').select('id,event_id,class_name,is_paid,profile_id,full_name').in('event_id', otherIds).order('id'), signal) : [],
    manualIds.length ? readAll(() => client.from('payments').select('id,event_id,status,metadata').in('event_id', manualIds).eq('status', 'success').order('id'), signal) : [],
  ]);
  const players = await readEventProfiles(client, regs.map(row => row.email), signal);
  const ids = [...new Set(parts.map(row => row.profile_id).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    players.push(...await readAll(() => client.from('players').select('id,license_type,temporary_licenses(event_id,revoked_at)').in('id', ids.slice(i, i + 100)).order('id'), signal));
  }
  // Eligibility is per event/year; a 2027 licence must not rewrite 2026 history.
  const snapshots = [];
  for (const event of events) {
    const eventRegs = regs.filter(row => String(row.event_id) === String(event.id));
    const eventParts = parts.filter(row => String(row.event_id) === String(event.id));
    const emails = new Set(eventRegs.map(row => String(row.email || '').trim().toLowerCase()));
    const profileIds = new Set(eventParts.map(row => String(row.profile_id)));
    const eventPlayers = players.filter(player => event.is_manual ? emails.has(String(player.email || '').trim().toLowerCase()) : profileIds.has(String(player.id)));
    const eligiblePlayers = await hydrateEventLicenses(client, eventPlayers, event.id, signal);
    snapshots.push([String(event.id), eventSnapshot(event, eventRegs, eventParts, eligiblePlayers, payments.filter(payment => String(payment.event_id) === String(event.id)))]);
  }
  return Object.fromEntries(snapshots);
}
