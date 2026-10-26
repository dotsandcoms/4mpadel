import { trackEvent } from '@/lib/analytics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, View } from 'react-native';
import { LocalFollowButton } from '@/components/players/local-follow-button';
import { TrophyBreakdown } from './trophy-breakdown';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventText as Text, EventIcon } from '@/components/events/website-ui';
import { fetchTournamentWins, type TrophyGroup, type PointResult, type RankingPlayer } from '@/lib/rankings';
import { fetchPlayerTournamentResults } from '@/lib/player-results';
import { lightSapaTone as sapaTone } from '@/theme/sapa';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
export function RankingDetails({player,age,onClose}:{player:RankingPlayer;age:number;onClose:()=>void}){
 const router=useRouter();const safe=useSafeAreaInsets();const [tab,setTab]=useState('Ranking Overview');const [best,setBest]=useState(true);const [all,setAll]=useState<PointResult[]>([]);const [counted,setCounted]=useState<PointResult[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 const refreshKey=useForegroundClock(5*60*1000);
 useEffect(()=>{let active=true;setLoading(true);setError('');fetchPlayerTournamentResults({ranking_participant_id:player.participantId,age_group_id:age}).then(results=>{if(active){setCounted(results.counted);setAll(results.all);}}).catch(()=>{if(active)setError('Could not load ranking details. Tap to retry.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[player.participantId,age,retry,refreshKey]);
 const [selectedTrophy,setSelectedTrophy]=useState<string|null>(null);
 const [wins,setWins]=useState<TrophyGroup[]>([]);
 const [winsError,setWinsError]=useState(false);
 useEffect(()=>{let active=true;setWinsError(false);fetchTournamentWins(player).then(rows=>{if(active)setWins(rows);}).catch(()=>{if(active)setWinsError(true);});return()=>{active=false;};},[player,retry,refreshKey]);
 const share=()=>{void Share.share({message:`${player.name} — #${player.rank}, ${player.points.toLocaleString()} points`,url:player.profile?.id?`https://4mpadel.co.za/players?id=${player.profile.id}`:'https://4mpadel.co.za/rankings'}).then(result => { if (result.action === Share.sharedAction) void trackEvent('share', { content_type: 'local_player', method: 'native' }); }).catch(()=>{});};
 return <Modal visible animationType="slide" onRequestClose={onClose}><View style={{flex:1,backgroundColor:'#F5F6F3',paddingTop:safe.top,paddingBottom:safe.bottom}}>
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderColor:'#16251f10'}}><Pressable accessibilityLabel="Close ranking details" onPress={onClose} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><EventIcon name="arrow.left" color="#16251F" size={24}/></Pressable><Text style={{fontSize:13,letterSpacing:1}}>RANKING DETAILS</Text><Pressable accessibilityLabel="Share ranking" onPress={share} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><EventIcon name="square.and.arrow.up" color="#16251F" size={20}/></Pressable></View>
 <View style={{padding:24,flexDirection:'row',gap:16,alignItems:'center'}}><Avatar player={player} size={80}/><View style={{flex:1,gap:5}}><Text style={{fontSize:20}}>{player.name.toUpperCase()}</Text>{!!player.profile?.nationality&&<Text style={{color:'#65726B',fontSize:12}}>{player.profile.nationality}</Text>}{!!player.profile?.home_club&&<Text style={{color:'#65726B',fontSize:12}}>{player.profile.home_club}</Text>}</View></View>
 {player.profile?.id && <View style={{marginHorizontal:24,marginBottom:16,flexDirection:'row',gap:10,alignItems:'flex-start'}}>
   <Pressable accessibilityRole="button" onPress={()=>{onClose();router.push({pathname:'/players/[id]',params:{id:String(player.profile!.id)}});}} style={{flex:1,minHeight:44,paddingHorizontal:12,borderRadius:12,backgroundColor:'#EAF0FF',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:13,color:'#2449D8'}}>View player profile</Text></Pressable>
   <LocalFollowButton playerId={String(player.profile.id)} name={player.name} iconOnly onSignIn={onClose} />
 </View>}
 <View style={{flexDirection:'row',paddingHorizontal:24,gap:24,borderBottomWidth:1,borderColor:'#16251f18'}}>{['Ranking Overview','Tournament Results'].map(t=><Pressable key={t} onPress={()=>setTab(t)} accessibilityRole="tab" accessibilityState={{selected:tab===t}} style={{flex:1,minHeight:44,justifyContent:'center',paddingBottom:14,borderBottomWidth:2,borderColor:tab===t?'#2449D8':'transparent'}}><Text style={{fontSize:11,color:tab===t?'#2449D8':'#65726B',textTransform:'uppercase'}}>{t}</Text></Pressable>)}</View>
 <ScrollView key={tab} contentContainerStyle={{padding:20,gap:20}}>{loading?<ActivityIndicator color="#386018"/>:error?<Pressable onPress={()=>setRetry(x=>x+1)}><Text>{error}</Text></Pressable>:tab==='Ranking Overview'?<>
 {winsError ? <Pressable accessibilityRole="button" onPress={()=>setRetry(x=>x+1)} style={{minHeight:44,justifyContent:'center'}}><Text>Could not refresh trophies. Tap to retry.</Text></Pressable> : !!wins.length && <View style={{ gap: 12 }}>
   <Text style={{ fontSize: 10, color: '#65726B', letterSpacing: 1 }}>TOURNAMENT WINS</Text>
   <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
     {[...wins].sort((a,b) => ['Major','Super Gold','Gold','Silver','Bronze','Other'].indexOf(a.tier) - ['Major','Super Gold','Gold','Silver','Bronze','Other'].indexOf(b.tier)).map(w => {
       const tone = sapaTone(w.tier);
       return <Pressable key={w.tier} accessibilityRole="button" onPress={() => setSelectedTrophy(w.tier)} accessibilityLabel={`${w.count} ${w.tier} tournament ${w.count === 1 ? 'win' : 'wins'}`} style={{ width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: selectedTrophy === w.tier ? tone.fill : `${tone.fill}33`, backgroundColor: '#FFFFFF' }}>
         <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${tone.fill}14`, alignItems: 'center', justifyContent: 'center' }}><EventIcon name="trophy" size={24} color={tone.text}/></View>
         <View style={{ flex: 1, gap: 3 }}><Text style={{ fontSize: 20, color: tone.text }}>{w.count}</Text><Text style={{ fontSize: 11, color: '#52625A' }}>{w.tier}</Text></View>
         <EventIcon name="chevron.right" size={12} color={tone.text}/>
       </Pressable>;
     })}
   </View>

 </View>}

 <View style={{flexDirection:'row',gap:10}}>{[['National',player.rank],['Points',player.points.toLocaleString()],['Tournaments',all.length]].map(([label,value])=><View key={label} style={{flex:1,backgroundColor:'#FFFFFF',paddingVertical:18,borderRadius:16,alignItems:'center',gap:6}}><Text style={{fontSize:9,color:'#65726B',textTransform:'uppercase'}}>{label}</Text><Text style={{fontSize:21}}>{value}</Text></View>)}</View>
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:11,color:'#386018'}}>POINTS BREAKDOWN</Text><View style={{flexDirection:'row',backgroundColor:'#16251f10',padding:3,borderRadius:8}}>{['Best 8','All'].map((label,i)=><Pressable key={label} onPress={()=>setBest(i===0)} accessibilityRole="button" accessibilityState={{selected:best===(i===0)}} style={{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center',padding:9,borderRadius:6,backgroundColor:best===(i===0)?'#2449D8':'transparent'}}><Text style={{fontSize:10,color:best===(i===0)?'#FFFFFF':'#65726B'}}>{label}</Text></Pressable>)}</View></View>
 <View style={{borderRadius:16,overflow:'hidden',backgroundColor:'#FFFFFF'}}>{(best?counted:all).map((r,i)=><View key={i} style={{padding:16,flexDirection:'row',gap:12,borderBottomWidth:1,borderColor:'#16251f10'}}><View style={{flex:1,gap:6}}><Text style={{fontSize:14,color:'#52625A'}}>{r.name}</Text>{!best&&<Text style={{fontSize:10,color:'#6D4495'}}>{r.event_type}</Text>}</View><Text>{r.points.toLocaleString()}</Text></View>)}</View>{!(best?counted:all).length&&<Text style={{color:'#65726B'}}>No points breakdown available.</Text>}
 </> : <View style={{ gap: 10 }}>
   {all.map((r,i) => <View key={`${r.date}-${r.name}-${i}`} style={{ padding: 14, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#16251f12', gap: 9 }}>
     <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
       <Text style={{ fontSize: 11, color: '#65726B' }}>{r.date || 'Date unavailable'}</Text>
       <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: r.event_type === 'Team league' ? '#16251f0d' : '#a78bfa14' }}><Text style={{ fontSize: 9, color: r.event_type === 'Team league' ? '#65726B' : '#6D4495' }}>{r.event_type || 'Tournament'}</Text></View>
     </View>
     <Text style={{ fontSize: 14, lineHeight: 19 }}>{r.name}</Text>
     {!!r.class && <Text style={{ fontSize: 11, lineHeight: 16, color: '#65726B' }}>{r.class}</Text>}
     <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTopWidth: 1, borderColor: '#16251f10' }}>
       <Text style={{ fontSize: 11, color: '#65726B' }}>Standing <Text style={{ color: '#16251F' }}>{r.place || '—'}</Text></Text>
       <Text style={{ fontSize: 11, color: '#65726B' }}>Points <Text style={{ color: "#386018", fontSize: 13 }}>{r.points.toLocaleString(undefined, { maximumFractionDigits: 3 })}</Text></Text>
     </View>
   </View>)}
   {!all.length && <Text style={{ color: '#65726B', fontSize: 13 }}>No tournament results available.</Text>}
 </View>}</ScrollView>
 <TrophyBreakdown playerName={player.name} groups={wins} selectedTier={selectedTrophy} onClose={() => setSelectedTrophy(null)} />
 </View></Modal>;
}
export function Avatar({player,size}:{player:RankingPlayer;size:number}){return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:'#16251f10',overflow:'hidden',alignItems:'center',justifyContent:'center'}}>{player.profile?.image_url?<Image source={{uri:player.profile.image_url}} style={{width:'100%',height:'100%'}}/>:<EventIcon name="person" size={size*.5} color="#65726B"/>}</View>;}
