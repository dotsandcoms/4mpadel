import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventText as Text, EventIcon, lime } from '@/components/events/website-ui';
import { fetchTournamentWins, fetchPoints, type TrophyGroup, type PointResult, type RankingPlayer } from '@/lib/rankings';
import { sapaTone } from '@/theme/sapa';
export function RankingDetails({player,age,onClose}:{player:RankingPlayer;age:number;onClose:()=>void}){
 const safe=useSafeAreaInsets();const [tab,setTab]=useState('Ranking Overview');const [best,setBest]=useState(true);const [all,setAll]=useState<PointResult[]>([]);const [counted,setCounted]=useState<PointResult[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);setError('');Promise.all([fetchPoints(player.participantId,age,false),fetchPoints(player.participantId,age,true)]).then(([a,b])=>{if(active){setCounted(a.sort((a,b)=>b.points-a.points));setAll(b);}}).catch(()=>{if(active)setError('Could not load ranking details. Tap to retry.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[player.participantId,age,retry]);
 const [selectedTrophy,setSelectedTrophy]=useState<string|null>(null);
 const [wins,setWins]=useState<TrophyGroup[]>([]);
 useEffect(()=>{let active=true;fetchTournamentWins(player).then(rows=>{if(active)setWins(rows);}).catch(()=>{});return()=>{active=false;};},[player]);
 const share=()=>{void Share.share({message:`${player.name} — #${player.rank}, ${player.points.toLocaleString()} points`,url:player.profile?.id?`https://4mpadel.co.za/players?id=${player.profile.id}`:'https://4mpadel.co.za/rankings'}).catch(()=>{});};
 return <Modal visible animationType="slide" onRequestClose={onClose}><View style={{flex:1,backgroundColor:'#0a0a0a',paddingTop:safe.top,paddingBottom:safe.bottom}}>
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderColor:'#ffffff10'}}><Pressable accessibilityLabel="Close ranking details" onPress={onClose} hitSlop={12}><EventIcon name="arrow.left" color="white" size={24}/></Pressable><Text style={{fontSize:13,letterSpacing:1}}>RANKING DETAILS</Text><Pressable accessibilityLabel="Share ranking" onPress={share} hitSlop={12}><EventIcon name="square.and.arrow.up" color="white" size={20}/></Pressable></View>
 <View style={{padding:24,flexDirection:'row',gap:16,alignItems:'center'}}><Avatar player={player} size={80}/><View style={{flex:1,gap:5}}><Text style={{fontSize:20}}>{player.name.toUpperCase()}</Text>{!!player.profile?.nationality&&<Text style={{color:'#9ca3af',fontSize:12}}>{player.profile.nationality}</Text>}{!!player.profile?.home_club&&<Text style={{color:'#9ca3af',fontSize:12}}>{player.profile.home_club}</Text>}</View></View>
 <View style={{flexDirection:'row',paddingHorizontal:24,gap:24,borderBottomWidth:1,borderColor:'#ffffff18'}}>{['Ranking Overview','Tournament Results'].map(t=><Pressable key={t} onPress={()=>setTab(t)} style={{paddingBottom:14,borderBottomWidth:2,borderColor:tab===t?lime:'transparent'}}><Text style={{fontSize:10,color:tab===t?lime:'#9ca3af',textTransform:'uppercase'}}>{t}</Text></Pressable>)}</View>
 <ScrollView key={tab} contentContainerStyle={{padding:20,gap:20}}>{loading?<ActivityIndicator color={lime}/>:error?<Pressable onPress={()=>setRetry(x=>x+1)}><Text>{error}</Text></Pressable>:tab==='Ranking Overview'?<>
 {!!wins.length && <View style={{ gap: 12 }}>
   <Text style={{ fontSize: 10, color: '#9ca3af', letterSpacing: 1 }}>TOURNAMENT WINS</Text>
   <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
     {[...wins].sort((a,b) => ['Major','Super Gold','Gold','Silver','Bronze','Other'].indexOf(a.tier) - ['Major','Super Gold','Gold','Silver','Bronze','Other'].indexOf(b.tier)).map(w => {
       const tone = sapaTone(w.tier);
       return <Pressable key={w.tier} accessibilityRole="button" onPress={() => setSelectedTrophy(w.tier)} accessibilityLabel={`${w.count} ${w.tier} tournament ${w.count === 1 ? 'win' : 'wins'}`} style={{ width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: selectedTrophy === w.tier ? tone.fill : `${tone.fill}33`, backgroundColor: '#141414' }}>
         <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${tone.fill}14`, alignItems: 'center', justifyContent: 'center' }}><EventIcon name="trophy" size={24} color={tone.fill}/></View>
         <View style={{ flex: 1, gap: 3 }}><Text style={{ fontSize: 20, color: tone.fill }}>{w.count}</Text><Text style={{ fontSize: 11, color: '#d1d5db' }}>{w.tier}</Text></View>
         <EventIcon name="chevron.right" size={12} color={tone.fill}/>
       </Pressable>;
     })}
   </View>

 </View>}

 <View style={{flexDirection:'row',gap:10}}>{[['National',player.rank],['Points',player.points.toLocaleString()],['Tournaments',all.length]].map(([label,value])=><View key={label} style={{flex:1,backgroundColor:'#141414',paddingVertical:18,borderRadius:16,alignItems:'center',gap:6}}><Text style={{fontSize:9,color:'#9ca3af',textTransform:'uppercase'}}>{label}</Text><Text style={{fontSize:21}}>{value}</Text></View>)}</View>
 <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{fontSize:11,color:lime}}>POINTS BREAKDOWN</Text><View style={{flexDirection:'row',backgroundColor:'#ffffff10',padding:3,borderRadius:8}}>{['Best 8','All'].map((label,i)=><Pressable key={label} onPress={()=>setBest(i===0)} style={{padding:9,borderRadius:6,backgroundColor:best===(i===0)?lime:'transparent'}}><Text style={{fontSize:10,color:best===(i===0)?'#000':'#9ca3af'}}>{label}</Text></Pressable>)}</View></View>
 <View style={{borderRadius:16,overflow:'hidden',backgroundColor:'#141414'}}>{(best?counted:all).map((r,i)=><View key={i} style={{padding:16,flexDirection:'row',gap:12,borderBottomWidth:1,borderColor:'#ffffff10'}}><View style={{flex:1,gap:6}}><Text style={{fontSize:14,color:'#d1d5db'}}>{r.name}</Text>{!best&&<Text style={{fontSize:10,color:'#a78bfa'}}>{r.event_type}</Text>}</View><Text>{r.points.toLocaleString()}</Text></View>)}</View>{!(best?counted:all).length&&<Text style={{color:'#9ca3af'}}>No points breakdown available.</Text>}
 </> : <View style={{ gap: 10 }}>
   {all.map((r,i) => <View key={`${r.date}-${r.name}-${i}`} style={{ padding: 14, backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#ffffff12', gap: 9 }}>
     <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
       <Text style={{ fontSize: 11, color: '#9ca3af' }}>{r.date || 'Date unavailable'}</Text>
       <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: r.event_type === 'Team league' ? '#ffffff0d' : '#a78bfa14' }}><Text style={{ fontSize: 9, color: r.event_type === 'Team league' ? '#9ca3af' : '#c4b5fd' }}>{r.event_type || 'Tournament'}</Text></View>
     </View>
     <Text style={{ fontSize: 14, lineHeight: 19 }}>{r.name}</Text>
     {!!r.class && <Text style={{ fontSize: 11, lineHeight: 16, color: '#9ca3af' }}>{r.class}</Text>}
     <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTopWidth: 1, borderColor: '#ffffff10' }}>
       <Text style={{ fontSize: 11, color: '#9ca3af' }}>Standing <Text style={{ color: '#fff' }}>{r.place || '—'}</Text></Text>
       <Text style={{ fontSize: 11, color: '#9ca3af' }}>Points <Text style={{ color: lime, fontSize: 13 }}>{r.points.toLocaleString(undefined, { maximumFractionDigits: 3 })}</Text></Text>
     </View>
   </View>)}
   {!all.length && <Text style={{ color: '#9ca3af', fontSize: 13 }}>No tournament results available.</Text>}
 </View>}</ScrollView>
 <Modal visible={selectedTrophy !== null} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={() => setSelectedTrophy(null)}>
   <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
     <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#666', marginTop: 10 }} />
     <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ padding: 20, paddingBottom: safe.bottom + 24, gap: 16 }}>
       <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
         <Text accessibilityRole="header" style={{ flex: 1, fontSize: 18 }}>Trophy breakdown</Text>
         <Pressable accessibilityRole="button" accessibilityLabel="Close trophy breakdown" hitSlop={12} onPress={() => setSelectedTrophy(null)}><Text style={{ fontSize: 24, color: '#9ca3af' }}>×</Text></Pressable>
       </View>
       <Text style={{ fontSize: 12, color: '#9ca3af' }}>{player.name}</Text>
   {wins.filter(w => w.tier === selectedTrophy).map(group => <View key={group.tier} style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#141414', borderWidth: 1, borderColor: `${sapaTone(group.tier).fill}33` }}>
     <Text style={{ fontSize: 13, color: sapaTone(group.tier).fill }}>{group.tier} · {group.count} {group.count === 1 ? 'tournament won' : 'tournaments won'}</Text>
     {group.events.map((event, index) => <View key={`${event.date}-${event.name}`} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: '#ffffff12' }}>
       <Text style={{ fontSize: 10, color: '#9ca3af' }}>{event.date || 'Date unavailable'}</Text>
       <Text style={{ fontSize: 13, lineHeight: 18 }}>{event.name}</Text>
       {event.results.map((result, i) => <View key={i} style={{ gap: 5 }}>
         <Text style={{ fontSize: 11, lineHeight: 16, color: '#9ca3af' }}>{result.class || 'Division not supplied'}</Text>
         {!!result.rankingLabel && <Text style={{ fontSize: 10, color: '#828b9a' }}>{result.rankingLabel}</Text>}
         <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
           <Text style={{ fontSize: 11, color: sapaTone(group.tier).fill }}>1st place · Winner</Text>
           <Text style={{ fontSize: 11 }}>{Number(result.points || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} points</Text>
         </View>
       </View>)}
     </View>)}
   </View>)}
     </ScrollView>
   </View>
 </Modal>
 </View></Modal>;
}
export function Avatar({player,size}:{player:RankingPlayer;size:number}){return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:'#ffffff10',overflow:'hidden',alignItems:'center',justifyContent:'center'}}>{player.profile?.image_url?<Image source={{uri:player.profile.image_url}} style={{width:'100%',height:'100%'}}/>:<EventIcon name="person" size={size*.5} color="#9ca3af"/>}</View>;}
