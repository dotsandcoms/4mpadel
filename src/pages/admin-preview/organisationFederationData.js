import { readAll } from './playersData.js';

export const ENTITY_FIELDS = {
  organisations: ['name','contact_email','contact_phone','logo_url','website_url'],
  federations: ['name','short_name','slug','about','website_url','brand_color','contact_email','contact_phone','whatsapp_number','logo_url','cover_image_url','rankedin_events_org_id','rankedin_rankings_org_id','status','verified','is_national_governing_body','socials','personnel','committees'],
};
const normal = value => String(value || '').trim().toLowerCase();
const check = context => { if (context.signal?.aborted || context.isCurrent?.() === false) throw new Error('The workspace changed. Reopen this record.'); };
const tableFor = kind => { if (!ENTITY_FIELDS[kind]) throw new Error('Unknown organisation workspace.'); return kind; };
const pattern = email => '%' + email.replace(/[\\%_]/g,'\\$&').replace(/\*/g,'%') + '%';
export const entityEqual=(left,right)=>{
  const normalise=value=>Array.isArray(value)?value.map(normalise):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalise(value[key])])):value;
  return JSON.stringify(normalise(left))===JSON.stringify(normalise(right));
};

export async function verifyEntityAccess(client, kind, context) {
  tableFor(kind); check(context);
  const { data, error } = await client.auth.getUser(); check(context);
  const user = data?.user;
  if (error || !user?.email || user.id !== context.userId) throw new Error('Your signed-in account changed. Reopen this workspace.');
  const finish=async grant=>{const final=await client.auth.getUser();check(context);if(final.error||final.data?.user?.id!==user.id||final.data?.user?.email!==user.email)throw new Error('Your signed-in account changed. Reopen this workspace.');return grant;};
  const active = await client.rpc('account_is_active'); check(context);
  if (active.error || active.data !== true) throw new Error('An active account is required.');
  const admin = await client.rpc('is_super_admin',{ user_email: user.email }); check(context);
  if (admin.error) throw admin.error;
  if (context.scopeId !== 'all' && (kind !== 'organisations' || !/^org:[^:]+$/.test(context.scopeId))) throw new Error('Choose the matching organisation workspace or All 4M Padel.');
  if (admin.data === true) return finish({ user, superAdmin: true, ids: null });
  const email = normal(user.email);
  const grants = await readAll(() => client.from('admin_sidebar_permissions').select('email,role,allowed_tabs,module_permissions').ilike('email',pattern(email)).order('email'),context.signal);
  const exact = grants.filter(row => normal(row.email) === email);
  if (exact.length > 1) throw new Error('Your permission records are ambiguous.');
  const field = kind === 'organisations' ? 'organisation_id' : 'federation_id';
  const members = await readAll(() => client.from(kind === 'organisations' ? 'organisation_members' : 'federation_members').select(`user_email,role,${field}`).ilike('user_email',pattern(email)).order(field),context.signal);
  check(context);
  const ids = [...new Set(members.filter(row => normal(row.user_email) === email).map(row => row[field]))];
  // CURRENT MAIN also resolves a legacy approved host through its creator's
  // player record. It must not accidentally become a standalone platform grant.
  if(kind==='organisations'&&!ids.length){
    const players=await readAll(()=>client.from('players').select('id,email').ilike('email',pattern(email)).order('id'),context.signal);
    const matches=players.filter(player=>normal(player.email)===email);
    if(matches.length>1)throw new Error('Your player identity is ambiguous.');
    if(matches.length===1){
      const legacy=await readAll(()=>client.from('organisations').select('id').eq('created_by',matches[0].id).eq('status','approved').order('id'),context.signal);
      if(legacy.length>1)throw new Error('Multiple legacy organisations require an explicit membership.');
      ids.push(...legacy.map(row=>row.id));
    }
  }
  const directGrant=Array.isArray(exact[0]?.allowed_tabs)&&exact[0].allowed_tabs.includes(kind);
  const oversight=kind==='federations'?directGrant:exact[0]?.module_permissions?.organisations?.platformOversight===true||(exact[0]?.role==='custom'&&!ids.length&&directGrant);
  if (!ids.length&&!oversight) throw new Error('A current module or membership permission is required.');
  return finish({ user, superAdmin: false, ids:oversight?null:ids, members: members.filter(row => normal(row.user_email) === email) });
}

export async function loadEntities(client, kind, context) {
  const access = await verifyEntityAccess(client,kind,context);
  const rows = await readAll(() => {
    let query = client.from(tableFor(kind)).select('*').order('name').order('id');
    if (access.ids) query = query.in('id',access.ids);
    if (access.ids && kind === 'organisations') query=query.eq('status','approved');
    if (context.scopeId !== 'all') query = query.eq('id',context.scopeId.slice(4));
    return query;
  },context.signal);
  check(context);
  return { rows, superAdmin: access.superAdmin, editableIds:access.superAdmin?null:kind==='organisations'?(access.members||[]).filter(member=>['owner','admin'].includes(member.role)).map(member=>String(member.organisation_id)):[] };
}

export function entityPatch(kind, original, draft) {
  tableFor(kind);
  if (!String(draft.name || '').trim()) throw new Error('Name is required.');
  if (kind === 'organisations' && !String(draft.contact_email || '').trim()) throw new Error('Contact email is required.');
  if (kind === 'federations' && !String(draft.slug || '').trim()) throw new Error('Slug is required.');
  const patch = {};
  for (const key of ENTITY_FIELDS[kind]) {
    if (entityEqual(draft[key] ?? '',original[key] ?? '')) continue;
    let value = draft[key] ?? '';
    if (kind === 'organisations' && key !== 'logo_url') value = String(value).trim();
    if (kind === 'federations') {
      if(['verified','is_national_governing_body'].includes(key)){patch[key]=!!value;continue;}
      if(key==='status'){if(!['draft','published'].includes(value))throw new Error('Choose a supported federation status.');patch[key]=value;continue;}
      if(key==='socials'){patch[key]=Object.fromEntries(['instagram','facebook','tiktok','youtube'].map(platform=>[platform,String(value?.[platform]||'').trim()]));continue;}
      if(key==='personnel'){patch[key]=(Array.isArray(value)?value:[]).filter(p=>p&&typeof p==='object').map(p=>({name:String(p.name||p.title||'').trim(),role:String(p.role||p.position||'').trim()})).filter(p=>p.name||p.role);continue;}
      if(key==='committees'){patch[key]=(Array.isArray(value)?value:[]).filter(c=>c&&typeof c==='object').map(c=>({name:String(c.name||c.title||'').trim(),members:String(c.membersText??(Array.isArray(c.members)?c.members.join(','):c.members)??'').split(',').map(m=>m.trim()).filter(Boolean)})).filter(c=>c.name||c.members.length);continue;}
      if (['name','short_name'].includes(key)) value = String(value).trim();
      if (key === 'slug') {value = String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!value)throw new Error('Slug must contain letters or numbers.');}
      if (!value && key !== 'name' && key !== 'slug') value = null;
    }
    patch[key] = value;
  }
  return patch;
}

export async function saveEntityProfile(client,kind,original,draft,context) {
  const patch = entityPatch(kind,original,draft);
  const access = await verifyEntityAccess(client,kind,context);
  const requireWrite = async grant => {
    if(grant.superAdmin)return;
    if(kind!=='organisations'||original.status!=='approved'||!grant.members?.some(row=>String(row.organisation_id)===String(original.id)&&['owner','admin'].includes(row.role)))throw new Error('Current owner or admin membership is required to save this approved organisation.');
    const result=await client.rpc('is_organisation_admin',{p_organisation_id:original.id});check(context);
    if(result.error||result.data!==true)throw new Error('Organisation administration permission was not confirmed.');
  };
  await requireWrite(access);
  if (context.scopeId !== 'all' && context.scopeId.slice(4) !== String(original.id)) throw new Error('This record is outside the selected workspace.');
  const {data:fresh,error} = await client.from(kind).select('*').eq('id',original.id).single(); check(context);
  const keys=Object.keys(patch);
  if(error || !fresh || String(fresh.id)!==String(original.id) || fresh.status!==original.status || keys.some(key=>!entityEqual(fresh[key]??null,original[key]??null))) throw new Error('This profile changed. Close and reload before saving.');
  if(!keys.length)return fresh;
  await requireWrite(await verifyEntityAccess(client,kind,context)); check(context);
  const finalActor=await client.auth.getUser();check(context);
  if(finalActor.error||finalActor.data?.user?.id!==context.userId||finalActor.data?.user?.email!==access.user.email)throw new Error('Your signed-in account changed. Reopen this workspace.');
  let query=client.from(kind).update(kind==='federations'?{...patch,updated_at:new Date().toISOString()}:patch).eq('id',original.id);
  query=original.status==null?query.is('status',null):query.eq('status',original.status);
  for(const key of keys)query=original[key]==null?query.is(key,null):query.eq(key,typeof original[key]==='object'?JSON.stringify(original[key]):original[key]);
  context.onAttempt?.();
  const saved=await query.select('*').single();
  if(saved.error || !saved.data || String(saved.data.id)!==String(original.id) || keys.some(key=>!entityEqual(saved.data[key],patch[key])))throw new Error('Save outcome could not be confirmed. Reload before trying again.');
  return saved.data;
}

export async function loadEntityRelated(client,kind,row,context){
  const access=await verifyEntityAccess(client,kind,context);
  if(access.ids&&!access.ids.some(id=>String(id)===String(row.id)))throw new Error('This record is outside your memberships.');
  if(context.scopeId!=='all'&&context.scopeId.slice(4)!==String(row.id))throw new Error('This record is outside the selected workspace.');
  const organisations=kind==='federations'?await readAll(()=>client.from('organisations').select('id,name,status,contact_email').eq('federation_id',row.id).order('name').order('id'),context.signal):[];
  const events=await readAll(()=>client.from('calendar').select('id,event_name,start_date,sanction_status,federation_sanction_status,pending_changes_status').eq(kind==='federations'?'federation_id':'organisation_id',row.id).order('start_date').order('id'),context.signal);
  check(context);return{organisations,events};
}
