/** Add explicit winner/loser routes and upfront consolation brackets. */
export function addBackplates(draw, mode = 'none') {
    const topEight = draw.placement_playoff === 'top8' && draw.draw_size >= 8;
    const selected = Array.isArray(mode) ? [...mode, ...(draw.matches.some(m=>m.round_code==='3_4') ? ['places_3_4'] : []), ...(topEight ? ['places_5_8', 'places_7_8'] : [])] : null;
    if (selected) mode = 'all';
    const matches = draw.matches;
    const main = matches.filter(m => m.stage === 'knockout');
    const byKey = new Map(matches.map(m => [m.key, m]));
    for (const match of main) {
        const next = byKey.get(`r${match.round_number + 1}-m${Math.ceil(match.bracket_position / 2)}`);
        if (next) { match.winner_to_match_key = next.key; match.winner_to_slot = (match.bracket_position - 1) % 2 + 1; }
    }
    if (!['double','triple','all'].includes(mode) && !topEight) return draw;
    let roundOffset = draw.total_rounds + 1;
    const branch = (feeders, low, high, depth, full = mode === 'all') => {
        if (feeders.length < 2) return;
        const key = `places_${low}_${high}`;
        // Top 8 and a plate can share the same range in an eight-slot draw.
        if (byKey.has(`${key}_r1_m1`)) return;
        let slots = feeders.map(m => ({type:'loser',source_match_key:m.key}));
        const rounds = [];
        let localRound = 1;
        while (slots.length > 1) {
            const current = [];
            for (let i=0;i<slots.length;i+=2) {
                const m = {key:`${key}_r${localRound}_m${i/2+1}`,stage:'placement',round_code:`${key}_r${localRound}`,round_label:`Places ${low}–${high} · ${slots.length === 2 ? 'Final' : `Round of ${slots.length}`}`,round_number:roundOffset,bracket_position:i/2+1,entry_one:null,entry_two:null,winner:null,status:'pending',result_type:null,source_slots:slots.slice(i,i+2)};
                current.push(m); matches.push(m); byKey.set(m.key,m);
                m.source_slots.forEach((source,j) => {const from=byKey.get(source.source_match_key); const result=source.type === 'loser' ? 'loser' : 'winner'; from[`${result}_to_match_key`]=m.key; from[`${result}_to_slot`]=j+1;});
            }
            rounds.push(current); slots=current.map(m=>({type:'match',source_match_key:m.key})); localRound++; roundOffset++;
        }
        if (full) rounds.forEach((round,i)=>branch(round,low+(high-low+1)/2**(i+1),low+(high-low+1)/2**i-1,depth+1,true));
        else if (mode === 'triple' && depth === 1) branch(rounds[0],low+(high-low+1)/2,high,2);
    };
    if (topEight) branch(main.filter(m => m.round_number === draw.total_rounds - 2), 5, 8, 1, true);
    if (mode === 'all') {
        // Full placement owns the 3–4 route too.
        draw.matches = matches.filter(m=>m.round_code !== '3_4');
        matches.splice(0,matches.length,...draw.matches);
        for (let r=1;r<=draw.total_rounds;r++) branch(main.filter(m=>m.round_number===r),draw.draw_size/2**r+1,draw.draw_size/2**(r-1),1);
    } else if (['double', 'triple'].includes(mode)) branch(main.filter(m=>m.round_number===1),draw.draw_size/2+1,draw.draw_size,1);
    if (selected) {
        const keep = new Set(matches.filter(m => m.stage === 'knockout' || selected.includes((m.round_code || '').replace(/_r\d+$/, ''))).map(m=>m.key));
        let grew = true;
        while (grew) {
            grew = false;
            for (const m of matches) if (keep.has(m.key)) for (const source of m.source_slots || []) {
                if (source.source_match_key && !keep.has(source.source_match_key)) { keep.add(source.source_match_key); grew = true; }
            }
        }
        draw.matches = matches.filter(m=>keep.has(m.key));
        for (const m of draw.matches) for (const result of ['winner','loser']) if (!keep.has(m[`${result}_to_match_key`])) {
            delete m[`${result}_to_match_key`]; delete m[`${result}_to_slot`];
        }
    } else draw.matches=matches;
    return draw;
}

export function routeIds(matches, idForMatch) {
    const byKey=new Map(matches.map(m=>[m.key,m]));
    return new Map(matches.map(m=>[m.key,Object.fromEntries(['winner','loser'].flatMap(result=>{
        const target=byKey.get(m[`${result}_to_match_key`]);
        return [[`${result}_to_match_id`,target ? idForMatch(target) : null],[`${result}_to_slot`,target ? m[`${result}_to_slot`] : null]];
    }))]));
}

/** Resolve known feeder outcomes, including empty bye paths, without inventing teams. */
export function resolveDrawRoutes(input) {
    const matches=input.map(m=>({...m}));
    const terminal=m=>['completed','walkover','retired','cancelled'].includes(m.status);
    for (let pass=0;pass<matches.length;pass++) {
        let changed=false;
        for (const m of matches) {
            if (terminal(m)) continue;
            const feeders=[1,2].map(slot=>matches.flatMap(from=>['winner','loser'].filter(result=>from[`${result}_to_match_id`]===m.id && from[`${result}_to_slot`]===slot).map(result=>({from,result})))[0]);
            if (!feeders.some(Boolean)) continue;
            feeders.forEach((feed, i)=>{if (feed && terminal(feed.from)) {const value=feed.from[`${feed.result}_entry_id`] || null; const field=i===0?'entry_one_id':'entry_two_id'; if(m[field]!==value){m[field]=value;changed=true;}}});
            const resolved=feeders.every((feed,i)=>feed ? terminal(feed.from) : Boolean(m[i===0?'entry_one_id':'entry_two_id']));
            if (resolved && (!m.entry_one_id || !m.entry_two_id)) {m.winner_entry_id=m.entry_one_id||m.entry_two_id||null;m.loser_entry_id=null;m.status=m.winner_entry_id?'walkover':'cancelled';m.result_type=m.winner_entry_id?'walkover':'cancelled';changed=true;}
        }
        if(!changed) break;
    }
    return matches;
}

export function placementRangeOptions(size) {
    const result=[];
    const visit=(low,high)=>{if(high<=low)return; result.push(`places_${low}_${high}`); for(let width=(high-low+1)/2;width>=2;width/=2)visit(low+width,low+2*width-1);};
    for(let width=size/2;width>=2;width/=2)visit(width+1,width*2);
    return [...new Set(result)].sort((a,b)=>Number(a.split('_')[1])-Number(b.split('_')[1]) || Number(b.split('_')[2])-Number(a.split('_')[2]));
}

export function placementPlayoffExplanation(mode) {
    if (mode === 'top8') return 'Top 8 decides every place from 1st to 8th: semifinal losers play for 3rd–4th; quarterfinal losers play for 5th–8th, including a 7th–8th playoff. Matches already included by the back draw are not duplicated.';
    if (mode === 'top4') return 'Top 4 sends the two semifinal losers into a playoff for third and fourth place. Matches already included by the back draw are not duplicated.';
    return 'No extra playoff for the top places. The selected back draw can still include placement matches.';
}

/** Explain the selected option using the actual elimination bracket size. */
export function backDrawExplanation(mode, size) {
    const silver = `${size / 2 + 1}–${size}`;
    const bronze = `${size * 3 / 4 + 1}–${size}`;
    if (Array.isArray(mode)) return {
        title: 'Choose the finishing places you need',
        description: 'Select placement ranges below. The draw includes the earlier matches needed to determine who enters each selected range. Leaving every range unticked adds no back draw.',
        example: size >= 16 ? 'For example, choosing places 13–16 also adds the required feeder matches from the 9–16 bracket.' : 'Only placement ranges available for this draw size are shown.',
    };
    if (mode === 'double') return {
        title: 'One extra chance after an opening-round loss',
        description: 'Teams that lose their opening main-draw match enter Silver. Silver is another knockout bracket: winners advance and losers leave that bracket. It does not play off every finishing position.',
        example: size >= 4 ? `For this ${size}-slot draw, Silver covers places ${silver}.` : 'At least a 4-slot draw is needed to create a Silver match.',
    };
    if (mode === 'triple') return {
        title: 'Main draw, then Silver and Bronze',
        description: 'Opening-round main-draw losers enter Silver. Teams that then lose in Silver’s opening round enter Bronze. Each bracket uses knockout matches; this does not play off every finishing position.',
        example: size >= 8 ? `For this ${size}-slot draw, Silver covers places ${silver} and Bronze covers places ${bronze}.` : 'At least an 8-slot draw is needed to create a Bronze match.',
    };
    if (mode === 'all') return {
        title: 'Play for every finishing position',
        description: 'Teams move into placement brackets after a loss, so the draw can determine each finishing place, including third and fourth. This creates the most matches and needs more court time.',
        example: `For this ${size}-slot draw, placement brackets cover the finishing positions below the main finalists. Byes can reduce the matches actually played.`,
    };
    return {
        title: 'Main draw only',
        description: 'A loss eliminates the team from the main draw, with no consolation bracket added. A separate third-place playoff can still be enabled using Placement playoff.',
        example: 'Choose this for the shortest schedule, or when teams do not need additional matches after losing.',
    };
}
