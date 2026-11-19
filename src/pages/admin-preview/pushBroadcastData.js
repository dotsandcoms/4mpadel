// Contract: 20261021101301_admin_push_broadcasts.sql. Audience resolution stays
// on the server: partner, withdrawal and notification preference rules are not reimplemented.
export const PUSH_DESTINATIONS = [['/calendar','Tournament calendar'],['/(tabs)/rankings','Rankings'],['/(tabs)/explore','Explore'],['/(tabs)/profile','Player profile'],['/pro/live','International matches']];
export const pushHistoryDate = value => new Intl.DateTimeFormat('en-ZA', {timeZone:'Africa/Johannesburg',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
const check = ({signal,isCurrent}) => { if (signal?.aborted || (isCurrent && !isCurrent())) throw new Error('This broadcast session changed. Reopen it before continuing.'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nullableText = value => value === null || typeof value === 'string';
const count = value => Number.isSafeInteger(value) && value >= 0;
// PostgreSQL bigint IDs arrive as JSON numbers. Refuse unsafe values rather than
// silently rounding and selecting another record; nullable names match SQL.
export function validatePushRows(name, rows) {
  const label = name === 'admin_push_broadcast_events' ? 'event list' : name === 'admin_push_broadcast_players' ? 'player search' : 'broadcast history';
  const fail = () => { throw new Error(`The ${label} response contains invalid records. Refresh before continuing.`); };
  if (!Array.isArray(rows)) fail();
  const seen = new Set();
  for (const row of rows) {
    if (!object(row)) fail();
    if (name === 'list_push_broadcasts') {
      if (typeof row.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.id)
        || ['title','body','path','created_by_email','created_at'].some(key => typeof row[key] !== 'string')
        || !row.created_by_email.trim() || !row.created_at.trim() || !Number.isFinite(Date.parse(row.created_at))
        || ['recipient_count','queued_count','pending','sent','skipped','failed'].some(key => !count(row[key]))) fail();
    } else {
      if (!Number.isSafeInteger(row.id) || row.id <= 0) fail();
      if (name === 'admin_push_broadcast_events') {
        if (!nullableText(row.event_name) || !(row.start_date === null || (typeof row.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.start_date) && Number.isFinite(Date.parse(row.start_date))))) fail();
      } else if (!nullableText(row.name) || typeof row.email !== 'string' || !row.email.trim()) fail();
    }
    const key = String(row.id).toLowerCase();
    if (seen.has(key)) fail();
    seen.add(key);
  }
  return rows;
}
async function identity(options) {
  check(options);
  if (options.scopeId !== 'all' || !options.userId) throw new Error('Open push broadcasts in your account workspace.');
  const {data,error} = await options.client.auth.getUser(); check(options);
  if (error || data?.user?.id !== options.userId || typeof data.user.email !== 'string' || !data.user.email.trim() || (options.expectedEmail != null && data.user.email !== options.expectedEmail)) throw new Error('The signed-in account changed. Reopen push broadcasts.');
  return data.user;
}
export async function pushBroadcastRead(options, name, args) {
  if (!['admin_push_broadcast_events','admin_push_broadcast_players','preview_push_broadcast','list_push_broadcasts'].includes(name)) throw new Error('Unsupported broadcast read.');
  const user = await identity(options);
  let activeQuery = options.client.rpc('account_is_active');
  if(options.signal && activeQuery.abortSignal) activeQuery=activeQuery.abortSignal(options.signal);
  const active = await activeQuery; check(options);
  if(active.error || active.data !== true) throw new Error('An active account is required.');
  // Every broadcast RPC enforces fresh server-side super-admin/email-broadcast access.
  let query = options.client.rpc(name,args);
  if(options.signal && query.abortSignal) query=query.abortSignal(options.signal);
  const {data,error} = await query; check(options);
  if(error || data?.error) throw new Error(error?.message || String(data.error));
  const final = await identity(options);
  if(final.email !== user.email) throw new Error('The signed-in account changed.');
  if(data == null) throw new Error('The broadcast server returned no result. Please refresh.');
  return name === 'preview_push_broadcast' ? validatePushPreview(data) : validatePushRows(name,data);
}
export function pushAudience({eventIds=[],playerIds=[],payment='all',partner='all',excluded=[]}={}) {
  const ids = (values,limit) => {
    if(!Array.isArray(values) || values.length>limit || values.some(id=>!Number.isSafeInteger(Number(id))||Number(id)<=0)) throw new Error('Invalid audience selection.');
    return [...new Set(values.map(Number))].sort((a,b)=>a-b);
  };
  if(!['all','paid','pending'].includes(payment)||!['all','has_partner','solo'].includes(partner)||!Array.isArray(excluded)||excluded.length>10000||excluded.some(email=>typeof email!=='string')) throw new Error('Invalid audience filters.');
  return {p_event_ids:ids(eventIds,100),p_player_ids:ids(playerIds,1000),p_payment:payment,p_partner:partner,p_excluded_emails:[...new Set(excluded.map(email=>email.trim().toLowerCase()))].sort()};
}
export function validatePushPreview(value) {
  const keys=['total','ready','disabled','no_device'];
  if(!value || keys.some(key=>!Number.isSafeInteger(value[key])||value[key]<0)||value.total!==value.ready+value.disabled+value.no_device||typeof value.fingerprint!=='string'||!/^[a-f0-9]{32}$/.test(value.fingerprint)||!Array.isArray(value.recipients)||value.recipients.length!==value.total) throw new Error('The audience preview is incomplete. Refresh before reviewing.');
  const emails=new Set(), counts={ready:0,disabled:0,no_device:0};
  for(const person of value.recipients) {
    if(!object(person)||typeof person.email!=='string'||!person.email||typeof person.name!=='string'||!Object.hasOwn(counts,person.availability)||emails.has(person.email)) throw new Error('The audience preview contains invalid recipients.');
    emails.add(person.email); counts[person.availability]++;
  }
  if(Object.keys(counts).some(key=>counts[key]!==value[key])) throw new Error('The audience counts do not match. Refresh before reviewing.');
  return value;
}
export async function previewPushAudience(options,audience) { return validatePushPreview(await pushBroadcastRead(options,'preview_push_broadcast',audience)); }
export async function searchPushPlayers(options,search) {
  if(search.trim().length<2) return [];
  const rows=await pushBroadcastRead(options,'admin_push_broadcast_players',{p_search:search.trim()});
  if(!Array.isArray(rows)) throw new Error('Player search returned an invalid result.');
  return rows;
}
export function pushMessage({title,body,path}) {
  if(typeof title!=='string'||typeof body!=='string'||!title.trim()||!body.trim()||[...title.trim()].length>80||[...body.trim()].length>500) throw new Error('Enter a title up to 80 characters and a message up to 500 characters.');
  if(!PUSH_DESTINATIONS.some(([value])=>value===path)&&!/^\/events\/[1-9][0-9]*$/.test(path)) throw new Error('Choose a supported app destination.');
  return {p_title:title.trim(),p_body:body.trim(),p_path:path};
}
// No client prop or browser flag can activate delivery. The deployed definer
// guard lacks an active-account check; both bulk and test sends remain held.
export async function queuePushBroadcast() {
  throw new Error('Push sending is held pending server-side active-account authorization review. No notification was queued.');
}
