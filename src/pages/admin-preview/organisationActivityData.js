import { verifyEntityAccess } from './organisationFederationData.js';

export const organisationActivityPageSize = 25;
const categories = {
  organisation: ['organisation', 'organization'],
  member: ['member'],
  event: ['event', 'division'],
};
const summaryFields = 'id,actor_email,action,entity_type,entity_id,organization_id,created_at,details->>event_name,details->>name,details->>division_name';

async function requireAuditAccess(client, context) {
  context.signal?.throwIfAborted();
  if (context.scopeId !== 'all') throw new Error('Organisation activity requires current platform super-admin access.');
  const access = await verifyEntityAccess(client, 'organisations', context);
  if (!access.superAdmin) throw new Error('Organisation activity requires current platform super-admin access.');
}

export async function loadOrganisationActivity(client, context, category, page) {
  if ((category && !Object.hasOwn(categories, category)) || !Number.isSafeInteger(page) || page < 1) {
    throw new Error('Choose a valid organisation activity filter and page.');
  }
  await requireAuditAccess(client, context);
  const start = (page - 1) * organisationActivityPageSize;
  let query = client.from('org_audit_log').select(summaryFields);
  if (category) query = query.in('entity_type', categories[category]);
  query = query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(start, start + organisationActivityPageSize);
  if (context.signal) query = query.abortSignal(context.signal);
  const { data, error } = await query;
  if (error) throw error;
  await requireAuditAccess(client, context);
  const rows = data || [];
  return { rows: rows.slice(0, organisationActivityPageSize), hasMore: rows.length > organisationActivityPageSize };
}

export async function loadOrganisationActivityDetails(client, context, id) {
  if (!id) throw new Error('Choose an organisation activity record.');
  await requireAuditAccess(client, context);
  let query = client.from('org_audit_log').select('id,details').eq('id', id);
  if (context.signal) query = query.abortSignal(context.signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  await requireAuditAccess(client, context);
  if (data?.id !== id) throw new Error('That organisation activity record could not be loaded.');
  return data.details;
}
