import { readAll } from './playersData.js';
import { verifyPlatformClubAction } from './liveClubOperations.js';
import { normaliseMemberEmail, searchClubMemberPlayers } from './clubMemberAdd.js';

const rpc = 'admin_club_group_team_access';
const authorize = options => verifyPlatformClubAction(options.client,options.scopeId,options.userId,options.isCurrent);
export async function clubGroupTeamAvailable(options) {
  await authorize(options);
  const {data,error}=await options.client.rpc(rpc,{});
  options.signal?.throwIfAborted();
  if (error && !['PGRST202','42883'].includes(error.code)) throw new Error('Could not verify group team availability.');
  return data?.can_assign===true;
}
export const searchGroupTeamPlayers = (options, query) => searchClubMemberPlayers({...options,query});

export async function loadGroupTeamReview(options, group, player, role) {
  if (!group?.id || !player?.id || !normaliseMemberEmail(player.email) || !['owner','admin'].includes(role)) {
    throw new Error('Choose a player and owner or admin role.');
  }
  await authorize(options);
  const {client,signal}=options;
  const current = await readAll(()=>client.from('clubs').select('id,name,group_id').eq('group_id',group.id).order('id'),signal);
  const previouslyLinked = new Set(group.venues.map(venue=>venue.id));
  if (!current.length || current.length!==previouslyLinked.size || current.some(venue=>venue.group_id!==group.id||!previouslyLinked.has(venue.id))) {
    throw new Error('The linked venues changed. Refresh groups before reviewing access.');
  }
  const email = normaliseMemberEmail(player.email);
  const literal = email.replace(/[\\%_*]/g,'\\$&');
  const records = [];
  for (let start=0;start<current.length;start+=50) {
    const ids=current.slice(start,start+50).map(venue=>venue.id);
    records.push(...await readAll(()=>client.from('club_members').select('id,club_id,player_id,user_email,role').in('club_id',ids)
      .ilike('user_email',literal).order('id'),signal));
  }
  const venues=current.map(venue=>{
    const matches=records.filter(row=>row.club_id===venue.id&&normaliseMemberEmail(row.user_email)===email);
    if (matches.length>1 || (matches[0]?.player_id!=null&&String(matches[0].player_id)!==String(player.id))) {
      throw new Error(`Review the conflicting membership at ${venue.name} before assigning group access.`);
    }
    const member = matches[0];
    return {id:venue.id,name:venue.name,member:member?{id:member.id,player_id:member.player_id??null,user_email:member.user_email,role:member.role}:null};
  });
  return {groupId:group.id,playerId:player.id,role,expected:{group_name:group.name,player_name:player.name??null,player_email:email,venues}};
}
export async function saveGroupTeamAccess(options, review) {
  await authorize(options);
  options.onAttempt?.();
  const {data,error}=await options.client.rpc(rpc,{p_group_id:review.groupId,p_player_id:review.playerId,p_role:review.role,p_expected:review.expected});
  const expected = new Set(review.expected.venues.map(venue=>venue.id));
  const returned = [...(Array.isArray(data?.changed)?data.changed:[]),...(Array.isArray(data?.preserved)?data.preserved:[])];
  if (error || data?.group_id!==review.groupId || String(data?.player_id)!==String(review.playerId) || data?.role!==review.role
    || returned.length!==expected.size || new Set(returned).size!==expected.size || returned.some(id=>!expected.has(id))) {
    throw new Error(error?.message || 'The exact group access changes could not be confirmed.');
  }
  return data;
}
