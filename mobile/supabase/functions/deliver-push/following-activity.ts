import { activityDate, localTournamentResult, tournamentFixtureRows, localMatchIdentity, localResultActivity, objectRow, proMatchActivity, proProfileActivities, type ActivityItem } from './following-model.ts';
type Database={from(name:string):any;rpc(name:string,args?:Record<string,unknown>):PromiseLike<{data:any;error:any}>};
type Source={source_key:string;source:string;target_id:string;rankedin_id?:string;name:string;photo_url?:string;snapshot:Record<string,any>|null;lease_id:string};
const checked=async (query:PromiseLike<{data:any;error:any}>)=>{const {data,error}=await query;if(error)throw new Error('Following data operation failed');return data;};
let anonymous:{token:string;until:number}|null=null;

async function json(fetcher:typeof fetch,url:string,headers:Record<string,string>={}) {
  const response=await fetcher(url,{headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(8000)});
  if (response.headers.get('x-4m-cache') === 'stale') throw new Error('Following source refresh paused');
  if (!response.ok) throw new Error('Activity provider is unavailable');
  return response.json();
}
async function localTournamentHistory(id:number,fetcher:typeof fetch) {
  const events:any[]=[];
  for(let skip=0;skip<300;skip+=100) {
    const page=await json(fetcher,`https://api.rankedin.com/v1/player/ParticipatedEventsAsync?playerId=${id}&language=en&skip=${skip}&take=100`);
    if(!Array.isArray(page.Payload))throw new Error('Invalid tournament history');
    events.push(...page.Payload.filter((event:any)=>Number.isSafeInteger(event?.Id)&&typeof event.Name==='string'));
    if(page.Payload.length<100||page.HasMore===false)break;
  }
  const recent=[...new Map(events.map(event=>[event.Id,event])).values()].filter(event=>{const at=activityDate(event.StartDate);return at&&Date.parse(at)<=Date.now()&&Date.parse(at)>=Date.now()-100*86400000;}).slice(0,15);
  const matches:any[]=[];let next=0;
  await Promise.all(Array.from({length:Math.min(3,recent.length)},async()=>{
    while(next<recent.length) {
      const event=recent[next++];
      try {
        const fixtures=tournamentFixtureRows(await json(fetcher,`https://api.rankedin.com/v1/tournament/GetMatchesSectionAsync?Id=${event.Id}&LanguageCode=en&IsReadonly=true`));
        for(const team of fixtures.filter(match=>match.Challenger?.Player1Url?.includes('/team/')||match.Challenged?.Player1Url?.includes('/team/'))) {
          try{fixtures.push(...tournamentFixtureRows(await json(fetcher,`https://api.rankedin.com/v1/tournament/GetTournamentTeamsMatchesAsync?tournamentId=${event.Id}&challengeId=${team.Id}&language=en`)));}catch{}
        }
        for(const fixture of fixtures){const match=localTournamentResult(event,fixture,id);if(match)matches.push(match);}
      }catch{}
    }
  }));
  return matches;
}

async function rankedIn(source:Source,client:Database,fetcher:typeof fetch) {
  const saved=await checked(client.from('player_matches').select('past_matches').eq('rankedin_id',source.rankedin_id).maybeSingle());
  const cached=Array.isArray(saved?.past_matches)?saved.past_matches:[];
  let matches=cached;let providerFresh=false;
  try {
    const base='https://api.rankedin.com/v1/player';
    const profile=await json(fetcher,`${base}/playerprofileinfoasync?rankedinId=${encodeURIComponent(source.rankedin_id!)}&language=en`);
    const id=profile?.Id||profile?.Header?.PlayerId;
    if (!Number.isSafeInteger(id)||id<=0) throw new Error('Invalid player identity');
    if (!anonymous || anonymous.until<Date.now()) {
      const layout=await json(fetcher,`${base}/getlayoutinfoasync?language=en`);
      anonymous={token:typeof layout?.AnonymousToken==='string'?layout.AnonymousToken:'',until:Date.now()+10*60000};
    }
    const found=new Map<string,any>();
    for(let skip=0;skip<200;) {
      const page=await json(fetcher,`${base}/GetPlayerMatchesAsync?playerid=${id}&takehistory=true&language=en&skip=${skip}&take=40`,anonymous.token?{'x-anonymous-token':anonymous.token}:{});
      if(!Array.isArray(page?.Payload)) throw new Error('Invalid match history');
      const before=found.size;
      page.Payload.filter(objectRow).forEach((row:any)=>{if(row.Info?.EventName&&row.Info.EventName!=='EventName')found.set(localMatchIdentity(row),row);});
      const old=page.Payload.some((row:any)=>{const date=activityDate(row?.Info?.Date);return date&&Date.parse(date)<Date.now()-90*86400000;});
      if(page.Payload.length<40||page.HasMore===false||old) break;
      if(found.size===before)throw new Error('Repeated match history page');
      skip+=page.Payload.length;
    }
    const published=await localTournamentHistory(id,fetcher).catch(()=>[]);
    for(const row of published)found.set(localMatchIdentity(row),row);
    providerFresh=found.size>0;
    const combined=new Map<string,any>(cached.filter(objectRow).map((row:any)=>[localMatchIdentity(row),row]));
    for(const [key,row] of found) {
      const old=combined.get(key);
      // A set-total summary must not overwrite a published game-by-game result.
      if(old?.Score?.Score?.length && (!row.Score?.Score?.length||row.Score?.IsSummary&&!old.Score?.IsSummary))continue;
      combined.set(key,row);
    }
    matches=[...combined.values()];
  } catch { if(!cached.length)throw new Error('Following match history unavailable'); }
  const items=matches.map((match:any)=>localResultActivity(match,{id:Number(source.target_id),name:source.name})).filter(Boolean) as ActivityItem[];
  return {snapshot:{synced:true,provider_fresh:providerFresh},items};
}

const tournamentCache=new Map<number,{until:number;value:any}>();
const tournamentRequests=new Map<number,Promise<any>>();
const playerMedia=new Map<number,{until:number;photo_url:string|null;nationality:string|null}>();
/** Match references omit portraits/countries. Resolve exact player IDs in bounded batches. */
async function withPlayers(rows:any[],token:string,fetcher:typeof fetch) {
  const names=new Map<number,string>();
  for(const row of rows)for(const team of ['team_1','team_2'])for(const p of Array.isArray(row.players?.[team])?row.players[team]:[]) {
    if(Number.isSafeInteger(p?.id)&&p.id>0&&typeof p.name==='string'&&p.name.trim())names.set(p.id,p.name.trim());
  }
  const missing=[...names].filter(([id])=>(playerMedia.get(id)?.until||0)<=Date.now());
  const groups=Array.from({length:Math.ceil(missing.length/20)},(_,i)=>missing.slice(i*20,(i+1)*20));
  for(let start=0;start<groups.length;start+=3)await Promise.all(groups.slice(start,start+3).map(async group=>{
    const url=new URL('https://padelapi.org/api/players');
    url.searchParams.set('name',group.map(([,name])=>name).join(','));url.searchParams.set('per_page','50');
    try {
      const value=await json(fetcher,url.href,{Authorization:`Bearer ${token}`});
      if(!Array.isArray(value.data))return;
      for(const p of value.data)if(Number.isSafeInteger(p?.id)&&names.has(p.id))playerMedia.set(p.id,{until:Date.now()+30*60000,
        photo_url:typeof p.photo_url==='string'&&p.photo_url.startsWith('https://')?p.photo_url:null,
        nationality:typeof p.nationality==='string'&&/^[A-Z]{2}$/.test(p.nationality)?p.nationality:null});
    }catch{ /* Preserve real scores when optional player media is unavailable. */ }
  }));
  const enriched=rows.map(row=>({...row,players:row.players?Object.fromEntries(['team_1','team_2'].map(team=>[team,
    (Array.isArray(row.players[team])?row.players[team]:[]).map((p:any)=>{const media=playerMedia.get(p.id);return {...p,photo_url:media?.photo_url||p.photo_url||null,nationality:media?.nationality||p.nationality||null};})])):row.players}));
  if(playerMedia.size>4000)playerMedia.clear();
  return enriched;
}
async function withTournament(match:any,token:string,fetcher:typeof fetch) {
  if(!objectRow(match)||match.tournament?.name)return match;
  const linked=typeof match.connections?.tournament==='string'?/^\/api\/tournaments\/([1-9]\d*)$/.exec(match.connections.tournament):null;
  const id=linked?Number(linked[1]):null;
  if(!id||!Number.isSafeInteger(id))return match;
  const cached=tournamentCache.get(id);
  if(cached&&cached.until>Date.now())return {...match,tournament:cached.value};
  let pending=tournamentRequests.get(id);
  if(!pending) {
    pending=json(fetcher,`https://padelapi.org/api/tournaments/${id}`,{Authorization:`Bearer ${token}`}).then(value=>{
      const row=objectRow(value.data)?value.data:value;
      if(row.id!==id||typeof row.name!=='string')throw new Error('Invalid tournament');
      tournamentCache.set(id,{until:Date.now()+10*60000,value:row});
      if(tournamentCache.size>100)tournamentCache.delete(tournamentCache.keys().next().value!);
      return row;
    }).finally(()=>tournamentRequests.delete(id));
    tournamentRequests.set(id,pending);
  }
  try{return {...match,tournament:await pending};}catch{return match;}
}

async function proSource(source:Source,token:string,fetcher:typeof fetch) {
  const headers={Authorization:`Bearer ${token}`};
  const previous=source.snapshot||{};
  if(source.source==='pro_match') {
    const value=await json(fetcher,`https://padelapi.org/api/matches/${source.target_id}`,headers);
    const match=objectRow(value.data)?value.data:value;
    if(match.id!==Number(source.target_id))throw new Error('Invalid match response');
    const [enriched]=await withPlayers([await withTournament(match,token,fetcher)],token,fetcher);
    const item=proMatchActivity(enriched,previous.match);
    return {snapshot:{match:enriched},items:item?[item]:[]};
  }
  const value=await json(fetcher,`https://padelapi.org/api/players/${source.target_id}`,headers);
  const profile=objectRow(value.data)?value.data:value;
  if(profile.id!==Number(source.target_id))throw new Error('Invalid player response');
  playerMedia.set(profile.id,{until:Date.now()+30*60000,photo_url:profile.photo_url||null,nationality:profile.nationality||null});
  const rows:any[]=[];
  for(let page=1;page<=3;page++) {
    const matches=await json(fetcher,`https://padelapi.org/api/players/${source.target_id}/matches?per_page=50&page=${page}&draw=all&sort_by=played_at&order_by=desc`,headers);
    if(!Array.isArray(matches.data))throw new Error('Invalid player match response');
    rows.push(...matches.data);
    if(!(Number(matches.meta?.last_page)>page)||matches.data.some((match:any)=>{const at=activityDate(match.played_at);return at&&Date.parse(at)<Date.now()-90*86400000;}))break;
  }
  const enriched:any[]=[];
  for(let start=0;start<rows.length;start+=5)enriched.push(...await Promise.all(rows.slice(start,start+5).map(match=>withTournament(match,token,fetcher))));
  const presented=await withPlayers(enriched,token,fetcher);
  const items=presented.map(match=>proMatchActivity(match,previous.matches?.[match.id])).filter(Boolean) as ActivityItem[];
  items.push(...proProfileActivities(profile,previous.profile));
  const day=new Date().toISOString().slice(0,10);
  const baseline=previous.profile?._followingRankDay===day?previous.profile:null;
  const trackedProfile={...profile,_followingRankDay:day,_followingBeforeRank:baseline?._followingBeforeRank??previous.profile?.ranking??profile.ranking??null,_followingBeforePoints:baseline?._followingBeforePoints??previous.profile?.points??profile.points??null};
  return {snapshot:{profile:trackedProfile,matches:Object.fromEntries(presented.map(match=>[match.id,match]))},items};
}

/** Scheduled work keeps the feed populated while users' apps are closed. */
export async function refreshFollowingActivity(client:Database,token:string|undefined,fetcher:typeof fetch=fetch) {
  await checked(client.rpc('refresh_following_activity'));
  const sources=await checked(client.rpc('claim_following_sources',{p_limit:6})) as Source[];
  let processed=0,failed=0;
  // Providers are bounded separately from notification delivery.
  for(let start=0;start<(sources?.length||0);start+=3) {
    await Promise.all(sources.slice(start,start+3).map(async source=>{
      try {
        if(source.source!=='local'&&!token)throw new Error('Provider not configured');
        const result=source.source==='local'?await rankedIn(source,client,fetcher):await proSource(source,token!,fetcher);
        for(const item of result.items) {
          if(item.event_key.startsWith('rankedin-result:')) {
            const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(item.event_key));
            item.event_key='rankedin-result:'+Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
          }
        }
        await checked(client.rpc('finish_following_source',{p_key:source.source_key,p_lease:source.lease_id,p_snapshot:result.snapshot,p_items:result.items.slice(0,200)}));
        processed++;
      } catch {
        failed++;
        await checked(client.rpc('finish_following_source',{p_key:source.source_key,p_lease:source.lease_id,p_snapshot:null,p_items:[]})).catch(()=>{});
      }
    }));
  }
  return {processed,failed};
}
