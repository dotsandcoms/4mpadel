import { verifyEntityAccess, entityEqual } from './organisationFederationData.js';
import { readAll } from './playersData.js';

const albumFields = 'id,title,parent_album_id,organisation_id';
const federationFields = 'id,name,status';
const organisationFields = 'id,name,status,federation_id';
const snapshot = (row, fields) => Object.fromEntries(fields.split(',').map(key => [key, row[key] ?? null]));

async function authorize(client, context) {
  const authority = await verifyEntityAccess(client,'organisations',context);
  if (context.scopeId !== 'all' || authority.superAdmin !== true) throw new Error('Current platform authority is required to manage organisation relationships.');
  context.signal?.throwIfAborted();
}

export async function loadOrganisationRelationships(client, organisation, context) {
  await authorize(client,context);
  const [albums,federations,current] = await Promise.all([
    readAll(() => client.from('albums').select(albumFields).is('parent_album_id',null).order('title').order('id'),context.signal),
    readAll(() => client.from('federations').select(federationFields).order('name').order('id'),context.signal),
    client.from('organisations').select(organisationFields).eq('id',organisation.id).maybeSingle(),
  ]);
  context.signal?.throwIfAborted();
  if (current.error || current.data?.id !== organisation.id || current.data?.name !== organisation.name || current.data?.status !== organisation.status) {
    throw new Error('The organisation changed. Reload the profile to continue.');
  }
  return {organisation:snapshot(current.data,organisationFields),albums,federations};
}

export function reviewOrganisationRelationship(directory, kind, targetId, action) {
  const {organisation,albums,federations}=directory;
  if (!['link','unlink'].includes(action) || !['album','federation'].includes(kind)) throw new Error('Choose a relationship action.');
  const adding=action==='link';
  const target=(kind==='album'?albums:federations).find(row=>row.id===targetId);
  if (!target) throw new Error('Choose an available relationship.');
  if (kind==='album' && (target.parent_album_id != null || (adding ? target.organisation_id != null : target.organisation_id !== organisation.id))) {
    throw new Error('The album is no longer available for this relationship.');
  }
  if (kind==='federation' && (adding ? organisation.federation_id != null : organisation.federation_id !== target.id)) {
    throw new Error('Remove the current federation link before choosing a different federation.');
  }
  return {kind,action,organisation,target:snapshot(target, kind==='album'?albumFields:federationFields)};
}

export async function saveOrganisationRelationship(client, review, context) {
  await authorize(client,context);
  const targetTable=review.kind==='album'?'albums':'federations';
  const fields=review.kind==='album'?albumFields:federationFields;
  const [organisation,target]=await Promise.all([
    client.from('organisations').select(organisationFields).eq('id',review.organisation.id).maybeSingle(),
    client.from(targetTable).select(fields).eq('id',review.target.id).maybeSingle(),
  ]);
  context.signal?.throwIfAborted();
  if (organisation.error || !organisation.data || target.error || !target.data
    || !entityEqual(snapshot(organisation.data,organisationFields),review.organisation)
    || !entityEqual(snapshot(target.data,fields),review.target)) throw new Error('The reviewed relationship changed. Refresh before continuing.');
  const fresh=reviewOrganisationRelationship({organisation:organisation.data,albums:[target.data],federations:[target.data]},review.kind,review.target.id,review.action);
  await authorize(client,context);
  const newId=review.action==='link' ? (review.kind==='album'?fresh.organisation.id:fresh.target.id) : null;
  const [table,row,key,returnFields]=review.kind==='album'
    ? ['albums',fresh.target,'organisation_id',albumFields] : ['organisations',fresh.organisation,'federation_id',organisationFields];
  let write=client.from(table).update({[key]:newId});
  for(const [field,value] of Object.entries(row)) write=value==null ? write.is(field,null) : write.eq(field,value);
  const result=await write.select(returnFields).maybeSingle();
  context.signal?.throwIfAborted();
  if (result.error || result.data?.id!==row.id || (result.data?.[key]??null)!==newId) {
    throw new Error('The relationship update could not be confirmed. Refresh before retrying.');
  }
  return result.data;
}
