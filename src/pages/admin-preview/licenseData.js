import { licenseStartDate } from '../../utils/licenseDates.js';
import { grantTemporaryLicense } from '../../utils/temporaryLicenseAssignment.js';

export { licenseStartDate };
export const LICENSE_RELEASE_HOLD = "Use the confirmation form to save licence changes.";
const READ_RPCS = ['manage_license', 'get_player_licenses', 'temporary_license_sales_report', 'license_sales_overview', 'license_federation_sales_export'];
const WRITE_ACTIONS = ['grant', 'revoke', 'restore', 'save_season', 'save_temporary', 'archive_season', 'restore_season'];
export const currentLicenseYear = (now = new Date()) => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(now));
export const licenseLabel = row => row.license_type === 'full' ? `${row.season_year} Full licence` : `Temporary · ${row.event_name || 'Event'}`;
export const licenseDate = value => value ? new Date(`${String(value).slice(0,10)}T12:00:00+02:00`).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Johannesburg'}) : 'Unknown';
export const licenseTimestamp = value => value ? new Date(value).toLocaleString('en-ZA',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Johannesburg'}) : 'Unknown';
export const licenseMoney = (value,currency='ZAR') => new Intl.NumberFormat('en-ZA',{style:'currency',currency}).format(Number(value || 0));
export const licenseSource = value => ({legacy:'Legacy import',payment:'Payment',manual:'Manual payment',complimentary:'Complimentary'}[value] || value);
const check = signal => { if(signal?.aborted)throw new DOMException('Cancelled','AbortError'); };
async function result(query,signal){check(signal); const {data,error}=await query;check(signal);if(error)throw error;return data;}
export async function verifyLicenseAccess(client,session,scopeId,signal){
  check(signal);
  if(scopeId!=='all'||!session?.user?.id)throw Error('Open Licences in your signed-in account workspace.');
  const auth=await client.auth.getUser();check(signal);
  if(auth.error||auth.data?.user?.id!==session.user.id)throw Error('The signed-in account changed. Reopen Licences.');
  if(await result(client.rpc('can_manage_licenses'),signal)!==true)throw Error('Current Licences permission is required.');
}
export async function readLicenseRpc(client,session,scopeId,name,args={},signal){
  if (!READ_RPCS.includes(name) || (name === 'manage_license' && !['list', 'players'].includes(args.p_action))) {
    throw Error(LICENSE_RELEASE_HOLD);
  }
  await verifyLicenseAccess(client,session,scopeId,signal);
  return result(client.rpc(name,args),signal);
}
export async function writeLicenseReview(client, session, scopeId, value, signal) {
  const { p_action: action, p_input: input } = value || {};
  if (!WRITE_ACTIONS.includes(action) || !input?.reason?.trim()) throw Error('Review the licence change and enter a reason.');
  await verifyLicenseAccess(client, session, scopeId, signal);
  check(signal);
  if (action === 'grant' && input.license_type === 'temporary') {
    return grantTemporaryLicense(client, input);
  }
  const data = await result(client.rpc('manage_license', value), signal);
  if (data?.saved !== true) throw Error('The change was not confirmed. Refresh licence records before retrying.');
  return data;
}

export function listLicenseArgs(filters){return {p_action:'list',p_input:{...filters,year:filters.year?Number(filters.year):null}};}
export async function loadLicenseOptions(client,session,scopeId,signal){
  await verifyLicenseAccess(client,session,scopeId,signal);
  const [seasons,config,events]=await Promise.all([
    result(client.from('license_seasons').select('*').order('year',{ascending:false}),signal),
    result(client.from('commerce_config').select('temp_license_price,temp_license_enabled').eq('id','default').maybeSingle(),signal),
    result(client.from('calendar').select('id,event_name,start_date').order('start_date',{ascending:false}).limit(250),signal)
  ]);
  return {seasons:seasons||[],config:config||{},events:events||[]};
}
export function fullLicensePrice(licenses,seasons,year){const renewal=licenses.some(l=>l.license_type==='full'&&l.status!=='revoked'&&l.season_year<Number(year));const season=seasons.find(s=>Number(s.year)===Number(year));return Number((renewal?season?.renewal_price:season?.price)??(renewal?500:650));}
export function licenseReviewPayload(action,form,playerId,row){
  if(!WRITE_ACTIONS.includes(action))throw Error('Unknown licence action.');
  if(!form.reason?.trim())throw Error('A reason is required.');
  if (action === 'save_temporary' || action === 'save_season') {
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) throw Error('Enter a positive price.');
    if (action === 'save_temporary') return { p_action: action, p_input: { price, sales_open: Boolean(form.sales_open), reason: form.reason.trim() } };
    const renewal = Number(form.renewal_price ?? 500);
    if (!Number.isFinite(renewal) || renewal <= 0) throw Error('Enter a positive renewal price.');
    return { p_action: action, p_input: { year: Number(form.year), price, renewal_price: renewal, coverage_starts_on: form.coverage_starts_on || `${form.year}-01-01`, sales_open: Boolean(form.sales_open), reason: form.reason.trim() } };
  }
  if (action === 'archive_season' || action === 'restore_season') {
    return { p_action: action, p_input: { year: Number(form.year), reason: form.reason.trim() } };
  }
  return {p_action:action,p_input:{...form,player_id:Number(playerId),year:Number(form.year),event_id:form.license_type==='temporary'?Number(form.event_id):null,amount:Number(form.amount),...(row?{id:row.id,license_type:row.license_type}:{})}};
}
export const licenseCsvCell=value=>'"'+String(value??'').replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"';
export function licenseCsv(rows){const keys=['license_number','name','email','license_type','season_year','purchase_year','is_renewal','renewed_from_year','status','source','purchased_on','granted_on','starts_on','ends_on','event_name'];return '\uFEFF'+[keys,...rows.map(row=>keys.map(key=>key==='starts_on'?licenseStartDate(row):key==='purchase_year'?row.purchased_on?.slice(0,4):row[key]))].map(row=>row.map(licenseCsvCell).join(',')).join('\r\n');}
export async function exportLicenseRegister(client,session,scopeId,filters,signal){const rows=[];for(let page=0;;page++){const data=await readLicenseRpc(client,session,scopeId,'manage_license',listLicenseArgs({...filters,page}),signal);rows.push(...data.rows);if(rows.length>=data.total||!data.rows.length)break;}return licenseCsv(rows);}
