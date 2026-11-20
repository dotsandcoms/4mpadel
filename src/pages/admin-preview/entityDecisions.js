import { readAll } from './playersData.js';
import { entityEqual, verifyEntityAccess } from './organisationFederationData.js';

const organisationFields = 'id,name,status,contact_email,created_by,federation_id';
const eventFields = 'id,event_name,organisation_id,federation_id,sanction_status,federation_sanction_status,pending_changes_status,pending_changes_submitted_at,pending_changes_notes,is_visible';
const amendmentFields = [
  'event_name','slug','organiser_name','organiser_logo_url','organiser_badge_text','city','venue','venues','address',
  'start_date','end_date','start_time','end_time','sapa_status','tournament_tag','description','points','points_breakdown',
  'prize_money_total','prize_money_breakdown','balls','courts','tournament_director','referees','sanctioning_details',
  'rules_regs','withdrawal_substitution','cut_off_times','draw_released','contact_details','organiser_phone','organiser_email',
  'organiser_website','custom_image_url','poster_image_url','poster_document_url','organiser_kit_url','media_gallery_urls',
  'sponsor_logos','registration_closes_at','registration_opens_at','early_bird_ends_at','early_bird_fee','event_dates',
  'golden_point','scoring_point','is_league','max_teams_capacity','partner_requirement','back_draw_options','allow_payments',
  'allow_temporary_license','license_required_default','collect_tshirt_size','allow_tshirt_logo_upload','allow_tshirt_sponsor_name',
  'player_gift_type','player_gift_types','entry_fee_notes','default_match_format','indoor_outdoor','courts_count',
];
const reserved = [
  'id','organisation_id','federation_id','is_visible','sanction_requested','sanction_status','federation_sanction_status','is_featured',
  'event_co_admins','finance_managed','payment_method','payment_bank_name','payment_account_name','payment_account_number',
  'payment_branch_code','payment_reference_note','external_payment_url',
];
// These reserved columns are part of the current EventBuilder payload. Unknown
// policy fields are still blocked without including them in the query.
const reservedProjection = reserved.filter(key => key !== 'is_featured');
const normal = value => String(value??'').trim().toLowerCase();
const same = (a,b) => String(a??'') === String(b??'');
const ensureCurrent = context => {
  if (context.signal?.aborted || context.isCurrent?.() === false) throw new Error('The workspace changed. Reopen this review.');
};

async function decisionAccess(client, kind, entity, context) {
  const grant = await verifyEntityAccess(client, kind, context);
  ensureCurrent(context);
  if (grant.ids && !grant.ids.some(id => same(id, entity.id))) throw new Error('This record is outside your memberships.');
  if (context.scopeId !== 'all' && (!context.scopeId?.startsWith('org:') || !same(context.scopeId.slice(4), entity.id))) {
    throw new Error('This record is outside the selected workspace.');
  }
  const reviewer = grant.superAdmin || (kind === 'federations' && grant.members?.some(member =>
    same(member.federation_id, entity.id) && ['owner','admin'].includes(member.role)));
  return { ...grant, reviewer: Boolean(reviewer) };
}

export async function loadEntityDecisionTargets(client, kind, entity, context) {
  const access = await decisionAccess(client, kind, entity, context);
  if (!access.reviewer) return { reviewer:false, applications:[], sanctions:[], amendments:[] };
  const federation = kind === 'federations';
  const applications = federation ? await readAll(() => client.from('organisations')
    .select(organisationFields).eq('federation_id', entity.id).eq('status','pending').order('id'),context.signal)
    : entity.status === 'pending' ? [entity] : [];
  const linked = federation ? await readAll(() => client.from('organisations')
    .select('id').eq('federation_id',entity.id).order('id'),context.signal) : [{id:entity.id}];
  const linkedIds = linked.map(row => row.id);
  ensureCurrent(context);
  const ownerField = federation ? 'federation_id' : 'organisation_id';
  const sanctionField = federation ? 'federation_sanction_status' : 'sanction_status';
  const [sanctions, direct, hosted] = await Promise.all([
    readAll(() => client.from('calendar').select(eventFields).eq(ownerField,entity.id).eq(sanctionField,'pending').order('id'),context.signal),
    readAll(() => client.from('calendar').select(eventFields).eq(ownerField,entity.id).eq('pending_changes_status','pending').order('id'),context.signal),
    federation && linkedIds.length ? readAll(() => client.from('calendar').select(eventFields).in('organisation_id',linkedIds).is('federation_id',null)
      .eq('pending_changes_status','pending').order('id'),context.signal) : [],
  ]);
  ensureCurrent(context);
  return { reviewer:true, applications, sanctions, amendments:[...new Map([...direct,...hosted].map(event=>[event.id,event])).values()] };
}

async function ownerAssociation(client, entity, organisationId, context) {
  const {data,error} = await client.from('organisations').select('id').eq('id',organisationId).eq('federation_id',entity.id).maybeSingle();
  ensureCurrent(context);
  if (error || !data || !same(data.id, organisationId)) throw new Error('The host organisation is no longer linked to this federation.');
}

function applyScope(query, scope, expected) {
  query = query.eq(scope.field, scope.value);
  if (expected) {
    for (const field of expected) {
      const original = scope.record[field];
      query = original == null ? query.is(field,null) : query.eq(field, typeof original === 'object' ? JSON.stringify(original) : original);
    }
  }
  return query;
}

export async function loadEntityDecision(client, kind, entity, action, target, context) {
  const access = await decisionAccess(client,kind,entity,context);
  if (!access.reviewer) throw new Error('Current review authority is required.');
  const federation = kind === 'federations';
  if (action === 'application') {
    if (!federation && !same(entity.id,target.id)) throw new Error('This application is outside the selected organisation.');
    const scope = federation ? { field:'federation_id', value:entity.id } : { field:'id', value:entity.id };
    const {data,error} = await applyScope(client.from('organisations').select(organisationFields).eq('id',target.id),scope).maybeSingle();
    ensureCurrent(context);
    if (error || !data || data.status !== 'pending') throw new Error('This application is no longer pending.');
    return { action, name:data.name, row:data, scope, decisionField:'status' };
  }
  if (!['sanction','amendment'].includes(action)) throw new Error('Choose a supported decision.');
  const viaHost = federation && action === 'amendment' && !same(target.federation_id,entity.id);
  if (viaHost) {
    if (target.federation_id != null || !target.organisation_id) throw new Error('This event is outside the selected federation.');
    await ownerAssociation(client,entity,target.organisation_id,context);
  }
  const scope = viaHost ? { field:'organisation_id', value:target.organisation_id }
    : { field:federation?'federation_id':'organisation_id', value:entity.id };
  const decisionField = action === 'amendment' ? 'pending_changes_status'
    : federation ? 'federation_sanction_status' : 'sanction_status';
  const fields = action === 'amendment' ? [...new Set([ ...eventFields.split(','), 'pending_changes', ...amendmentFields, ...reservedProjection])].join(',') : eventFields;
  let query = applyScope(client.from('calendar').select(fields).eq('id',target.id),scope);
  if (viaHost) query = query.is('federation_id',null);
  const {data,error} = await query.maybeSingle();
  ensureCurrent(context);
  if (error || !data || data[decisionField] !== 'pending') throw new Error('This event review is no longer pending.');
  if (action !== 'amendment') return {action,name:data.event_name,row:data,scope,viaHost,decisionField};

  const draft = data.pending_changes;
  const payload = draft && typeof draft === 'object' && !Array.isArray(draft) ? draft.payload ?? draft : null;
  const changed = key => Object.hasOwn(payload ?? {},key) && !entityEqual(payload[key] ?? null,data[key] ?? null);
  const patch = Object.fromEntries(amendmentFields.filter(changed).map(key => [key,payload[key]]));
  const restricted = reserved.some(changed);
  // Both review and approval are tied to the server's exact division plan.
  // Older deployments may still review and reject a multi-table draft.
  const hasDivisions = ['divisions','removed_division_ids'].some(key =>
    draft?.[key] != null && (!Array.isArray(draft[key]) || draft[key].length > 0));
  let plan, approvalBlock;
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') approvalBlock = 'This draft has no valid event changes.';
  else if (restricted) approvalBlock = 'This draft changes access, banking or publication controls.';
  else if (hasDivisions) {
    const {data:preview,error:previewError} = await requestAmendment(client,kind,entity.id,data.id);
    ensureCurrent(context);
    if (same(preview?.event_id,data.id) && /^[a-f0-9]{64}$/.test(preview?.token) && Array.isArray(preview?.divisions)) plan = preview;
    else approvalBlock = previewError?.message && !['PGRST202','42883'].includes(previewError.code)
      ? previewError.message : 'Division changes require an atomic amendment service. Approval is unavailable here.';
  } else if (!Object.keys(patch).length) approvalBlock = 'This draft has no changes that can be applied.';
  return { action,name:data.event_name,row:data,scope,viaHost,decisionField,patch,plan,approvalBlock };

}

const requestAmendment = (client,kind,entityId,eventId,token=null) => client.rpc('admin_review_event_amendment',{
  p_kind:kind,p_entity_id:entityId,p_event_id:eventId,p_expected:token,
});

const escape = value => String(value??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function notifyEntityDecision(client, address, template, variables) {
  if (!String(address??'').includes('@')) return 'No notification address is on file.';
  try {
    const result = await client.functions.invoke('send-email',{body:{to:address,template,variables:Object.fromEntries(Object.entries(variables).map(([key,value])=>[key,escape(value)]))}});
    return result.error || result.data?.error ? 'Decision saved. Email delivery could not be confirmed.' : '';
  } catch { return 'Decision saved. Email delivery could not be confirmed.'; }
}

export async function saveEntityDecision(client,kind,entity,review,outcome,notes,context) {
  if (!['approve','reject'].includes(outcome)) throw new Error('Choose approve or reject.');
  const normalizedNotes = String(notes||'').trim();
  if (outcome === 'reject' && !normalizedNotes) throw new Error('Enter a reason for rejecting this request.');
  const fresh = await loadEntityDecision(client,kind,entity,review.action,review.row,context);
  const federation = kind === 'federations';
  const {action,row,scope,decisionField} = fresh;
  const approved = outcome === 'approve';
  const status = approved ? 'approved' : 'rejected';
  if (!same(review.row.id,row.id) || review.decisionField !== decisionField || !entityEqual(review.row,row)) {
    throw new Error('This record changed after you opened the review.');
  }
  if (approved && fresh.approvalBlock) throw new Error(fresh.approvalBlock);
  if (approved && review.plan?.token !== fresh.plan?.token) throw new Error('The reviewed amendment changed. Refresh before approving.');

  let patch, predicates = [decisionField];
  if (action === 'application') {
    patch = approved
      ? {status,approved_at:new Date().toISOString(),verified:true,sapa_sanctioned:true}
      : {status,rejection_notes:normalizedNotes};
    predicates = [...predicates,'contact_email','created_by'];
  } else if (action === 'sanction') {
    patch = {sanction_status:status,...(federation ? {federation_sanction_status:status} : {}),
      ...(approved ? {is_visible:true} : {rejection_notes:normalizedNotes,...(!federation?{is_visible:false}:{})})};
    predicates = [...new Set([...predicates,'sanction_status','is_visible'])];
  } else {
    patch = approved ? {...fresh.patch,pending_changes:null,pending_changes_status:null,pending_changes_notes:null,pending_changes_submitted_at:null}
      : {pending_changes_status:'rejected',pending_changes_notes:normalizedNotes};
    predicates = [...predicates,'pending_changes','pending_changes_submitted_at', ...Object.keys(fresh.patch || {})];
  }
  if (fresh.viaHost) {
    await ownerAssociation(client,entity,row.organisation_id,context);
    predicates.push('federation_id');
  }
  const table = action === 'application' ? 'organisations' : 'calendar';
  const returning = [...new Set(['id',...Object.keys(patch)])].join(',');
  ensureCurrent(context);
  context.onAttempt?.();
  if (approved && fresh.plan) {
    const {data,error} = await requestAmendment(client,kind,entity.id,row.id,review.plan.token);
    if (error || !same(data?.event_id,row.id) || data?.status !== 'approved') {
      throw new Error(error?.message || 'The backend did not confirm this amendment. Refresh decisions.');
    }
  } else {
    const saved = await applyScope(client.from(table).update(patch).eq('id',row.id),{...scope,record:row},predicates)
      .select(returning).maybeSingle();
    if (saved.error || !saved.data || !same(saved.data.id,row.id)
        || Object.entries(patch).some(([key,value])=>key!=='approved_at' && !entityEqual(saved.data[key]??null,value??null))) {
      throw new Error('The backend did not confirm this decision. Check current access and record status.');
    }
  }
  ensureCurrent(context);
  if (action === 'application' && approved) {
    if (!normal(row.contact_email)) return {message:'Application approved. Owner access needs a contact email.',warning:true,targetId:row.id,action,status};
    const owner = await client.from('organisation_members').upsert({
      organisation_id:row.id,player_id:row.created_by||null,user_email:row.contact_email,role:'owner',
    },{onConflict:'organisation_id,user_email'}).select('organisation_id,user_email,role').maybeSingle();
    if (owner.error || !same(owner.data?.organisation_id,row.id) || normal(owner.data?.user_email)!==normal(row.contact_email) || owner.data?.role!=='owner') {
      return {message:'Application approved. Owner access was not confirmed. Check membership before notifying the applicant.',warning:true,targetId:row.id,action,status};
    }
  }
  ensureCurrent(context);
  let delivery;
  if (action === 'application') {
    delivery = await notifyEntityDecision(client,row.contact_email,approved?'org_approved':'org_rejected',{orgName:row.name,notes:normalizedNotes});
  } else if (row.organisation_id) {
    const organisation = await client.from('organisations').select('contact_email').eq('id',row.organisation_id).maybeSingle();
    ensureCurrent(context);
    delivery = organisation.error ? 'Decision saved. The notification address could not be loaded.' : await notifyEntityDecision(client,organisation.data?.contact_email,
      approved?'event_sanctioned':'event_rejected',{eventName:action==='amendment'?`Amendment ${status} — ${row.event_name}`:row.event_name,notes:normalizedNotes});
  }
  return {message:delivery || `${action === 'application'?'Application':action === 'amendment'?'Amendment':'Sanction request'} ${status}.`,warning:Boolean(delivery),targetId:row.id,action,status};
}
