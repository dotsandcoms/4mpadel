// Source contracts: MAIN LicenseManager, TemporaryLicenseSales and licenseDates.
// The 15 October annual-license release hold is unconditional here. No write RPC
// is exposed; activating writes requires a separately reviewed release.
export const LICENSE_RELEASE_HOLD = 'Licence changes and sales settings are on release hold. Review only; nothing will be saved or charged until the release is explicitly approved.';
export const currentLicenseYear = (now = new Date()) => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(now));
export function licenseStartDate(row) {
  const purchased = row.purchased_on?.slice(0, 10);
  if (row.license_type === 'full' && Number(row.season_year) === 2026 && row.source !== 'complimentary' && (!row.starts_on || row.starts_on === '2026-01-01')) {
    return purchased && purchased > '2026-01-01' && purchased <= '2026-12-31' ? purchased : '2026-01-01';
  }
  return row.starts_on;
}
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
  if(!['manage_license','get_player_licenses','temporary_license_sales_report'].includes(name)||name==='manage_license'&&!['list','players'].includes(args.p_action))throw Error(LICENSE_RELEASE_HOLD);
  await verifyLicenseAccess(client,session,scopeId,signal);
  return result(client.rpc(name,args),signal);
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
  if(!['grant','revoke','restore','save_season','save_temporary'].includes(action))throw Error('Unknown licence action.');
  if(!form.reason?.trim())throw Error('A reason is required.');
  if(action.startsWith('save_'))return {p_action:action,p_input:{...form}};
  return {p_action:action,p_input:{...form,player_id:Number(playerId),year:Number(form.year),event_id:form.license_type==='temporary'?Number(form.event_id):null,amount:Number(form.amount),...(row?{id:row.id,license_type:row.license_type}:{})}};
}
export const licenseCsvCell=value=>'"'+String(value??'').replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"';
export function licenseCsv(rows){const keys=['license_number','name','email','license_type','season_year','status','source','purchased_on','granted_on','starts_on','ends_on','event_name'];return '\uFEFF'+[keys,...rows.map(row=>keys.map(key=>key==='starts_on'?licenseStartDate(row):row[key]))].map(row=>row.map(licenseCsvCell).join(',')).join('\r\n');}
export async function exportLicenseRegister(client,session,scopeId,filters,signal){const rows=[];for(let page=0;;page++){const data=await readLicenseRpc(client,session,scopeId,'manage_license',listLicenseArgs({...filters,page}),signal);rows.push(...data.rows);if(rows.length>=data.total||!data.rows.length)break;}return licenseCsv(rows);}
