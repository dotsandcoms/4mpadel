/** Resolve potential entrants from feeder links for safe advance scheduling. */
export function planningMatches(matches) {
    const incoming=new Map();
    matches.forEach(from=>['winner','loser'].forEach(result=>{const target=from[`${result}_to_match_id`];if(target){const list=incoming.get(target)||[];list.push({id:from.id,slot:from[`${result}_to_slot`],result});incoming.set(target,list);}}));
    const byId=new Map(matches.map(m=>[m.id,m]));
    const slotsMemo = new Map();
    const slots=(m,seen=new Set())=>{
        if(!m||seen.has(m.id)) return [[], []];
        if (slotsMemo.has(m.id)) return slotsMemo.get(m.id);
        const next=new Set([...seen,m.id]);
        const result = [1,2].map(slot=>{
            const id=m[slot===1?'entry_one_id':'entry_two_id'];
            if(id) return [id];
            return [...new Set((incoming.get(m.id)||[]).filter(f=>f.slot===slot).flatMap(f=>{
                const feeder = byId.get(f.id);
                if (['completed','walkover','retired','cancelled'].includes(feeder?.status)) return [feeder[`${f.result}_entry_id`]].filter(Boolean);
                const options = slots(feeder, next);
                // An automatic advance has a possible winner, but no loser.
                return f.result === 'loser' && options.some(option => !option.length) ? [] : options.flat();
            }))];
        });
        slotsMemo.set(m.id, result);
        return result;
    };
    const roundDependencies = (feeder, seen = new Set()) => {
        if (!feeder || seen.has(feeder.id)) return [];
        const next = new Set([...seen, feeder.id]);
        const round = !feeder.draw_id || feeder.round_number == null ? [feeder] : matches.filter(sibling => sibling.draw_id === feeder.draw_id && sibling.stage === feeder.stage && sibling.round_number === feeder.round_number && sibling.round_code === feeder.round_code);
        return round.flatMap(match => slots(match).every(option => option.length) ? [match.id]
            : (incoming.get(match.id) || []).flatMap(parent => roundDependencies(byId.get(parent.id), next)));
    };
    return matches.map(m=>({...m,possible_entry_ids:[...new Set(slots(m).flat())],
        is_automatic_bye: slots(m).filter(option => option.length).length === 1,
        is_empty_path: slots(m).every(option => !option.length),
        dependency_ids:[...new Set((incoming.get(m.id)||[]).flatMap(f=>{
        // Complete the whole feeder round before opening the next one. Bracket
        // identity keeps placement branches and other divisions independent.
        // Follow automatic BYE advances back to their actual played feeders.
        return roundDependencies(byId.get(f.id));
    }))],can_plan:slots(m).every(option => option.length)}));
}
export function planningSlotLabel(matches, match, slot) {
    const feeder=matches.find(m=>m.winner_to_match_id===match.id&&m.winner_to_slot===slot || m.loser_to_match_id===match.id&&m.loser_to_slot===slot);
    if(!feeder) return 'To be decided';
    const result=feeder.winner_to_match_id===match.id&&feeder.winner_to_slot===slot?'Winner':'Loser';
    return `${result} of ${feeder.round_label} · Match ${feeder.bracket_position}`;
}
