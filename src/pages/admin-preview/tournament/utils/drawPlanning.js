/** Resolve potential entrants from feeder links for safe advance scheduling. */
export function planningMatches(matches) {
    const incoming=new Map();
    matches.forEach(from=>['winner','loser'].forEach(result=>{const target=from[`${result}_to_match_id`];if(target){const list=incoming.get(target)||[];list.push({id:from.id,slot:from[`${result}_to_slot`],result});incoming.set(target,list);}}));
    const byId=new Map(matches.map(m=>[m.id,m]));
    const possible=(m,seen=new Set())=>{
        if(!m||seen.has(m.id)) return [];
        const next=new Set([...seen,m.id]);
        return [...new Set([1,2].flatMap(slot=>{
            const id=m[slot===1?'entry_one_id':'entry_two_id'];
            if(id) return [id];
            return (incoming.get(m.id)||[]).filter(f=>f.slot===slot).flatMap(f=>possible(byId.get(f.id),next));
        }))];
    };
    return matches.map(m=>({...m,possible_entry_ids:possible(m),dependency_ids:[...new Set((incoming.get(m.id)||[]).flatMap(f=>{
        const feeder=byId.get(f.id);
        // Complete the whole feeder round before opening the next one. Bracket
        // identity keeps placement branches and other divisions independent.
        if (!feeder?.draw_id || feeder.round_number == null) return [f.id];
        return matches.filter(sibling=>sibling.draw_id===feeder.draw_id && sibling.stage===feeder.stage && sibling.round_number===feeder.round_number && sibling.round_code===feeder.round_code).map(sibling=>sibling.id);
    }))],can_plan:[1,2].every(slot=>m[slot===1?'entry_one_id':'entry_two_id']||(incoming.get(m.id)||[]).some(f=>f.slot===slot))}));
}
export function planningSlotLabel(matches, match, slot) {
    const feeder=matches.find(m=>m.winner_to_match_id===match.id&&m.winner_to_slot===slot || m.loser_to_match_id===match.id&&m.loser_to_slot===slot);
    if(!feeder) return 'To be decided';
    const result=feeder.winner_to_match_id===match.id&&feeder.winner_to_slot===slot?'Winner':'Loser';
    return `${result} of ${feeder.round_label} · Match ${feeder.bracket_position}`;
}
