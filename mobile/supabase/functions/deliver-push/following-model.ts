type ObjectRow = Record<string, any>;
export type ActivityItem = { event_key: string; kind: string; title: string; body: string; path: string; payload: ObjectRow; occurred_at: string; local_player_ids?: number[]; pro_player_ids?: number[]; pro_match_id?: number; photo_url?: string | null };
export const objectRow = (value: unknown): value is ObjectRow => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' && value !== 'hidden_free_plan' ? value.trim() : '';
const nameKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const number = (value: unknown): number | null => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function activityDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(raw);
  // RankedIn's displayed match times are South African local time.
  const stamp = parts ? `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}T${(parts[4] || '00').padStart(2, '0')}:${parts[5] || '00'}:00+02:00` : raw;
  const date = new Date(stamp);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear()>2000 ? date.toISOString() : null;
}
function recent(date: string | null, now: number) { return !!date && Date.parse(date)<=now && Date.parse(date)>=now-90*86400000; }

function scheduleDetails(scheduled: string | null, court: string): string {
  const date = scheduled ? new Date(scheduled) : null;
  const day = date && new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short' }).format(date);
  const time = date && new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return [date ? `${day}, ${time} SAST` : 'Time to be confirmed', court].filter(Boolean).join(' · ');
}

export function localMatchIdentity(row: ObjectRow): string {
  const info = row.Info || {};
  const teams = [[info.Challenger?.Name,info.Challenger1?.Name],[info.Challenged?.Name,info.Challenged1?.Name]]
    .map(team => team.filter((value): value is string => typeof value==='string' && !!value.trim()).map(nameKey).sort().join('|')).sort();
  return JSON.stringify([nameKey(text(info.EventName)),activityDate(info.Date),...teams]);
}

/** Stable team ordering makes a shared match one item, whichever followed player was synced. */
export function localResultActivity(row: unknown, player: { id: number; name: string }, now=Date.now()): ActivityItem | null {
  if (!objectRow(row) || !objectRow(row.Info) || !Array.isArray(row.Score?.Score)) return null;
  const info=row.Info;
  const teams=[[text(info.Challenger?.Name),text(info.Challenger1?.Name)],[text(info.Challenged?.Name),text(info.Challenged1?.Name)]]
    .map(team => team.filter(Boolean).sort((a,b)=>nameKey(a).localeCompare(nameKey(b))));
  const at=activityDate(info.Date);
  if (!recent(at,now) || teams.some(team=>!team.length) || !teams.flat().some(name=>nameKey(name)===nameKey(player.name))) return null;
  let winner=typeof info.Challenger?.IsWinner==='boolean' ? info.Challenger.IsWinner ? 0 : 1
    : typeof info.Challenged?.IsWinner==='boolean' ? info.Challenged.IsWinner ? 1 : 0 : null;
  if (winner===null) return null;
  let scores=row.Score.Score.map((set: ObjectRow)=>[number(set.Score1),number(set.Score2)])
    .filter((set: (number|null)[])=>set.every(value=>value!==null && value>=0));
  if (!scores.length) return null;
  if (nameKey(teams[0].join('|'))>nameKey(teams[1].join('|'))) { teams.reverse(); scores=scores.map((set: number[])=>[set[1],set[0]]); winner=1-winner; }
  const teamNames=teams.map(team=>team.join(' / '));
  const scoreLabel=scores.map((set: number[])=>`${set[winner!]}–${set[1-winner!]}`).join(', ');
  const isSummary=row.Score.IsSummary===true;
  const clean={ Info: { EventName: text(info.EventName),Date:text(info.Date),EventStartDate:text(info.EventStartDate),Court:text(info.Court),
    Challenger:{Name:teams[0][0],IsWinner:winner===0},Challenger1:{Name:teams[0][1]||null},
    Challenged:{Name:teams[1][0],IsWinner:winner===1},Challenged1:{Name:teams[1][1]||null} },
    Score:{Score:scores.map((set: number[])=>({Score1:set[0],Score2:set[1]})),IsSummary:isSummary} };
  return { event_key:`rankedin-result:${localMatchIdentity(row)}`,kind:'result',local_player_ids:[player.id],
    title:`${teamNames[winner]} won ${scoreLabel}${isSummary ? ' in sets' : ''} against ${teamNames[1-winner]}`,
    body:text(info.EventName),path:'/match-result',occurred_at:at!,payload:{teams:teamNames,scores,winner,is_summary:isSummary,event_name:text(info.EventName),rankedin_match:clean} };
}

export function proMatchActivity(raw: unknown, previous: ObjectRow | undefined, now=Date.now()): ActivityItem | null {
  if (!objectRow(raw) || !Number.isSafeInteger(raw.id) || raw.id<=0 || !objectRow(raw.players)) return null;
  const teams=['team_1','team_2'].map(key=>Array.isArray(raw.players[key]) ? raw.players[key].filter((p: any)=>Number.isSafeInteger(p.id)&&p.id>0&&text(p.name)) : []);
  if (teams.some(team=>!team.length)) return null;
  const ids=[...new Set(teams.flat().map((p: ObjectRow)=>p.id))];
  const names=teams.map(team=>team.map((p: ObjectRow)=>text(p.name)).join(' / '));
  const tournament=text(raw.tournament?.name)||'International padel';
  // A tie-break value such as "6(3)" is a valid set score, not a missing number.
  const setScore=(value:unknown):number|string|null=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=99?value
    :typeof value==='string'&&/^\d{1,2}(\(\d{1,2}\))?$/.test(value)?value.includes('(')?value:Number(value):null;
  const scores=Array.isArray(raw.score) ? raw.score.map((set: ObjectRow)=>[setScore(set.team_1),setScore(set.team_2)]).filter((set: (number|string|null)[]): set is (number|string)[]=>set.every(value=>value!==null&&(typeof value==='string'||value>=0&&value<=99))) : [];
  const common={pro_player_ids:ids,pro_match_id:raw.id,path:`/pro/match/${raw.id}`,body:[tournament,text(raw.round_name)].filter(Boolean).join(' · '),
    photo_url:text(teams[0][0].photo_url)||null,payload:{teams:names,participants:teams.map(team=>team.map((p:ObjectRow)=>({id:p.id,name:text(p.name),photo_url:text(p.photo_url)||null,nationality:text(p.nationality)||null,source:'pro'}))),scores,event_name:tournament,round:text(raw.round_name),court:text(raw.court)}};
  if (['finished','retired','walkover'].includes(raw.status) && ['team_1','team_2'].includes(raw.winner)) {
    const played=activityDate(raw.played_at)||activityDate(raw.started_time);
    if (!recent(played,now)) return null;
    const updated=activityDate(raw.updated_at);
    const at=updated && Date.parse(updated)<=now ? updated : played;
    const winner=raw.winner==='team_1'?0:1;
    const label=scores.map((set: (number|string)[])=>`${set[winner]}–${set[1-winner]}`).join(', ');
    return {...common,event_key:`pro-result:${raw.id}`,kind:'result',occurred_at:at!,photo_url:text(teams[winner][0].photo_url)||null,
      title:`${names[winner]} ${raw.status==='walkover'?'advanced by walkover against':label?`won ${label} against`:'defeated'} ${names[1-winner]}`,
      payload:{...common.payload,winner,result_type:raw.status}};
  }
  if (['live','ongoing'].includes(raw.status)) {
    const at=activityDate(raw.started_time)||new Date(now).toISOString();
    return {...common,event_key:`pro-live:${raw.id}`,kind:'match_live',occurred_at:at,
      title:`${names[0]} vs ${names[1]} has started`,payload:{...common.payload,scores:[]}};
  }
  if (previous && raw.status==='scheduled') {
    const scheduled=activityDate(raw.scheduled_at);
    if (scheduled && Date.parse(scheduled)<now) return null;
    const beforeScheduled=activityDate(previous.scheduled_at), court=text(raw.court), beforeCourt=text(previous.court);
    // Missing or redacted provider fields are not evidence of a schedule change.
    const timeChanged=!!scheduled && scheduled!==beforeScheduled, courtChanged=!!court && court!==beforeCourt;
    if (!timeChanged && !courtChanged) return null;
    const update=scheduled && !beforeScheduled ? 'upcoming'
      : timeChanged && beforeScheduled && courtChanged && beforeCourt ? 'time_and_court'
      : timeChanged && beforeScheduled ? 'time'
      : courtChanged && beforeCourt ? 'court' : 'upcoming';
    const label=update==='time_and_court' ? 'Match time and court changed' : update==='time' ? 'Match time changed' : update==='court' ? 'Court changed' : 'Upcoming match';
    return {...common,event_key:`pro-schedule:${raw.id}:${text(raw.scheduled_at)}:${text(raw.court)}`,kind:'match_schedule',occurred_at:new Date(now).toISOString(),
      title:`${label}: ${names[0]} vs ${names[1]}`,body:`${common.body}\n${scheduleDetails(scheduled,court)}`,
      payload:{...common.payload,scores:[],scheduled_at:scheduled,schedule_update:update,before_scheduled_at:beforeScheduled,before_court:beforeCourt||null}};
  }
  return null;
}

export function proProfileActivities(raw: ObjectRow, previous: ObjectRow | undefined, now=Date.now()): ActivityItem[] {
  if (!previous || !text(raw.name) || !Number.isSafeInteger(raw.id)) return [];
  const day=new Date(now).toISOString().slice(0,10);
  const common={pro_player_ids:[raw.id],path:`/pro/player/${raw.id}`,photo_url:text(raw.photo_url)||null,occurred_at:new Date(now).toISOString()};
  const items: ActivityItem[]=[];
  const rank=number(raw.ranking),before=number(previous.ranking),points=number(raw.points),oldPoints=number(previous.points);
  if (rank!==null&&before!==null&&Number.isSafeInteger(rank)&&rank>0&&Number.isSafeInteger(before)&&before>0&&rank!==before)
    items.push({...common,event_key:`pro-ranking:${raw.id}:${new Date(now).toISOString().slice(0,10)}`,kind:'ranking',title:`${raw.name} moved to #${rank}`,
      body:'FIP ranking update',payload:{actors:[{id:raw.id,name:raw.name,photo_url:text(raw.photo_url)||null,nationality:text(raw.nationality)||null,source:'pro'}],before_rank:previous._followingRankDay===day?previous._followingBeforeRank:before,rank,before_points:previous._followingRankDay===day?previous._followingBeforePoints:oldPoints,points}});
  if (text(raw.photo_url) && text(previous.photo_url) && text(raw.photo_url)!==text(previous.photo_url))
    items.push({...common,event_key:`pro-profile:${raw.id}:${new Date(now).toISOString().slice(0,10)}`,kind:'profile',title:`${raw.name} updated their player photo`,body:'',payload:{actors:[{id:raw.id,name:raw.name,photo_url:text(raw.photo_url)||null,nationality:text(raw.nationality)||null,source:'pro'}],changes:['photos']}});
  return items;
}

export function tournamentFixtureRows(value: unknown): ObjectRow[] {
  if(Array.isArray(value))return value.flatMap(tournamentFixtureRows);
  if(!objectRow(value))return [];
  return Array.isArray(value.Matches)?value.Matches.filter(objectRow):objectRow(value.Matches)&&Array.isArray(value.Matches.Matches)?value.Matches.Matches.filter(objectRow):[];
}
export function localTournamentResult(event:ObjectRow,match:ObjectRow,internalId:number): ObjectRow|null {
  const first=match.Challenger,second=match.Challenged;
  if(!match.MatchResult?.IsPlayed || ![first?.Player1Id,first?.Player2Id,second?.Player1Id,second?.Player2Id].some(id=>String(id)===String(internalId)))return null;
  const score=match.MatchResult.Score||{};
  const firstWon=score.IsFirstParticipantWinner??(score.FirstParticipantScore!=null&&score.SecondParticipantScore!=null?score.FirstParticipantScore>score.SecondParticipantScore:match.MatchResult.IsFirstParticipantWinner);
  const detailed=Array.isArray(score.DetailedScoring)?score.DetailedScoring:[];
  const sets=detailed.length?detailed.map((set:any)=>({Score1:set.FirstParticipantScore,Score2:set.SecondParticipantScore})):score.FirstParticipantScore!=null&&score.SecondParticipantScore!=null?[{Score1:score.FirstParticipantScore,Score2:score.SecondParticipantScore}]:[];
  return {ChallengeId:match.Id,Info:{EventName:event.Name,EventStartDate:event.StartDate,Date:match.Date||event.StartDate,Court:match.Court,
    Challenger:{Name:first?.Name,IsWinner:firstWon},Challenger1:{Name:first?.Player2Name},Challenged:{Name:second?.Name,IsWinner:typeof firstWon==='boolean'?!firstWon:undefined},Challenged1:{Name:second?.Player2Name}},Score:{Score:sets,IsSummary:!detailed.length&&sets.length>0}};
}
