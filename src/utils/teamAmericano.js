import { americanoStandings } from './americano.js';

export function teamAmericanoPlayers(registrations) {
    const seen = new Set();
    return registrations.flatMap(row => {
        if (!row.partner_email || !row.partner_name) throw new Error('Complete fixed pairs in Players before generating Team Americano.');
        const keys = [row.email, row.partner_email].map(x=>String(x).trim().toLowerCase());
        if (keys[0] === keys[1] || keys.some(key=>seen.has(key))) throw new Error('Each player must belong to one fixed team only.');
        keys.forEach(key=>seen.add(key));
        return [{id:String(row.id),name:row.full_name},{id:row.partner_registration_id || `${row.id}:partner`,name:row.partner_name}];
    });
}

export function generateTeamAmericano(players, { points = 24, courts = Math.max(1,Math.floor(players.length / 4)) } = {}) {
    const count=players.length/2;
    if (!Number.isInteger(count) || count<2 || count>256) throw new Error('Team Americano needs 2–256 complete teams.');
    if (new Set(players.map(p=>p.id)).size!==players.length) throw new Error('Each player must belong to one team only.');
    if (!Number.isInteger(points)||points<1||points>2147483647) throw new Error('Enter a positive whole number of rally points.');
    if (!Number.isInteger(courts)||courts<1||courts>Math.floor(count/2)) throw new Error(`Choose 1–${Math.floor(count/2)} courts.`);
    const teams=Array.from({length:count},(_,i)=>({id:`team-${i+1}`,name:players.slice(i*2,i*2+2).map(p=>p.name).join(' / '),players:players.slice(i*2,i*2+2).map(p=>p.id)}));
    const rotation=[...teams];if(count%2)rotation.push(null);
    const rounds=rotation.length-1, fixtures=[], rests=[];
    for(let round=1;round<=rounds;round++){
        let match=0;
        for(let i=0;i<rotation.length/2;i++){
            const a=rotation[i],b=rotation[rotation.length-1-i];
            if(!a||!b){rests.push({round,team_id:(a||b).id});continue;}
            fixtures.push({id:`r${round}-m${++match}`,round,court:(match-1)%courts+1,wave:Math.floor((match-1)/courts)+1,one:a.players,two:b.players,score:null});
        }
        rotation.splice(1,0,rotation.pop());
    }
    return {variant:'team',players,teams,rounds,points,courts,fixtures,rests};
}

export function teamAmericanoStandings(state) {
    const individual=americanoStandings(state);
    return state.teams.map(team=>({...individual.find(row=>row.id===team.players[0]),id:team.id,name:team.name})).sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name)).map((row,_,rows)=>({...row,position:1+rows.findIndex(p=>p.points===row.points&&p.points-p.against===row.points-row.against&&p.won===row.won)}));
}
