import { readAll } from './playersData.js';
import { verifyPlatformClubAction } from './liveClubOperations.js';

export const clubClaimLabels = { claimed: 'Claimed', invite_pending: 'Invite pending', unclaimed: 'Unclaimed' };

export async function loadClubClaimStatuses({ client, userId, scopeId, clubIds, signal }) {
  const isCurrent = () => !signal?.aborted;
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const ids = [...new Set(clubIds)];
  const statuses = new Map();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const [members, invites] = await Promise.all([
      readAll(() => client.from('club_members').select('club_id,role')
        .in('club_id', batch).in('role', ['owner', 'admin']).order('id'), signal),
      readAll(() => client.from('club_claim_invites').select('club_id,status')
        .in('club_id', batch).eq('status', 'pending').order('id'), signal),
    ]);
    const claimed = new Set(members.filter(row => ['owner', 'admin'].includes(row.role)).map(row => row.club_id));
    const pending = new Set(invites.filter(row => row.status === 'pending').map(row => row.club_id));
    for (const id of batch) statuses.set(id, claimed.has(id) ? 'claimed' : pending.has(id) ? 'invite_pending' : 'unclaimed');
  }
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  return statuses;
}
