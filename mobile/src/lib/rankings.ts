import { supabase } from '@/lib/supabase';
export const organisations = [{id:15809,label:'SAPA'},{id:16317,label:'Broll Pro Tour'},{id:16482,label:'SA Grand Tour'}];
export const categoriesFor = (org:number) => org === 16482 ? [35,40,45,50,55].map((age,i)=>({id:`mo${age}`,label:`Men Over ${age}`,type:3,age:i+2})) : [{id:'men',label:'Men',type:3,age:82},{id:'ladies',label:'Women',type:4,age:83}];
export type RankingPlayer = { id:string; participantId:string; name:string; rank:number; points:number; change:number; profile?:PlayerProfile };
type PlayerProfile = {id:string;name:string;image_url?:string;home_club?:string;nationality?:string;rankings?:{org?:string;age_group?:string;match_type?:string;details?:PointResult[]}[]};
export type PointResult = {date:string;name:string;class:string;place:string;event_type:string;points:number};
async function rankedin(path:string) {
 const url=`https://api.rankedin.com/v1/${path}`;
 const {data:cache}=await supabase.from('rankedin_cache').select('payload,updated_at').eq('url',url).maybeSingle();
 if(cache?.payload && (!Array.isArray(cache.payload.Payload) || cache.payload.Payload.length > 0) && Date.now()-Date.parse(cache.updated_at)<6*3600000) return cache.payload;
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),15000);
 try {const response=await fetch(url,{signal:controller.signal}); if(!response.ok)throw new Error(`Rankings service returned ${response.status}`); return await response.json();}
 catch(error){if(cache?.payload)return cache.payload;throw error;} finally{clearTimeout(timer);}
}
export function normalizeRankings(payload:any[]):RankingPlayer[]{return payload.filter(x=>x.Name).map(x=>({id:String(x.Participant?.Id||x.RankedinId||x.Name),participantId:String(x.Participant?.Id||x.ParticipantPoints?.RankingParticipantId||''),name:x.Name,rank:Number(x.Standing),points:Number(x.ParticipantPoints?.Points||0),change:Number(x.StandingDiff||0)}));}
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
export async function fetchPoints(id:string,age:number,all:boolean):Promise<PointResult[]>{
 if(!id)return [];
 const results:PointResult[]=[];
 for(let skip=0;;skip+=100){const data=await rankedin(`ranking/getparticipantpointsdetailsasync?id=${id}&agegroup=${age}&weekfromnow=0&showAll=${all?'true':'false'}&language=en&skip=${skip}&take=100`);const page=data?.ParticipantWithPoints?.EventPoints?.Payload;if(!Array.isArray(page))throw new Error('Points breakdown is temporarily unavailable.');results.push(...page.map((ep:any)=>({date:ep.EventPoint?.Date||'',name:ep.EventName||ep.EventPoint?.EventName?.split('|')[0]?.trim()||'',class:ep.EventPoint?.EventName?.split('| Class:')[1]?.trim()||'',place:String(ep.EventPoint?.Standing||''),event_type:ep.EventPoint?.EventType===3?'Team league':'Tournament',points:Number(ep.EventPoint?.Points||0)})));if(page.length<100)break;}
 return results;
}

export type TrophyWin = { name: string; date: string; results: (PointResult & { rankingLabel?: string })[] };
export type TrophyGroup = { tier: string; count: number; events: TrophyWin[] };

export async function fetchTournamentWins(player: RankingPlayer): Promise<TrophyGroup[]> {
 const wins = new Map<string, TrophyWin>();
 for (const ranking of player.profile?.rankings || []) {
  for (const result of ranking.details || []) {
   if (String(result.place) !== '1') continue;
   const key = `${result.date}-${result.name}`;
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
 const { data } = await supabase.from('calendar').select('event_name,sapa_status');
 const groups = new Map<string, TrophyWin[]>();
 for (const win of wins.values()) {
  const event = data?.find(e => e.event_name?.trim().toLowerCase() === win.name.trim().toLowerCase());
  const status = String(event?.sapa_status || win.name).toUpperCase();
  const tier = ['Major','Super Gold','Gold','Silver','Bronze'].find(t => status.includes(t.toUpperCase())) || 'Other';
  groups.set(tier, [...(groups.get(tier) || []), win]);
 }
 return Array.from(groups, ([tier, events]) => ({ tier, count: events.length, events }));
}
