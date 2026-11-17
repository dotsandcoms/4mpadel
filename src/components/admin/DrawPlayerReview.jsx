import { ArrowUp, ArrowDown } from 'lucide-react';
import { dedupePairRegistrations, groupPairRegistrations, pairRegistrations } from '../../utils/drawPairing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../supabaseClient';
import { registrationIssues, reviewFingerprint } from '../../utils/drawPlayerReview';
import DrawActionDialog from './DrawActionDialog';

const teamLabel = registration => [registration.full_name, registration.partner_name].filter(Boolean).join(' / ');
const paymentSummary = members => {
    const statuses = members.map(member => member.payment_status || 'Unknown');
    return statuses.every(status => status === statuses[0])
        ? `Entry payment: ${statuses[0]}`
        : `Entry payments: ${members.map((member, index) => `${member.full_name}: ${statuses[index]}`).join(' · ')}`;
};

export default function DrawPlayerReview({ event, division, registrations, players, entries, rankingControls, workflowConfig, review, locked, sandboxTesting = false, onExpandTestCount, onConfirm, format = 'knockout' }) {
    const individualFormat = format === 'americano';
    const rows = useMemo(() => registrations.filter(row => row.status?.toLowerCase() !== 'withdrawn'), [registrations]);
    const groups = useMemo(() => individualFormat
        ? rows.map(registration => ({ registration, members: [registration] }))
        : groupPairRegistrations(rows), [individualFormat, rows]);
    const groupById = useMemo(() => new Map(groups.flatMap(group => group.members.map(member => [member.id, group]))), [groups]);
    const entryById = useMemo(() => new Map(entries.map(entry => [entry.source_registration_id, entry])), [entries]);
    const entriesFor = useCallback(selectedRows => dedupePairRegistrations(selectedRows, { keepStandalonePlayers: individualFormat })
        .map(registration => entryById.get(registration.id)).filter(Boolean), [entryById, individualFormat]);
    const candidates = useMemo(() => entriesFor(rows), [entriesFor, rows]);
    const needsPairing = !individualFormat && candidates.every(entry => !entry.player_two_name);
    const countMultiplier = needsPairing ? 2 : 1;
    const listUnit = individualFormat ? 'players' : needsPairing ? 'team members' : 'teams';
    const maximumCount = Math.floor((onExpandTestCount ? 256 : candidates.length) / countMultiplier);
    const [exceptions,setExceptions]=useState(review?.exceptions||{});
    const [excluded,setExcluded]=useState(review?.excluded||[]);
    const [seeds,setSeeds]=useState(review?.seeds||[]);
    const [testCount,setTestCount]=useState(() => String(Math.floor(entriesFor(rows.filter(row => !review?.excluded?.includes(row.id))).length / countMultiplier)));
    const [pendingCount,setPendingCount]=useState(null);
    const [pairOrder,setPairOrder]=useState(review?.pairs?.flat()?.length?review.pairs.flat():needsPairing?candidates.filter(e=>!review?.excluded?.includes(e.source_registration_id)).map(e=>e.source_registration_id):[]);
    const [busy,setBusy]=useState(false);
    const [error,setError]=useState('');
    const [errorPopup,setErrorPopup]=useState(null);
    const [showAllPlayers,setShowAllPlayers]=useState(false);
    const [showAllSeeds,setShowAllSeeds]=useState(false);
    const individual = candidates.every(entry => !entry.player_two_name);
    const pairingEnabled = individual && !individualFormat && (needsPairing || pairOrder.length>0);
    const excludedIds = new Set(excluded);
    const included = rows.filter(row => !excludedIds.has(row.id));
    const includedIds = included.map(row => row.id);
    const currentPairOrder=[...pairOrder.filter(id=>includedIds.includes(id)),...includedIds.filter(id=>!pairOrder.includes(id))];
    const pairs=pairingEnabled ? Array.from({length:Math.ceil(currentPairOrder.length/2)},(_,i)=>currentPairOrder.slice(i*2,i*2+2)) : [];
    const seedEntries=pairingEnabled ? pairs.map(([a,b])=>{const one=entryById.get(a),two=entryById.get(b);return one?{...one,team_name:`${one.team_name} / ${two?.team_name||'Choose partner'}`,seeding_value:Number(one.seeding_value||0)+Number(two?.seeding_value||0)}:null;}).filter(Boolean):entriesFor(included);
    const ranked = seedEntries.sort((a,b) => Number(b.seeding_value||0) - Number(a.seeding_value||0) || a.team_name.localeCompare(b.team_name));
    const rankedById = new Map(ranked.map(entry => [entry.source_registration_id, entry]));
    const activeSeedIds = new Map(ranked.flatMap(entry => {
        const id = entry.source_registration_id;
        return (groupById.get(id)?.members || []).map(member => [member.id, id]);
    }));
    const order = [...new Set([...seeds.map(id => activeSeedIds.get(id)).filter(Boolean), ...rankedById.keys()])];
    const ordered = order.map(id => rankedById.get(id));
    const issuesById = useMemo(() => new Map(rows.map(row => [row.id, registrationIssues(row, players, event)])), [event, players, rows]);
    const unresolved = included.filter(row => issuesById.get(row.id).length && !exceptions[row.id]?.trim());
    const reviewRows = groups.map(group => {
        const activeMembers = group.members.filter(member => !excludedIds.has(member.id));
        return {
            ...group,
            isIncluded: activeMembers.length > 0,
            checkedMembers: activeMembers.length ? activeMembers : group.members,
        };
    });
    const includedTeams = reviewRows.filter(row => row.isIncluded).length;
    const setGroupIncluded = (group, selected) => {
        const members = new Set(group.members.map(member => member.id));
        setExcluded(current => selected ? current.filter(id => !members.has(id)) : [...new Set([...current, ...members])]);
    };
    const countValid = Number.isInteger(Number(testCount)) && Number(testCount)>=2 && Number(testCount)<=maximumCount;
    const selectTestCount = useCallback(count => {
        const selected = [...candidates].sort((a,b)=>Number(b.seeding_value||0)-Number(a.seeding_value||0)||a.team_name.localeCompare(b.team_name,undefined,{numeric:true})).slice(0, count);
        const ids = new Set(selected.flatMap(entry => groupById.get(entry.source_registration_id).members.map(member => member.id)));
        setExcluded(rows.filter(row => !ids.has(row.id)).map(row => row.id));
        setSeeds(selected.map(entry => entry.source_registration_id));
    }, [candidates, groupById, rows]);
    const applyTestCount = async () => {
        if (!countValid) return;
        const count = Number(testCount) * countMultiplier;
        if(count>candidates.length && onExpandTestCount){setBusy(true);setError('');try{await onExpandTestCount(division.id,count);setPendingCount(count);}catch(e){setError(e.message);}finally{setBusy(false);}return;}
        selectTestCount(count);
        setError('');
    };
    useEffect(()=>{
        if (!pendingCount || candidates.length < pendingCount) return;
        selectTestCount(pendingCount);
        setPendingCount(null);
    }, [pendingCount, candidates.length, selectTestCount]);
    const moveSeed = (from, to) => {
        if (locked || busy || to < 0 || to >= order.length || from === to) return;
        const next = [...order];
        const [id] = next.splice(from, 1);
        next.splice(to, 0, id);
        setSeeds(next);
    };
    const input='rounded-lg border border-white/20 bg-[#151515] p-2 text-white focus-visible:outline-sky-300';
    const exportList=(seeded)=>{
        const pdf=new jsPDF(); let y=20;
        const heading=()=>{pdf.setFontSize(17);pdf.text(seeded?'Seed order':'Player list',14,20);pdf.setFontSize(10);pdf.text(`${event.title||event.event_name||'Event'} / ${division.name}`,14,29);pdf.text(review?.confirmed_at ? `Last confirmed: ${new Date(review.confirmed_at).toLocaleString('en-ZA')}`:'Working copy - not confirmed',14,36);y=46;};
        heading();
        const lines = seeded ? ordered.map((entry, i) => `${i+1}. ${entry.team_name} | Ranking points: ${entry.seeding_value||0}`) : reviewRows.flatMap(row => {
            const issues = [...new Set(row.checkedMembers.flatMap(member => issuesById.get(member.id).filter(issue => issue !== 'Entry payment outstanding')))];
            return [
                `${row.isIncluded ? 'Included' : 'Excluded'}: ${teamLabel(row.registration)}`,
                `${paymentSummary(row.checkedMembers)} | ${issues.join('; ') || 'Licences verified'}`,
                ...row.checkedMembers.filter(member => exceptions[member.id]?.trim())
                    .map(member => `Exception for ${member.full_name}: ${exceptions[member.id].trim()}`),
            ];
        });
        for(const line of lines){if((line.startsWith('Included:')||line.startsWith('Excluded:'))&&y>252){pdf.addPage();heading();}for(const part of pdf.splitTextToSize(line,180)){if(y>276){pdf.addPage();heading();}pdf.text(part,14,y);y+=6;}y+=2;}
        for(let page=1;page<=pdf.getNumberOfPages();page++){pdf.setPage(page);pdf.text(`Page ${page} of ${pdf.getNumberOfPages()}`,170,289);}
        pdf.save(`${division.name}-${seeded?'seedings':'players'}.pdf`);
    };
    const showConfirmationError = message => {
        const text = message || 'Could not confirm teams and seeds. Please try again.';
        setError(text);
        setErrorPopup({ message: text, checks: unresolved.map(row => ({ id: row.id, name: [row.full_name, row.partner_name].filter(Boolean).join(' / '), issues: registrationIssues(row, players, event) })) });
    };
    const confirm=async()=>{
        if(!included.length){showConfirmationError('Include players before confirming teams and seeds.');return;}
        if(unresolved.length){showConfirmationError('Record an exception reason for each outstanding check, or exclude the registration from this draw.');return;}
        if(pairingEnabled){try{pairRegistrations(included,pairs);}catch(e){showConfirmationError(e.message);return;}}
        setBusy(true);setError('');
        try{const {data:{user},error:authError}=await supabase.auth.getUser();if(authError)throw authError;
            const latest = await supabase.from('draw_player_reviews').select('state').eq('division_id',division.id).maybeSingle(); if(latest.error)throw latest.error;
            const state={workflow:{...latest.data?.state?.workflow,...workflowConfig,format},pairs,exceptions:Object.fromEntries(Object.entries(exceptions).filter(([id,reason])=>includedIds.includes(id)&&reason.trim())),excluded,seeds:order,fingerprint:reviewFingerprint(rows,players,event),confirmed_at:new Date().toISOString(),confirmed_by:user.id};
            const {error}=await supabase.from('draw_player_reviews').upsert({division_id:division.id,event_id:event.id,state,confirmed_by:user.id,updated_at:state.confirmed_at});if(error)throw error;
            onConfirm(state);
        }catch(e){showConfirmationError(e.message);}finally{setBusy(false);}
    };
    return <section className="space-y-5 rounded-2xl border border-white/15 bg-[#101010] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-white">Review {individualFormat?'players':'teams'} & seedings</h2><p className="mt-2 text-sm text-gray-400">Check entry payments and both players’ licences. Record a reason to approve an exception, or exclude the registration from this draw.</p></div><details className="text-sm text-gray-300"><summary className="cursor-pointer py-2">Export PDFs</summary><div className="mt-2 flex flex-wrap gap-2"><button onClick={()=>exportList(false)} className={input}>{individualFormat?'Player list PDF':'Team members PDF'}</button><button onClick={()=>exportList(true)} className={input}>Seedings PDF</button></div></details></div>
        {sandboxTesting && <fieldset disabled={busy||locked} className="rounded-xl border border-sky-300/40 bg-sky-300/10 p-4"><legend className="px-2 font-bold text-sky-200">Test draw size</legend><div className="flex flex-wrap items-end gap-3"><label className="text-sm text-gray-200">{individualFormat?'Number of individual players':'Number of teams'}<input type="number" min="2" max={maximumCount} step="1" value={testCount} onChange={e=>setTestCount(e.target.value)} className={`${input} mt-2 block w-32`} /></label><button type="button" disabled={!countValid} onClick={applyTestCount} className="rounded-lg bg-sky-300 px-4 py-2 font-bold text-black disabled:opacity-40">Apply test count</button><span className="pb-2 text-sm text-sky-100">{countValid ? (individualFormat ? `${testCount} individual players` : `${testCount} teams · ${Number(testCount)*2} players`) : `Choose a valid ${individualFormat?'player':'team'} count`}</span></div><p className="mt-3 text-xs leading-5 text-gray-300">Choose 2–{maximumCount} {individualFormat?'players':'teams'} for this division. Extra sample entries are created when needed. Applying the count includes that many {individualFormat?'players':'teams'}{needsPairing?' (two players per team)':''} and excludes the rest; you can still adjust the list below. Confirm players and seeds, then generate a new preview.</p>{locked&&<p className="mt-2 text-sm text-amber-200">This draw is published. Reopen it before changing its test size.</p>}</fieldset>}
        {error&&<p role="alert" className="rounded-lg bg-red-300/10 p-3 text-red-200">{error}</p>}
        <p className="text-sm text-sky-200">{individualFormat?`${included.length} individual players`:needsPairing?`${Math.floor(included.length/2)} teams · ${included.length} players`:`${includedTeams} teams`} included · {unresolved.length} checks need an exception</p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sky-300/10 p-3">
            <p className="text-sm text-sky-100">Showing {showAllPlayers?reviewRows.length:Math.min(6,reviewRows.length)} of {reviewRows.length} {listUnit}</p>
            {reviewRows.length>6&&<button type="button" aria-expanded={showAllPlayers} aria-controls="draw-player-list" onClick={()=>setShowAllPlayers(value=>!value)} className="rounded-lg bg-sky-300 px-4 py-2 text-sm font-bold text-black">{showAllPlayers?`Show fewer ${listUnit}`:`Show all ${reviewRows.length} ${listUnit} ↓`}</button>}
        </div>
        <fieldset id="draw-player-list" disabled={busy||locked} className="space-y-3">
            {(showAllPlayers ? reviewRows : reviewRows.slice(0, 6)).map(row => {
                const needsCheck = row.checkedMembers.filter(member => issuesById.get(member.id).length);
                return <div key={row.registration.id} className="grid gap-3 rounded-lg border border-white/10 p-3 md:grid-cols-2">
                    <label className="text-sm text-white">
                        <input type="checkbox" checked={row.isIncluded} onChange={event => setGroupIncluded(row, event.target.checked)} /> {teamLabel(row.registration)}
                        <span className="mt-2 block text-xs text-gray-400">{paymentSummary(row.checkedMembers)}</span>
                    </label>
                    <div className="space-y-2 text-xs">
                        {needsCheck.length === 0 && <p className="text-emerald-200">Payment and licences verified</p>}
                        {needsCheck.map(member => <div key={member.id}>
                            <p className="text-amber-200">{issuesById.get(member.id).join(' · ')}</p>
                            <label className="mt-2 block text-gray-300">
                                {row.members.length > 1 ? `Exception reason for ${member.full_name}` : 'Exception reason'}
                                <input className={`${input} mt-1 w-full`} value={exceptions[member.id] || ''}
                                    onChange={event => setExceptions(current => ({ ...current, [member.id]: event.target.value }))}
                                    placeholder="Why this player may participate" />
                            </label>
                        </div>)}
                    </div>
                </div>;
            })}
        </fieldset>
        {individual && !individualFormat&&<div className="rounded-xl border border-sky-300/40 bg-sky-300/10 p-4"><h3 className="font-bold text-sky-200">Team members</h3><p className="mt-2 text-sm text-gray-300">Each team has two players. Review the pairings below and swap players as needed. Both players retain their registration and eligibility checks.</p>{pairingEnabled&&<><p className="my-3 text-sm text-gray-300">{included.length} players → {Math.floor(included.length/2)} teams. Change a player below to swap their position.</p>{included.length%2!==0&&<p role="alert" className="text-amber-200">An even number of players is required. Include or exclude a player above.</p>}<fieldset disabled={locked||busy} className="space-y-3">{pairs.map((pair,i)=><div key={i} className="flex flex-wrap items-center gap-3"><span className="text-sm text-sky-200">Team {i+1}</span>{pair.map((id,j)=><select key={j} aria-label={`Team ${i+1} player ${j+1}`} value={id} className={`${input} max-w-full`} onChange={e=>{const next=[...currentPairOrder];const index=i*2+j;const other=next.indexOf(e.target.value);[next[index],next[other]]=[next[other],next[index]];setPairOrder(next);setSeeds([]);}}>{included.map(r=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select>)}</div>)}</fieldset></>}</div>}
        <details className="rounded-lg border border-white/10 p-4"><summary className="cursor-pointer text-sm font-semibold text-gray-300">Ranking source & seed protection</summary><div className="mt-4">{rankingControls}</div></details>
        <details className="rounded-xl border border-white/15 p-4"><summary className="font-bold text-sky-200">Seed order · {ordered.length} {individualFormat?'players':'teams'}</summary><p className="my-3 text-xs text-gray-400">Use the up/down arrows to move one position, or select a position to move further. Teams in between shift automatically. Confirm to save the new order. Individual Americano uses a partner rotation rather than knockout seeds.</p><div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sky-300/10 p-3">
            <p className="text-sm text-sky-100">Showing {showAllSeeds?ordered.length:Math.min(8,ordered.length)} of {ordered.length} seedings</p>
            {ordered.length>8&&<button type="button" aria-expanded={showAllSeeds} aria-controls="draw-seed-list" onClick={()=>setShowAllSeeds(value=>!value)} className="rounded-lg bg-sky-300 px-4 py-2 text-sm font-bold text-black">{showAllSeeds?'Show fewer seedings':`Show all ${ordered.length} seedings ↓`}</button>}
        </div><fieldset id="draw-seed-list" disabled={busy||locked} className="space-y-2">{(showAllSeeds?ordered:ordered.slice(0,8)).map((e,i)=><div key={e.source_registration_id} className="flex items-center gap-3 rounded-lg border border-white/10 p-2 text-sm text-white"><select aria-label={`Seed for ${e.team_name}`} className={`${input} shrink-0`} value={i} onChange={event=>moveSeed(i,Number(event.target.value))}>{order.map((_,index)=><option key={index} value={index}>{index+1}</option>)}</select><span className="min-w-0 flex-1">{e.team_name}<span className="ml-2 text-xs text-gray-400">{e.seeding_value||0} points</span></span><div className="flex shrink-0 gap-1"><button type="button" aria-label={`Move ${e.team_name} up`} title="Move up one seed" disabled={i===0} onClick={()=>moveSeed(i,i-1)} className="rounded-lg border border-sky-300/40 bg-sky-300/10 p-2 text-sky-200 hover:bg-sky-300/20 disabled:opacity-25"><ArrowUp size={18}/></button><button type="button" aria-label={`Move ${e.team_name} down`} title="Move down one seed" disabled={i===order.length-1} onClick={()=>moveSeed(i,i+1)} className="rounded-lg border border-sky-300/40 bg-sky-300/10 p-2 text-sky-200 hover:bg-sky-300/20 disabled:opacity-25"><ArrowDown size={18}/></button></div></div>)}</fieldset></details>
        {!locked&&<button disabled={busy} onClick={confirm} className="rounded-xl bg-padel-green px-5 py-3 font-bold text-black disabled:opacity-40">{busy?'Saving confirmation…':`Confirm ${individualFormat?'players':'teams'} & continue →`}</button>}
        {locked&&<p className="text-sm text-gray-400">Published entrants are locked. These lists remain available to print.</p>}
        <DrawActionDialog open={Boolean(errorPopup)} title={`${individualFormat?'Players':'Teams'} & seeds not confirmed`} alert onClose={()=>setErrorPopup(null)}>
            <p className="rounded-lg bg-red-300/10 p-3 text-sm leading-6 text-red-200">{errorPopup?.message}</p>
            {errorPopup?.checks.length > 0 && <div className="max-h-60 space-y-3 overflow-y-auto"><p className="text-sm font-bold text-white">{errorPopup.checks.length} {errorPopup.checks.length===1?'registration needs':'registrations need'} attention</p>{errorPopup.checks.map(row=><div key={row.id} className="rounded-lg border border-white/15 p-3"><p className="text-sm font-semibold text-white">{row.name}</p><p className="mt-1 text-xs leading-5 text-amber-200">{row.issues.join(' · ')}</p></div>)}</div>}
            <button type="button" onClick={()=>setErrorPopup(null)} className="w-full rounded-lg bg-padel-green px-4 py-3 font-bold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Back to players & seedings</button>
        </DrawActionDialog>
    </section>;
}
