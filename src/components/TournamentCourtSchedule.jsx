import React, {useEffect, useState} from 'react';
import {supabase} from '../supabaseClient';
import DrawCourtCalendar from './DrawCourtCalendar';
import {planningSlotLabel} from '../utils/drawPlanning';

// Only the draws already approved for this public page are queried.
export default function TournamentCourtSchedule({draws, refreshTick, drawUrl}) {
    const [data,setData]=useState({matches:[],entries:[]});
    const [error,setError]=useState('');
    const [loading,setLoading]=useState(true);
    const ids=draws.map(d=>d.id).sort().join(',');
    useEffect(()=>{
        let active=true;
        async function readAll(table) {
            const rows=[];
            for(let start=0;;start+=1000){
                const {data,error}=await supabase.from(table).select('*').in('draw_id',ids.split(',')).order('id').range(start,start+999);
                if(error) throw error;
                rows.push(...(data||[]));
                if(!data||data.length<1000) return rows;
            }
        }
        setLoading(true);setError('');
        if(!ids){setData({matches:[],entries:[]});setLoading(false);return;}
        Promise.all([readAll('draw_matches'),readAll('draw_entries')]).then(([matches,entries])=>{if(active)setData({matches,entries});}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
        return ()=>{active=false;};
    },[ids,refreshTick]);
    const divisions=[...new Map(draws.map(d=>[d.division_id,{id:d.division_id,name:d.tournament_divisions?.name||'Division'}])).values()];
    const byDraw=new Map(draws.map(d=>[d.id,d]));
    const entries=new Map(data.entries.map(e=>[e.id,e]));
    const matches=data.matches.filter(m=>byDraw.has(m.draw_id)&&m.status!=='cancelled').map(m=>({...m,division_id:byDraw.get(m.draw_id).division_id}));
    if(loading)return <p role="status" className="text-gray-400">Loading all division schedules…</p>;
    if(error)return <p role="alert" className="text-red-300">Could not load the tournament schedule: {error}</p>;
    return <DrawCourtCalendar matches={matches} divisions={divisions} teamName={id=>entries.get(id)?.team_name||'To be decided'} sideName={(m,slot)=>entries.get(m[slot===1?'entry_one_id':'entry_two_id'])?.team_name||planningSlotLabel(data.matches,m,slot)} matchHref={m=>`${drawUrl(m.draw_id,m.id)}#match-centre`} />;
}
