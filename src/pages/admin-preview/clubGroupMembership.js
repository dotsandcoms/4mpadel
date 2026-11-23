import { exactClubFields, verifyPlatformClubAction } from './liveClubOperations.js';
import { entityEqual } from './organisationFederationData.js';

const venueFields = ['id','name','group_id','logo_url','website_url','updated_at'];
const groupFields = ['id','name','logo_url','website_url','share_logo','share_website'];
const snapshot = (row, fields) => Object.fromEntries(fields.map(field => [field, row[field] ?? null]));

export function reviewClubGroupMembership(group, venue, action) {
  if (!group?.id || !venue?.id || !['link','unlink'].includes(action)) throw new Error('Choose a valid club and group.');
  if ((action === 'unlink') !== (venue.group_id === group.id)) throw new Error('This venue’s group membership already changed.');
  const patch = { group_id: action === 'unlink' ? null : group.id };
  if (action === 'link') {
    if (group.share_logo && group.logo_url) patch.logo_url = group.logo_url;
    if (group.share_website && group.website_url) patch.website_url = group.website_url;
  }
  return { action, venue: snapshot(venue, venueFields), group: snapshot(group, groupFields), patch };
}

export async function saveClubGroupMembership(client, scopeId, userId, review, isCurrent) {
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const [venue, group] = await Promise.all([
    client.from('clubs').select(venueFields.join(',')).eq('id', review.venue.id).maybeSingle(),
    client.from('club_groups').select(groupFields.join(',')).eq('id', review.group.id).maybeSingle(),
  ]);
  if (venue.error || group.error || !venue.data || !group.data) throw new Error('The club or group is no longer available. Refresh groups.');
  const fresh = reviewClubGroupMembership(group.data, venue.data, review.action);
  if (!entityEqual(fresh, review)) throw new Error('The club or group changed after review. Refresh groups and check shared branding.');
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const { data, error } = await exactClubFields(client.from('clubs').update({ ...fresh.patch, updated_at: new Date().toISOString() }), fresh.venue)
    .select(venueFields.join(',')).maybeSingle();
  if (error || !data || data.id !== fresh.venue.id || data.group_id !== fresh.patch.group_id) {
    throw new Error('The membership change could not be confirmed. Refresh groups.');
  }
  return data;
}
