import { supabase } from '@/lib/supabase';
export const organisations = [{id:15809,label:'SAPA'},{id:16317,label:'Broll Pro Tour'},{id:16482,label:'SA Grand Tour'}];
export const categoriesFor = (org:number) => org === 16482 ? [35,40,45,50,55].map((age,i)=>({id:`mo${age}`,label:`Men Over ${age}`,type:3,age:i+2})) : [{id:'men',label:'Men',type:3,age:82},{id:'ladies',label:'Women',type:4,age:83}];
export type RankingPlayer = { rankedinId?:string; id:string; participantId:string; name:string; rank:number; points:number; change:number; changeKnown?:boolean; profile?:PlayerProfile };
export type ResultRanking = {org?:string;ranking_id?:number;ranking_participant_id?:number|string;ranking_type?:number;age_group_id?:number;age_group?:string;match_type?:string;details?:PointResult[]};
type PlayerProfile = {id:string;name:string;image_url?:string;home_club?:string;nationality?:string;rankings?:ResultRanking[]};
export type PointResult = {date:string;name:string;class:string;place:string;event_type:string;points:number;eventId?:string};
async function rankedin(path:string, acceptsCache: (payload: any) => boolean = () => true) {
 const url=`https://api.rankedin.com/v1/${path}`;
 const {data:cache}=await supabase.from('rankedin_cache').select('payload,updated_at').eq('url',url).maybeSingle();
 if(cache?.payload && acceptsCache(cache.payload) && (!Array.isArray(cache.payload.Payload) || cache.payload.Payload.length > 0) && Date.now()-Date.parse(cache.updated_at)<6*3600000) return cache.payload;
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000);
 try {const response=await fetch(url,{signal:controller.signal}); if(!response.ok)throw new Error(`Rankings service returned ${response.status}`); return await response.json();}
 catch(error){if(cache?.payload)return cache.payload;throw error;} finally{clearTimeout(timer);}
}
export function normalizeRankings(payload:any[]):RankingPlayer[]{return payload.filter(x=>x.Name).map(x=>({rankedinId:x.RankedinId == null ? undefined : String(x.RankedinId),id:String(x.Participant?.Id||x.RankedinId||x.Name),participantId:String(x.Participant?.Id||x.ParticipantPoints?.RankingParticipantId||''),name:x.Name,rank:Number(x.Standing),points:Number(x.ParticipantPoints?.Points||0),change:Number(x.StandingDiff||0),changeKnown:x.StandingDiff!=null&&String(x.StandingDiff).trim()!==''&&Number.isFinite(Number(x.StandingDiff))}));}
export async function fetchRankings(org:number,category:ReturnType<typeof categoriesFor>[number]){
 const data=await rankedin(`Ranking/GetRankingsAsync?rankingId=${org}&rankingType=${category.type}&ageGroup=${category.age}&weekFromNow=0&language=en&skip=0&take=1000`);
 if(!Array.isArray(data?.Payload))throw new Error('Rankings are temporarily unavailable. Please try again.');
 return normalizeRankings(data.Payload);
}
export async function fetchRankingProfiles(){
 const profiles:PlayerProfile[]=[];
 for(let start=0;;start+=1000){const {data,error}=await supabase.from('players_public').select('id,name,image_url,home_club,nationality,rankings').range(start,start+999);if(error)throw error;profiles.push(...data);if(data.length<1000)break;}
 return profiles;
}
// Result lists can change before the next six-hour leaderboard sync. Share only
// concurrent requests; each new visit/refresh asks the provider for current data.
const pointRequests = new Map<string, Promise<any>>();
function livePointPage(path: string) {
 const existing = pointRequests.get(path);
 if (existing) return existing;
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 15000);
 const request = fetch(`https://api.rankedin.com/v1/${path}`, { signal: controller.signal }).then(async response => {
  if (!response.ok) throw new Error(`Points service returned ${response.status}`);
  return response.json();
 }).finally(() => { clearTimeout(timer); pointRequests.delete(path); });
 pointRequests.set(path, request);
 return request;
}

export async function fetchPointSnapshot(id:string,age:number,all:boolean){
 if (!/^[1-9]\d*$/.test(id) || !Number.isInteger(age) || age <= 0) throw new Error('Points are not linked to this ranking.');
 const results:PointResult[]=[];
 let points: number | undefined;
 let rank: number | undefined;
 for (let skip=0;;skip+=100) {
  const data=await livePointPage(`ranking/getparticipantpointsdetailsasync?id=${id}&agegroup=${age}&weekfromnow=0&showAll=${all?'true':'false'}&language=en&skip=${skip}&take=100`);
  if (skip === 0) {
   const participant = data?.ParticipantWithPoints;
   if (participant?.Participant?.Id != null && String(participant.Participant.Id) !== id) throw new Error('Points belong to a different ranking participant.');
   if (participant?.ParticipantPoints?.AgeGroup != null && Number(participant.ParticipantPoints.AgeGroup) !== age) throw new Error('Points belong to a different age group.');
   const totals = participant?.ParticipantPoints;
   if (totals?.Points != null && Number.isFinite(Number(totals.Points))) points = Number(totals.Points);
   if (totals?.Standing != null && Number(totals.Standing) > 0) rank = Number(totals.Standing);
  }
  const page=data?.ParticipantWithPoints?.EventPoints?.Payload;
  if (!Array.isArray(page)) throw new Error('Points breakdown is temporarily unavailable.');
  results.push(...page.map((ep:any) => ({
   date:ep.EventPoint?.Date||'', name:ep.EventName||ep.EventPoint?.EventName?.split('|')[0]?.trim()||'',
   class:ep.EventPoint?.EventName?.split('| Class:')[1]?.trim()||'', place:String(ep.EventPoint?.Standing||''),
   event_type:ep.EventPoint?.EventType===3?'Team league':'Tournament', points:Number(ep.EventPoint?.Points||0),
   eventId: String(ep.EventUrl || '').match(/\/tournament\/(\d+)(?:\/|$)/)?.[1],
  })));
  if (page.length<100) break;
 }
 return { results, points, rank };
}

export async function fetchPoints(id:string,age:number,all:boolean):Promise<PointResult[]>{
 return (await fetchPointSnapshot(id, age, all)).results;
}

/** Daily repairs in older sync versions omit participant IDs. Recover only by
 * the exact public RankedIn identity within the same organisation and category. */
export async function resolveResultIdentity(ranking: ResultRanking, rankedinId?: string) {
 const participant = String(ranking.ranking_participant_id ?? '');
 const age = Number(ranking.age_group_id);
 if (/^[1-9]\d*$/.test(participant) && Number.isInteger(age) && age > 0) return { participant, age };
 if (!rankedinId || !Number.isInteger(age) || age <= 0) throw new Error('Full results are not linked to this ranking yet.');
 const organisationsByName: Record<string, number> = { 'sapa ranking': 15809, 'broll pro tour': 16317, 'sa grand tour': 16482 };
 const org = ranking.ranking_id ?? organisationsByName[ranking.org?.trim().toLowerCase() ?? ''];
 if (!org) throw new Error('Full results are not linked to this ranking yet.');
 const type = ranking.ranking_type ?? (/women|ladies/i.test(ranking.age_group || '') ? 4 : 3);
 const rows = await fetchRankings(org, { id: 'results', label: 'Results', type, age });
 const row = rows.find(player => player.rankedinId === rankedinId);
 if (!row || !/^[1-9]\d*$/.test(row.participantId)) throw new Error('Full results are not linked to this ranking yet.');
 return { participant: row.participantId, age };
}

export type TrophyWin = { name: string; date: string; results: (PointResult & { rankingLabel?: string })[] };
export type TrophyGroup = { tier: string; count: number; events: TrophyWin[] };

export async function fetchTournamentWins(player: RankingPlayer): Promise<TrophyGroup[]> {
 const wins = new Map<string, TrophyWin>();
 const rankings = player.profile?.rankings || [];
 const histories = await Promise.all(rankings.map(async ranking => {
  // Legacy club rankings without any provider identity retain their saved
  // results. Linked rankings always use the full published result history.
  if (!ranking.ranking_participant_id && !(player.rankedinId && ranking.age_group_id)) return ranking.details || [];
  const identity = await resolveResultIdentity(ranking, player.rankedinId);
  return fetchPoints(identity.participant, identity.age, true);
 }));
 for (const [index, ranking] of rankings.entries()) {
  for (const result of histories[index]) {
   if (String(result.place) !== '1' || result.event_type === 'Team league') continue;
   const key = result.eventId ? `event:${result.eventId}` : `${result.date}-${result.name.trim().toLowerCase()}`;
   let win = wins.get(key);
   if (!win) {
    win = { name: result.name, date: result.date, results: [] };
    wins.set(key, win);
   }
   // The same event is repeated in several ranking categories; show each
   // distinct winning division once without inflating the trophy count.
   if (!win.results.some(r => r.class === result.class && Number(r.points) === Number(result.points))) win.results.push({ ...result, rankingLabel: [ranking.org, ranking.age_group].filter(Boolean).join(' · ') });
  }
 }
 if (!wins.size) return [];
 const { data, error } = await supabase.from('calendar').select('event_name,sapa_status,rankedin_id');
 if (error) throw error;
 const groups = new Map<string, TrophyWin[]>();
 for (const win of wins.values()) {
  const tierOf = (value: string) => ['Major','Super Gold','Gold','Silver','Bronze'].find(t => value.toUpperCase().includes(t.toUpperCase()));
  const eventId = win.results.find(result => result.eventId)?.eventId;
  const sameId = eventId ? data?.filter(event => String(event.rankedin_id) === eventId) : [];
  const matching = sameId?.length ? sameId : data?.filter(event => event.event_name?.trim().toLowerCase() === win.name.trim().toLowerCase());
  // Imported duplicates can carry a default "None" tier. Keep the published
  // SAPA classification instead of whichever duplicate the database returns first.
  const tier = matching?.map(event => tierOf(String(event.sapa_status || ''))).find(Boolean) || tierOf(win.name) || 'Other';
  groups.set(tier, [...(groups.get(tier) || []), win]);
 }
 return Array.from(groups, ([tier, events]) => ({ tier, count: events.length, events }));
}

/** Match movement to the displayed national rank; never substitute another player. */
export async function fetchHomeRankingChange(player: { rankedin_id: string | null; rank_label: string | null; category: string | null }): Promise<number | null> {
 if (!player.rankedin_id || !player.rank_label || player.rank_label === 'Unranked') return null;
 const women = /women|ladies|female/i.test(player.category || '');
 const categories = categoriesFor(15809);
 const ordered = women ? [categories[1], categories[0]] : categories;
 for (const category of ordered) {
  try {
   const data = await rankedin(`Ranking/GetRankingsAsync?rankingId=15809&rankingType=${category.type}&ageGroup=${category.age}&weekFromNow=0&language=en&skip=0&take=1000`, payload => {
    const cachedPlayer = payload?.Payload?.find((item: any) => String(item.RankedinId) === String(player.rankedin_id));
    // Cache timestamps can be fresh while the underlying ranking edition is old.
    return cachedPlayer != null && Number(cachedPlayer.Standing) === Number(player.rank_label);
   });
   const row = Array.isArray(data?.Payload) ? data.Payload.find((item: any) => String(item.RankedinId) === String(player.rankedin_id)) : null;
   if (!row || Number(row.Standing) !== Number(player.rank_label)) continue;
   const change = row.StandingDiff;
   return change != null && String(change).trim() !== '' && Number.isFinite(Number(change)) ? Number(change) : null;
  } catch { /* Movement is optional; the rest of the home card remains available. */ }
 }
 return null;
}
