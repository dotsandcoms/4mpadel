import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = process.cwd();
const fixtureDir = await mkdtemp(path.join(tmpdir(), '4m-design-events-'));
const output = path.join(fixtureDir, 'fixture.js');
let browser;

before(async () => {
    await build({
        stdin: { contents: `
            import React, { useState } from 'react';
            import { createRoot } from 'react-dom/client';
            import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
            import EventDrawWorkspace from './src/pages/admin-preview/EventDrawWorkspace.jsx';
            import EventManagerDashboard from './src/pages/admin-preview/EventManagerDashboard.jsx';
            import EventEntryForm, { EventEntryPaymentLinks } from './src/pages/admin-preview/EventEntryForm.jsx';
            import EventReplacementDialog from './src/pages/admin-preview/EventReplacementDialog.jsx';
            import EventPaymentDialog from './src/pages/admin-preview/EventPaymentDialog.jsx';
            import EventRehearsal from './src/pages/admin-preview/EventRehearsal.jsx';
            import NativeDrawOperationsDialog from './src/pages/admin-preview/NativeDrawOperationsDialog.jsx';
            import EventGroupDrawDialog from './src/pages/admin-preview/EventGroupDrawDialog.jsx';
            import TournamentWorkspace from './src/pages/admin-preview/tournament/TournamentWorkspace.jsx';
            import CalendarWorkspace from './src/pages/admin-preview/CalendarWorkspace.jsx';
            import EventBuilder from './src/components/admin/EventBuilder.jsx';
            import QuickEventBuilder from './src/components/admin/QuickEventBuilder.jsx';
            import './src/pages/AdminPreview.css';
            const session = { user: { id: 'fixture-user', email: 'owner@example.invalid' } };
            const event = { id: 11, organisation_id: 'org-a', event_name: 'Silver Open', slug: 'silver-open', sapa_status:'Silver', finance_managed:true, is_manual:true, is_visible:true, payment_method:'platform', start_date:'2035-01-21' };
            const bronze = { ...event, id:12, event_name:'Bronze Open', sapa_status:'Bronze' };
            const other = { ...event, id:13, organisation_id:'org-b', event_name:'Other Open' };
            const search = async () => [{ id: 31, name: 'New Player', email:'new@example.invalid' }];
            const registration = { id:'reg-1', full_name:'Previous Player', event_id:11, email:'old@example.invalid', division:'Open' };
            const paid = { ...registration, payment_status:'paid', status:'registered', payment_method:'eft' };
            const receipt = { id:'receipt-1', event_id:11, payment_type:'event_entry_fee', status:'success', payment_method:'eft', amount:700,
                reference:'MANUAL-ADMIN-reg-1', metadata:{ registration_id:'reg-1', source:'manual_event_admin', collection_recipient:'organiser', payment_note:'Original note' } };
            const division = { id: 51, name: 'Open', entry_fee:500, is_active:true };
            const groupRows = [{ id:'ga', name:'Group A' }, { id:'gb', name:'Group B' }].map((group,index)=>({
                ...group,entries:[0,1].map(offset=>({id:'team-'+(index*2+offset+1),team_name:'Team '+(index*2+offset+1),group_id: group.id,seed_number:index*2+offset+1}))
            }));
            const draw = { id:'draw-a', status:'draft', format:'group_only', updated_at:'draw-v1' };
            const groupSnapshot = { draw, groups:groupRows, entries:groupRows.flatMap(row=>row.entries), audit:[], matchSets:[],
                matches:groupRows.map((row, index)=>({id:'match-'+index,group_id:row.id,stage:'group',status:'pending',updated_at:'match-v1',round_number:1,round_label:'Group',round_code:'group',bracket_position:1,entry_one:row.entries[0],entry_two:row.entries[1]})) };

            const tournamentDraw = { ...draw, draw_kind:'main', division_id:51, format:'knockout', status:'published' };
            const booking = { court_name:'Court 1', scheduled_start:'2035-01-21T12:00:00Z', scheduled_end:'2035-01-21T13:00:00Z' };
            const tournamentMatch = { ...booking, id:'match-tm-1', draw_id:draw.id, stage:'knockout', status:'scheduled', updated_at:'match-v1', round_number:1, round_label:'Final', entry_one_id:'tm-1', entry_two_id:'tm-2' };
            const tournament = { event, divisions:[division,{ id:52, name:'Reserved Division', is_active:false }], draws:[tournamentDraw], matches:[tournamentMatch],
                entries:[{id:'tm-1',team_name:'First Pair'},{id:'tm-2',team_name:'Second Pair'}], registrations:[], players:[], sets:[], standings:[],
                playDays:[{play_date:'2035-01-21', start_time:'10:00', end_time:'19:00', courts_count:1, is_active:true}],
                settings:{}, confirmations:[], finalisations:[], audit:[], access:[], capabilities:['draws','schedule','results'],
                sourceFingerprint:'source-fingerprint', schedule:{revision:2, status:'draft', source_fingerprint:'source-fingerprint', assignments:{'match-tm-1':booking}} };
            const generatorEvent = { ...event, id:505, event_name:'Fixture Eastern Cape Open', slug:'fixture-eastern-cape' };
            const generatorDivision = { ...division, id:'fixture-open-division', name:'Men’s Open' };
            const generatorSecond = { ...division, id:'fixture-advanced-division', name:'Men’s Advanced' };
            const generator = { ...tournament, event:generatorEvent, divisions:[generatorDivision,generatorSecond],
                draws:[], matches:[], entries:[], schedule:null, settings:{},
                capabilities:['draws','players','seeds'],
                registrations:[
                  {id:'entry-one',division_id:generatorDivision.id,full_name:'One',email:'one@example.invalid',partner_name:'Two',partner_email:'two@example.invalid',payment_status:'paid',status:'registered'},
                  {id:'entry-two',division_id:generatorDivision.id,full_name:'Three',email:'three@example.invalid',partner_name:'Four',partner_email:'four@example.invalid',payment_status:'paid',status:'registered'},
                ],
                confirmations:[{division_id:generatorDivision.id, revision:7, players_confirmed_at:'checked', players_valid:true, format_confirmed_at:'checked', seeds_confirmed_at:'checked',
                    configuration:{format:'knockout',sets_to_win:1,seeded_team_count:2}, review:{excluded:[],exceptions:{},seeds:['entry-one','entry-two']}}],
            };
            const hostTournament = {
                ...structuredClone(generator), hostDrawPreparation:true, organisationId:'org-a',
                capabilities:['host_players_review','seeds','draws'],
                players:generator.registrations.flatMap(row => [row.email,row.partner_email].map(email=>({email,license_type:'full'}))),
                confirmations:[],
            };
            const pastLinked = { ...event, id:19, slug:'rankedin-past', is_manual:false, start_date:'2024-08-15', event_name:'Past Linked Cup', rankedin_id:'8901', rankedin_url:'https://www.rankedin.com/en/tournament/8901' };
            const failedLinked = { ...pastLinked, id:20, slug:'rankedin-failed', event_name:'Unavailable Cup', rankedin_id:'8902', rankedin_url:'https://www.rankedin.com/en/tournament/8902' };
            const manualLinked = { ...event, id:21, slug:'rankedin-manual', event_name:'Manual Linked Cup', rankedin_id:'8903', rankedin_url:'https://www.rankedin.com/en/tournament/8903' };
            const nativeDraw = { ...tournamentDraw, event_id:11, tournament_divisions:{name:'Open'} };
            const nativeMatch = { ...tournamentMatch, is_featured:false };
            const completedMatch = { ...nativeMatch, status:'completed', winner_entry_id:'tm-1', loser_entry_id:'tm-2', round_code:'final' };
            const linkedPlateMatches = [
                { ...completedMatch, id:'plate-first', entry_one_id:'plate-1', entry_two_id:'plate-2', winner_entry_id:'plate-1', bracket_position:1 },
                { ...completedMatch, id:'plate-second', entry_one_id:'plate-3', entry_two_id:'plate-4', winner_entry_id:'plate-3', bracket_position:2 },
            ];
            const linkedPlateEntries = [1,2,3,4].map(number=>({id:'plate-'+number,team_name:'Plate Team '+number,draw_id:draw.id,status:'active'}));
            const rankingEntries = [
                { ...tournament.entries[0], player_one_id:1, player_one_name:'Avery', player_two_id:2, player_two_name:'Morgan' },
                { ...tournament.entries[1], player_one_id:3, player_one_name:'Jordan', player_two_id:4, player_two_name:'Riley' },
            ];
            const courtMatches = [
                { ...nativeMatch, id:'court-a', stage:'group', round_label:'Group 1', round_number:1, bracket_position:1, status:'pending',
                    court_name:'Court 4', scheduled_start:null, scheduled_end:null },
                { ...nativeMatch, id:'court-b', stage:'group', round_label:'Group 2', round_number:1, bracket_position:2, status:'pending',
                    court_name:null, scheduled_start:null, scheduled_end:null },
                { ...nativeMatch, id:'draw-finished', status:'completed', court_name:null, scheduled_start:null, scheduled_end:null },
                { ...nativeMatch, id:'court-other', draw_id:'other-draw', court_name:null, scheduled_start:null, scheduled_end:null },
            ];
            const otherNativeDraw = { ...nativeDraw, id:'other-draw', event_id:13, tournament_divisions:{name:'Other org'} };
            const existingAnnouncement = { id:'announcement-1', event_id:11, division_id:51, draw_id:draw.id, message:'Use court entrance', updated_at:'notice-v1' };
            window.calls = [];
            const verifyAccess = async () => ({ event });
            const client = {
                auth:{ getUser: async () => ({ data:{ user:session.user } }) },
                rpc(name,args) {
                    window.calls.push([name,args]);
                    const request = (async()=>{
                    if (name==='admin_organisation_host_builder') {
                        if (window.kind==='host-native' || window.kind==='host-draw-complete') {
                            return {data:{organisation:{id:'org-a',status:'approved'},event_id:11}};
                        }
                        return {error:{message:'Current owner or admin access to the host organisation is required.'}};
                    }
                    if (name==='native_manage_organisation_draw') {
                        return {data:{organisation_id:args.p_organisation_id,event_id:args.p_event_id,draw_id:args.p_draw_id,
                            match_id:args.p_match_id,action:args.p_action,status:args.p_action==='complete'?'completed':'in_progress',featured:true}};
                    }
                    if (name==='native_enable_silver_plate') {
                        if (window.rejectSilverReview) return {error:{message:'The draw changed. Reopen it before enabling the Silver plate.'}};
                        window.silverEnabled=true;
                        nativeDraw.updated_at='draw-v2';
                        return {data:{id:nativeDraw.id,event_id:11,division_id:51,plate_mode:'double',updated_at:'draw-v2'}};
                    }
                    if (name==='native_create_linked_plate') return {data:{id:'plate-new',kind:window.kind==='special-bronze'?'bronze':'silver',created:true}};
                    if (name==='native_apply_court_schedule') return {data:args.p_bookings.length};
                    if (name==='native_save_event_play_days') return {data:args.p_days.length};
                    if (name==='remove_event_play_day') return {data:null};
                    if (name==='can_manage_event') return { data: args.p_event_id===11 };
                    if (name==='correct_manual_event_payment') return {data:{paymentId:receipt.id,method:args.p_method,recipient:args.p_recipient}};
                    if (name==='reopen_native_draw_for_corrections') { nativeDraw.status='draft'; return { data:null }; }
                    if (name==='account_is_active' || name==='is_super_admin') return { data:true };
                    if (name==='tm_host_draw_preparation') {
                        if (args.p_organisation!=='org-a' || String(args.p_event)!=='505') {
                            return {error:{message:'No access to this host event'}};
                        }
                        const fields=args.p_payload;
                        const receipt={organisationId:args.p_organisation,eventId:505,action:args.p_action,divisionId:fields.p_division};
                        if (args.p_action==='snapshot') {
                            if (window.hostInitialFailure) {
                                window.hostInitialFailure=false;
                                return {error:{message:'Draw snapshot temporarily unavailable'}};
                            }
                            return {data:structuredClone(hostTournament)};
                        }
                        if (args.p_action==='confirm') {
                            const c=hostTournament.confirmations[0] || {division_id:fields.p_division,revision:0};
                            if (c.revision!==fields.p_expected) return {error:{message:'Preparation changed elsewhere'}};
                            if (fields.p_kind==='players') Object.assign(c,{players_confirmed_at:'checked',players_valid:true,review:fields.p_payload});
                            if (fields.p_kind==='format_and_seeds') Object.assign(c,{format_confirmed_at:'checked',seeds_confirmed_at:'checked',
                                configuration:fields.p_payload.configuration,review:{...c.review,seeds:fields.p_payload.seeds}});
                            c.revision+=fields.p_kind==='format_and_seeds'?2:1;
                            hostTournament.confirmations=[c];
                            return {data:receipt};
                        }
                        if (args.p_action==='save_draw') {
                            hostTournament.draws=[{id:'saved-host-draft',event_id:505,division_id:fields.p_division,format:fields.p_draw.format,
                                status:'draft',draw_kind:'main',updated_at:'saved-at',_review_token:'host-token-v1'}];
                            hostTournament.entries=fields.p_draw.entries.map(entry=>({...entry,draw_id:'saved-host-draft'}));
                            hostTournament.matches=fields.p_draw.matches.map(match=>({...match,draw_id:'saved-host-draft'}));
                            return {data:{...receipt,drawId:'saved-host-draft'}};
                        }
                        if (args.p_action==='publish_draw') {
                            if (window.hostStale) {
                                window.hostStale=false;
                                hostTournament.draws[0]._review_token='host-token-v2';
                                return {error:{message:'The saved draw changed. Reload and review the draft again'}};
                            }
                            hostTournament.draws[0].status='published';
                            return {data:{...receipt,drawId:'saved-host-draft'}};
                        }
                    }
                    if (name==='tm_snapshot') {
                        if (args.p_event === '505') return { data: generator };
                        return args.p_event === '11' ? { data: tournament } : { error: { message:'No access to this tournament' } };
                    }
                    if (name==='tm_save_draw') {
                        generator.draws=[{id:'saved-test-draw',event_id:505,division_id:args.p_division,format:args.p_draw.format,status:'draft',draw_kind:'main',updated_at:'saved'}];
                        generator.entries=args.p_draw.entries.map(entry=>({...entry,draw_id:'saved-test-draw'}));
                        generator.matches=args.p_draw.matches.map(match=>({...match,draw_id:'saved-test-draw'}));
                        return {data:'saved-test-draw'};
                    }
                    if (name==='tm_publish_schedule') { tournament.schedule.status = 'published'; return { data:true }; }
                    if (name==='tm_record_result') return { data:true };
                    if (name==='replace_registration_player') return { data:{ registration_id:'reg-1',new_email:'new@example.invalid',new_name:'New Player' } };
                    if (name==='private_draw_rehearsal_snapshot') return { data:{ version:1, owner_id:session.user.id, event } };
                    return { data:0 };
                    })();
                    request.abortSignal=()=>request;
                    return request;
                },
                from(table) {
                    let rows=table==='calendar'?(window.kind.startsWith('rankedin-')?[pastLinked,failedLinked,manualLinked]:[event,bronze,other]):[];
                    if (table==='federations') rows=[{slug:'sapa',rankedin_events_org_id:'11331'}];
                    if (table==='draws') rows=[nativeDraw,otherNativeDraw];
                    if (table==='event_registrations' && window.kind.startsWith('payment-')) rows=[paid];
                    if (table==='payments' && window.kind.startsWith('payment-')) rows=[window.kind==='payment-stale' ? {...receipt, payment_method:'cash'} : receipt];
                    if (table==='draw_matches') rows=window.kind.startsWith('court-bulk') ? courtMatches : [nativeMatch];
                    if (window.kind==='draw-ranking' && table==='draws') { nativeDraw.status='completed'; }
                    if (['draw-ranking','draw-complete','host-draw-complete'].includes(window.kind) && table==='draw_matches') rows=[window.changeResultRevision ? { ...completedMatch, updated_at:'match-v2' } : completedMatch];
                    if (table==='tournament_divisions') rows=[{id:51,event_id:11,ranking_tier_id:'tier-a',ranking_category:1}];
                    if (table==='ranking_tiers') rows=[{id:'tier-a',code:'silver',name:'Silver'}];
                    if (table==='ranking_points_table') rows=[
                        {id:'rule-winner',tier_id:'tier-a',category:1,round_code:'winner',round_label:'Winner',points:window.changeRankingRule?120:100},
                        {id:'rule-finalist',tier_id:'tier-a',category:1,round_code:'finalist',round_label:'Finalist',points:65},
                    ];
                    if (table==='player_ranking_points') rows=[{id:'already-recorded',event_id:11,division_id:51,player_id:1}];
                    if (table==='event_play_days') rows=[{event_id:11,play_date:'2035-01-21',match_duration_minutes:45,is_active:true}];
                    if (table==='draw_entries') rows=(window.kind==='draw-ranking'?rankingEntries:tournament.entries).map(row=>({...row,draw_id:draw.id}));
                    if (window.kind.startsWith('special-') && table==='draws') {
                        if (window.kind==='special-days' || window.kind==='special-division' || window.kind==='special-remove') rows=[];
                        else {
                            nativeDraw.scoring_rules=window.kind.startsWith('special-enable') ? {plate_mode:window.silverEnabled?'double':'none'} : {plate_mode:'triple'};
                            nativeDraw.draw_kind=window.kind==='special-bronze'?'silver':'main';
                        }
                    }
                    if (window.kind==='special-automatic' && table==='draw_matches') rows=courtMatches.map(row=>({...row,court_name:null}));
                    if (['special-silver','special-bronze','special-enable-silver'].includes(window.kind) && table==='draw_matches') rows=linkedPlateMatches;
                    if (['special-silver','special-bronze','special-enable-silver'].includes(window.kind) && table==='draw_entries') rows=linkedPlateEntries;
                    if (window.kind.startsWith('special-') && table==='event_play_days') rows=[
                        { id:501,event_id:11,play_date:'2035-01-21',start_time:'08:00',end_time:'18:00',courts_count:1,
                          match_duration_minutes:45,minimum_break_minutes:10,is_active:true,updated_at:'day-v1' },
                    ];
                    if (window.kind.startsWith('special-') && table==='tournament_divisions') rows=[
                        {id:51,event_id:11,name:'Open',is_active:true}, {id:52,event_id:13,name:'Other Event Open',is_active:true},
                    ];
                    if (window.kind.startsWith('special-') && table==='draw_player_reviews') rows=[
                        {division_id:51,event_id:11,updated_at:'review-v1',state:{fingerprint:'retain-fingerprint',workflow:{format:'knockout', ...(window.kind==='special-automatic'?{schedule_days:{'2035-01-21':{start_time:'10:00',rounds:2}}}:{})}}},
                    ];
                    if (table==='native_draw_announcements') rows=[existingAnnouncement, {...existingAnnouncement,id:'other-announcement',event_id:13,message:'Other announcement'}];
                    let bounds=null;
                    let write=null;
                    const filters={};
                    const query={select(){return query;},order(){return query;},eq(key,value){filters[key]=value;rows=rows.filter(r=>r[key]===value);return query;},
                        is(key,value){return query.eq(key,value);},
                        in(key,values){rows=rows.filter(r=>values.includes(r[key]));return query;},
                        range(start,end){bounds=[start,end];return query;},abortSignal(){return query;},limit(max){rows=rows.slice(0,max);return query;},
                        single(){
                            if(write && rows[0]){
                                if(window.failSecondCourt && table==='draw_matches' && rows[0].id==='court-b') return Promise.resolve({ error:{message:'Changed by another operator'} });
                                window.calls.push([write.kind,table,filters,write.fields]);
                                if(write.kind==='update') Object.assign(rows[0],write.fields);
                            }
                            return Promise.resolve({data:rows[0]});
                        },maybeSingle(){return query.single();},
                        update(fields){write={kind:'update',fields};return query;},delete(){write={kind:'delete'};return query;},
                        insert(payload){window.calls.push(['insert',table,payload]);
                            rows=table==='player_ranking_points' ? payload.map(row=>({id:'award-'+row.player_id,player_id:row.player_id})) : [{id:99}];
                            return query;},
                        upsert(payload){window.calls.push(['upsert',table,payload]);return Promise.resolve({data:[]});},
                        then(resolve){return Promise.resolve({data:bounds?rows.slice(bounds[0],bounds[1]+1):rows}).then(resolve);} };
                    return query;
                }
            };
            function Editor({ onClose }) {
                return <section role="dialog" aria-label="Synthetic quick event editor"><button onClick={()=>onClose({refresh:false})}>Close quick editor</button></section>;
            }
            function CalendarFixture() {
              const route=useLocation();
              return <><output data-query={route.search} /><CalendarWorkspace session={session} client={client}
                scope={{id:'org:org-a'}} permissions={{role:'org_owner',orgs:[{id:'org-a',member_role:'owner'}]}}
                scopeId="org:org-a" canManageEvents QuickCreationDialog={Editor} /></>;
            }
            function GeneratorFixture() {
                const { pathname, search } = useLocation();
                const go = useNavigate();
                const open = (division, workspace) => {
                    const params = new URLSearchParams({event:generatorEvent.id,workspace});
                    if(division?.id) params.set('division',division.id);
                    go('/admin-preview/tournaments?'+params);
                };
                return <><output data-query={search}/>{pathname.endsWith('/event') ?
                    <EventDrawWorkspace event={generatorEvent} divisions={generator.divisions} draws={[]} registrationCount={d=>generator.registrations.filter(r=>r.division_id===d.id).length}
                        tournamentWorkspaces={generator.capabilities} onOpenTournament={open} onDrawDetails={()=>{}} /> :
                    <TournamentWorkspace client={client} session={session} scopeId="all" />}</>;
            }
            function HostGeneratorFixture() {
                const { search } = useLocation();
                const go = useNavigate();
                const params = new URLSearchParams(search);
                const hostDraw = params.get('action')==='host-draw';
                const eventPath = '/admin-preview/event?event=505&tab=draws';
                function open(division, workspace) {
                    const next = new URLSearchParams({event:'505',tab:'draws',action:'host-draw',workspace});
                    if (division?.id) next.set('division',division.id);
                    go('/admin-preview/event?'+next);
                }
                return <><output data-query={search}/>{hostDraw ?
                    <TournamentWorkspace client={client} session={session} scopeId="org:org-a" returnHref={eventPath}
                        hostEvent={{id:505,organisationId:'org-a'}} /> :
                    <EventDrawWorkspace event={generatorEvent} divisions={generator.divisions} draws={hostTournament.draws}
                        registrationCount={d=>hostTournament.registrations.filter(r=>r.division_id===d.id).length}
                        tournamentWorkspaces={['draws']} onOpenTournament={open} onDrawDetails={()=>{}} />}</>;
            }
            function Fixture({ kind }) {
                const [added,setAdded]=useState(null);
                if (kind.startsWith('tournament-')) {
                    const route = { 'tournament-draw':'?event=11&workspace=draws&division=52', 'tournament-other':'?event=13&workspace=results',
                        'tournament-schedule':'?event=11&workspace=schedule', 'tournament-result':'?event=11&workspace=results' }[kind];
                    return <MemoryRouter initialEntries={['/admin-preview/tournaments'+route]}><TournamentWorkspace client={client} session={session} scopeId="all" /></MemoryRouter>;
                }
                if (kind.startsWith('payment-')) return <EventPaymentDialog action={{ type:'correct', registration:{...paid, _editablePayment:receipt} }} client={client} session={session}
                    event={event} divisions={[division]} scopeId={kind==='payment-tenant'?'org:org-a':'all'} onClose={result=>window.calls.push(['closed',result])}/>;
                if (kind==='host-tournament-generator') return <MemoryRouter initialEntries={['/admin-preview/event?event=505&tab=draws']}><HostGeneratorFixture /></MemoryRouter>;
                if (kind==='draw-generator') return <MemoryRouter initialEntries={['/admin-preview/event?event=505']}><GeneratorFixture /></MemoryRouter>;
                if (kind.startsWith('public-draw-')) return <EventDrawWorkspace event={event} divisions={[division]}
                    draws={[kind==='public-draw-live'?nativeDraw:{...nativeDraw,status:'draft'},otherNativeDraw]}
                    registrationCount={()=>4} onDrawDetails={()=>{}} />;
                if (kind==='native-draw' || kind.startsWith('special-') || kind.startsWith('court-') || kind.startsWith('host-') || ['draw-complete','draw-ranking'].includes(kind)) return <NativeDrawOperationsDialog client={client} session={session} event={kind==='host-foreign'?other:event}
                    scopeId={kind.startsWith('host-')||['court-tenant','special-enable-silver-tenant'].includes(kind)?'org:org-a':'all'} onClose={()=>window.calls.push(['closed'])} />;
                if (kind.startsWith('rankedin-')) return <MemoryRouter><CalendarWorkspace session={session} client={client}
                  scope={{id:'all'}} permissions={{role:'super_admin'}} scopeId="all" canManageEvents /></MemoryRouter>;
                if (kind==='calendar') return <MemoryRouter initialEntries={['/?create=quick&keep=1']}><CalendarFixture /></MemoryRouter>;
                if (kind==='dashboard') return <EventManagerDashboard events={[event,bronze,other]} registrations={[]} go={()=>{}} client={client} canReadSnapshots session={session} />;
                if (kind==='replace') return <EventReplacementDialog client={client} session={session} scopeId="org:org-a" event={event} team={[registration]} search={search} verifyAccess={verifyAccess} onClose={()=>window.calls.push(['closed'])}/>;
                if (kind==='group') return <EventGroupDrawDialog client={client} session={session} scopeId="org:org-a" event={event} division={division}
                    draw={draw} load={async ()=>groupSnapshot} verifyAccess={verifyAccess} onClose={()=>window.calls.push(['closed'])}/>;
                if (kind==='rehearsal') return <EventRehearsal client={client} session={session} event={event} onClose={()=>window.calls.push(['closed'])}/>;
                if (kind==='full-builder') return <EventBuilder isOpen theme="preview" onClose={()=>{}} beforeSave={async context=>{window.calls.push([context.operation]);return false;}}/>;
                if (kind==='quick-builder') return <QuickEventBuilder isOpen theme="preview" onClose={()=>{}} beforeSave={async context=>{window.calls.push([context.operation]);return false;}}/>;
                return added ? <EventEntryPaymentLinks links={added.links} /> : <EventEntryForm event={event} divisions={[division]} search={search}
                    save={async draft=>{window.calls.push(['entry',draft]);return{registrations:[{id:'reg-new',pay_token:'fake-token'}]};}} onReview={setAdded}/>;
            }
            const root=createRoot(document.getElementById('root'));
            window.show=kind=>{window.kind=kind;root.render(<Fixture key={kind} kind={kind}/>);};
        `, loader: 'jsx', resolveDir: root },
        bundle: true, jsx: 'automatic', platform: 'browser', format: 'iife', outfile: output,
        define: { 'import.meta.env': '{}' },
        plugins: [{ name: 'fixture-connectors', setup(builder) {
            builder.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/eventSnapshots(?:\.js)?$/ }, () => ({ path: 'snapshots', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/useClubs(?:\.js)?$/ }, () => ({ path: 'clubs', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/useAdminPermissions(?:\.js)?$/ }, () => ({ path: 'permissions', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/googleMaps(?:\.js)?$/ }, () => ({ path: 'maps', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/(?:AdvancedEventDetailsDialog|CreateEventDialog|CreateQuickEventDialog|QuickEventDetailsDialog)(?:\.jsx)?$/ }, () => ({ path: 'editor', namespace: 'fixture' }));
            builder.onLoad({ filter: /./, namespace: 'fixture' }, args => ({ contents: {
                client: `export const supabase={auth:{getUser:async()=>({data:{user:{id:'fixture-user',email:'owner@example.invalid'}}})},
                    from(){const query={select(){return query},eq(){return query},in(){return query},order(){return query},limit(){return query},
                        maybeSingle(){return Promise.resolve({data:null})},then(resolve){return Promise.resolve({data:[]}).then(resolve)}};return query}};
                    export const isSupabaseConfigured=()=>false;`,
                snapshots: 'export const loadEventSnapshots=async()=>({});',
                clubs: 'const clubs=[]; export const useClubs=()=>({clubs,loading:false});',
                permissions: 'const permissions={role:"super_admin"}; export const useAdminPermissions=()=>({permissions});',
                maps: 'export const loadGoogleMaps=async()=>null; export const attachPlacesAutocomplete=async()=>()=>{};',
                editor: 'export default ()=>null;',
            }[args.path] }));
        } }],
    });
    browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ['--no-sandbox', '--unsafely-treat-insecure-origin-as-secure=http://fixture.invalid'] });
});

after(async () => {
    await browser?.close();
    await rm(fixtureDir, { recursive: true, force: true });
});

async function open(kind) {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error(kind, error.message));
    page.setDefaultTimeout(7500);
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url() === 'http://fixture.invalid/') return request.respond({ contentType: 'text/html', body: '<main id="root"></main>' });
        if (request.url() === 'http://fixture.invalid/private-draw-rehearsal/index.html') {
            return request.respond({ contentType: 'text/html', body: '<main>Isolated fixture</main>' });
        }
        if (kind.startsWith('rankedin-') && request.url().startsWith('https://api.rankedin.com/v1/')) {
            const url = new URL(request.url());
            const useRoute = path => url.pathname.includes(path);
            const response = body => request.respond({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
            if (useRoute('GetOrganisationEventsAsync')) return response({ payload: url.searchParams.get('IsFinished') === 'true'
                ? [{ Id: 8903, Name: 'Manual Linked Cup', StartDate: '2035-01-21' }]
                : [{ eventId: 8904, eventName: 'Imported Silver Cup', startDate: '2035-01-22', city: 'Cape Town' }] });
            if (useRoute('GetClassesAndDrawNamesAsync')) {
                if (url.searchParams.get('tournamentId') === '8902') return request.respond({ status: 503, headers: { 'access-control-allow-origin': '*' } });
                return response([{ Name: 'Open', IsPublished: true, TournamentDraws: [{}] }]);
            }
            if (useRoute('GetStandingsAsync')) return response({ IsFinished: true, Classes: [{ Id: 1, Name: 'Open' }], Rankings: [{ Id: 2 }] });
            if (useRoute('GetResultsAsync')) return response({ Data: [{ Standing: 1, Player1Name: 'First Player', Player2Name: 'Second Player' }] });
            if (useRoute('GetInfoAsync')) return response({ TournamentSidebarModel: { LocationName: 'Fixture Courts' } });
            if (useRoute('GetRegulationsAsync')) return response('Synthetic regulations');
        }
        return request.abort();
    });
    await page.goto('http://fixture.invalid/');
    await page.addStyleTag({ path: path.join(fixtureDir, 'fixture.css') });
    await page.addScriptTag({ path: output });
    await page.evaluate(kind => window.show(kind), kind);
    return page;
}

async function clickText(page, label, selector = 'button') {
    await page.waitForFunction((label, selector) => [...document.querySelectorAll(selector)].some(node =>
        node.getClientRects().length && !node.matches(':disabled') && node.textContent.trim() === label), { polling: 50 }, label, selector);
    await page.evaluate((label, selector) => [...document.querySelectorAll(selector)].find(node =>
        node.getClientRects().length && !node.matches(':disabled') && node.textContent.trim() === label).click(), label, selector);
}

test('the Bronze switch updates the original event list', async () => {
    const dashboard = await open('dashboard');
    try {
        await dashboard.waitForFunction(() => document.body.textContent.includes('Silver Open'), { polling: 50 });
        assert.equal(await dashboard.evaluate(() => document.body.textContent.includes('Bronze Open')), false);
        await dashboard.$eval('[role=switch]', button => button.click());
        await dashboard.waitForFunction(() => document.body.textContent.includes('Bronze Open'), { polling: 50 });
    } finally { await dashboard.close(); }
});

test('scoped Calendar opens its quick modal and consumes the create command', async () => {
    const calendar = await open('calendar');
    try {
        await calendar.waitForSelector('[aria-label="Synthetic quick event editor"]');
        await calendar.waitForSelector('[data-query="?keep=1"]');
        await clickText(calendar, 'Close quick editor');
        assert.equal(await calendar.$('[aria-label="Synthetic quick event editor"]'), null);
        await calendar.waitForFunction(() => document.body.textContent.includes('Silver Open'), { polling: 50 });
        assert.equal(await calendar.evaluate(() => document.body.textContent.includes('Other Open')), false);
    } finally { await calendar.close(); }
});

test('staff entry review saves pending and returns the existing payment link', async () => {
    const entry = await open('entry');
    try {
        await entry.type('.ap-event-player-search input', 'New');
        await entry.waitForSelector('[aria-label="Matching players"] button');
        await entry.$eval('[aria-label="Matching players"] button', button => button.click());
        await entry.$eval('.ap-select-trigger', button => button.click());
        await clickText(entry, 'Open · R 500,00', '[role=option]');
        await clickText(entry, 'Review player (pending)');
        assert.equal(await entry.evaluate(() => window.calls.length), 0);
        await clickText(entry, 'Confirm and add pending');
        await entry.waitForSelector('a[href$="pay_token=fake-token"]');
        assert.equal(await entry.evaluate(() => window.calls.length), 1);
    } finally { await entry.close(); }
});

test('player substitution requires a confirmed replacement selection', async () => {
    const replace = await open('replace');
    try {
        await replace.type('.ap-event-player-search input', 'New');
        await replace.waitForSelector('[aria-label="Matching players"] button');
        await replace.$eval('[aria-label="Matching players"] button', button => button.click());
        assert.equal(await replace.evaluate(() => window.calls.length), 0);
        await clickText(replace, 'Confirm replacement');
        await replace.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('taken over'), { polling: 50 });
        assert.equal(await replace.evaluate(() => window.calls[0][0]), 'replace_registration_player');
    } finally { await replace.close(); }
});

test('group moves save a versioned fixture after review', async () => {
    const group = await open('group');
    try {
        await group.waitForSelector('.ap-select-trigger');
        await group.$eval('.ap-select-trigger', button => button.click());
        await clickText(group, 'Group A · Team 1', '[role=option]');
        await group.evaluate(() => [...document.querySelectorAll('.ap-select-trigger')].at(1).click());
        await clickText(group, 'Group B · Swap with Team 3', '[role=option]');
        await clickText(group, 'Review group change');
        assert.equal(await group.evaluate(() => window.calls.length), 0);
        await clickText(group, 'Confirm');
        await group.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('updated'), { polling: 50 });
        assert.equal(await group.evaluate(() => window.calls[0][1].p_expected), 'draw-v1');
    } finally { await group.close(); }
});

test('a fresh rehearsal stays in its sandbox before leaving', async () => {
    const rehearsal = await open('rehearsal');
    try {
        await rehearsal.waitForSelector('iframe[sandbox="allow-scripts allow-downloads"]');
        await clickText(rehearsal, 'Start fresh copy');
        await clickText(rehearsal, 'Replace private copy');
        await rehearsal.waitForFunction(() => window.calls.filter(call => call[0] === 'private_draw_rehearsal_snapshot').length === 2, { polling: 50 });
        await clickText(rehearsal, 'Leave rehearsal');
        assert.deepEqual(await rehearsal.evaluate(() => window.calls.map(call => call[0])), ['private_draw_rehearsal_snapshot', 'private_draw_rehearsal_snapshot', 'closed']);
    } finally { await rehearsal.close(); }
});

test('full and quick creation mount the original light event-builder mode', async () => {
    for (const kind of ['full-builder', 'quick-builder']) {
        const page = await open(kind);
        try {
            await page.waitForSelector('.ap-live-event-editor');
            assert.equal(await page.evaluate(() => window.calls.length), 0);
        } finally { await page.close(); }
    }
});

test('verified Tournament deep link selects the requested division and denies an unassigned event', async () => {
    const assigned = await open('tournament-draw');
    try {
        await assigned.waitForSelector('.tm-division-choice[aria-pressed=true]');
        assert.match(await assigned.$eval('.tm-division-choice[aria-pressed=true]', button => button.textContent), /Reserved Division/);
        assert.equal(await assigned.$eval('.tm-tabs [aria-current=page]', link => link.textContent), 'Draws');
        assert.deepEqual(await assigned.evaluate(() => window.calls), [['tm_snapshot', { p_event: '11' }]]);
    } finally { await assigned.close(); }
    const unassigned = await open('tournament-other');
    try {
        await unassigned.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('No access'), { polling: 50 });
        assert.equal(await unassigned.$('.tm-tabs'), null);
        assert.deepEqual(await unassigned.evaluate(() => window.calls), [['tm_snapshot', { p_event: '13' }]]);
    } finally { await unassigned.close(); }
});

test('the original Tournament schedule publishes only the reviewed revision for its event', async () => {
    const page = await open('tournament-schedule');
    try {
        await page.waitForSelector('.tm-match-card');
        const cancel = dialog => dialog.dismiss();
        page.once('dialog', cancel);
        await clickText(page, 'Publish schedule');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'tm_publish_schedule')), false);
        page.once('dialog', dialog => dialog.accept());
        await clickText(page, 'Publish schedule');
        await page.waitForFunction(() => document.body.textContent.includes('Schedule published to the public court calendar'), { polling: 50 });
        assert.deepEqual(await page.evaluate(() => window.calls.find(call => call[0] === 'tm_publish_schedule')), ['tm_publish_schedule', { p_event: 11, p_expected: 2 }]);
    } finally { await page.close(); }
});

test('the original Tournament Results drawer saves an explicitly entered score to the scoped fixture', async () => {
    const page = await open('tournament-result');
    try {
        await clickText(page, 'Enter result');
        await page.waitForSelector('dialog[open]');
        await page.evaluate(() => [...document.querySelectorAll('dialog label')].find(label => label.textContent.startsWith('Winner')).querySelector('button').click());
        await clickText(page, 'First Pair', '[role=option]');
        await page.type('dialog input[type=number]:nth-of-type(1)', '6');
        const scoreFields = await page.$$('dialog input[type=number]');
        await scoreFields[1].type('4');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'tm_record_result')), false);
        await clickText(page, 'Save result');
        await page.waitForFunction(() => document.body.textContent.includes('Result saved'), { polling: 50 });
        assert.deepEqual(await page.evaluate(() => window.calls.find(call => call[0] === 'tm_record_result')), ['tm_record_result', { p_event: 11, p_match: 'match-tm-1', p_expected: 'match-v1', p_result: {kind:'played',winner:'tm-1',reason:'',sets:[[6,4]]} }]);
    } finally { await page.close(); }
});

test('Calendar RankedIn import reviews external IDs before making only the selected public import', async () => {
    const page = await open('rankedin-import');
    try {
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => !button.disabled && button.textContent.trim() === 'Import RankedIn events'), { polling: 50 });
        await clickText(page, 'Import RankedIn events');
        await page.waitForSelector('dialog .cw-bulk-rankedin-list input[type=checkbox]');
        assert.match(await page.$eval('dialog', dialog => dialog.textContent), /Manual Linked Cup · Linked record needs manual review/);
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'insert')), false);
        await clickText(page, 'Confirm event import');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent.includes('Added 1, updated 0'), { polling: 50 });
        const mutations = await page.evaluate(() => window.calls.filter(call => call[0] === 'insert'));
        assert.equal(mutations.length, 1);
        assert.equal(mutations[0][1], 'calendar');
        assert.equal(mutations[0][2].rankedin_id, '8904');
        assert.equal(mutations[0][2].venue, 'Fixture Courts');
        assert.equal(mutations[0][2].is_visible, true);
    } finally { await page.close(); }
});

test('Calendar bulk refresh writes only the reviewed past cache and preserves it on provider failure', async () => {
    const page = await open('rankedin-refresh');
    try {
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => !button.disabled && button.textContent.trim() === 'Refresh past RankedIn draws and results'), { polling: 50 });
        await clickText(page, 'Refresh past RankedIn draws and results');
        await page.waitForSelector('dialog [aria-label="Past RankedIn events"]');
        assert.doesNotMatch(await page.$eval('dialog', dialog => dialog.textContent), /Manual Linked Cup/);
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'upsert')), false);
        await clickText(page, 'Confirm cache refresh');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent.includes('Refreshed 1 event caches. 1 could not be confirmed.'), { polling: 50 });
        const mutations = await page.evaluate(() => window.calls.filter(call => call[0] === 'upsert'));
        assert.equal(mutations.length, 1);
        assert.equal(mutations[0][1], 'rankedin_results_cache');
        assert.equal(mutations[0][2].event_id, 19);
        assert.equal(mutations[0][2].winners[0].resultSource, 'rankedin-standings');
    } finally { await page.close(); }
});

test('view public draw points to the canonical host and remains absent for a draft', async () => {
    const live = await open('public-draw-live');
    try {
        const link = await live.waitForSelector('a[href="https://4mpadel.co.za/native-draws/silver-open"]');
        assert.match(await link.evaluate(node=>node.textContent), /View public draw/);
    } finally { await live.close(); }
    const draft = await open('public-draw-draft');
    try {
        await draft.waitForFunction(()=>document.querySelector('.ap-draw-list')?.textContent.includes('draft'));
        assert.equal(await draft.$('a[href*="/native-draws/"], a[href*="/draws-preview/"]'), null);
    } finally { await draft.close(); }
});

test('verified host reviews live and completion changes through exact organisation RPCs', async () => {
    const owner = await open('host-native');
    try {
        await owner.waitForFunction(() => [...document.querySelectorAll('dialog label')].some(label => label.textContent.startsWith('Match')), { polling: 50 });
        await owner.evaluate(() => [...document.querySelectorAll('dialog label')].find(label => label.textContent.startsWith('Match')).querySelector('button').click());
        await clickText(owner, 'Final · First Pair vs Second Pair', '[role=option]');
        await clickText(owner, 'Mark match live');
        assert.equal(await owner.evaluate(()=>window.calls.some(([name])=>name==='native_manage_organisation_draw')), false);
        await clickText(owner, 'Confirm draw action');
        await owner.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent.includes('Match marked live'));
        const requests = await owner.evaluate(()=>window.calls.filter(([name])=>name==='native_manage_organisation_draw'));
        assert.deepEqual(requests,[['native_manage_organisation_draw',{p_organisation_id:'org-a',p_event_id:11,p_draw_id:'draw-a',
            p_expected_draw:'draw-v1',p_action:'live',p_match_id:'match-tm-1',p_expected_match:'match-v1'}]]);
        assert.equal(await owner.evaluate(()=>window.calls.some(([name])=>name==='update')), false);
    } finally { await owner.close(); }
    const completion = await open('host-draw-complete');
    try {
        await clickText(completion, 'Mark draw complete');
        await clickText(completion, 'Confirm draw action');
        await completion.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent.includes('Draw marked complete'));
        const options = await completion.evaluate(()=>window.calls.find(([name])=>name==='native_manage_organisation_draw')[1]);
        assert.equal(options.p_action,'complete');
        assert.deepEqual(options.p_matches,{'match-tm-1':['completed','match-v1']});
        assert.equal(await completion.evaluate(()=>window.calls.some(([name])=>name==='player_ranking_points')),false);
    } finally { await completion.close(); }
    const foreign = await open('host-foreign');
    try {
        await foreign.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('no longer available'));
        assert.equal(await foreign.evaluate(()=>window.calls.some(([name])=>name==='native_manage_organisation_draw')),false);
    } finally { await foreign.close(); }
});

test('native draw operations mark live and feature the exact reviewed version, one reviewed action at a time', async () => {
    for (const [label, expected] of [['Mark match live', { status:'in_progress' }], ['Feature match', { is_featured:true }]]) {
        const page = await open('native-draw');
        try {
            await page.waitForFunction(() => [...document.querySelectorAll('dialog label')].some(label => label.textContent.startsWith('Match')), { polling: 50 });
            assert.doesNotMatch(await page.$eval('dialog', dialog => dialog.textContent), /Other org|Other announcement/);
            await page.evaluate(() => [...document.querySelectorAll('dialog label')].find(label => label.textContent.startsWith('Match')).querySelector('button').click());
            await clickText(page, 'Final · First Pair vs Second Pair', '[role=option]');
            await clickText(page, label);
            assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'update')), false);
            await clickText(page, 'Confirm draw action');
            await page.waitForFunction(() => /Match marked live|Match featured/.test(document.querySelector('dialog [role=status]')?.textContent), { polling: 50 });
            const mutation = await page.evaluate(() => window.calls.find(call => call[0] === 'update'));
            assert.equal(mutation[1], 'draw_matches');
            assert.deepEqual(mutation[2], {id:'match-tm-1',draw_id:'draw-a',status:'scheduled',updated_at:'match-v1'});
            delete mutation[3].updated_at;
            assert.deepEqual(mutation[3], expected);
        } finally { await page.close(); }
    }
});

test('native draw corrections reopen only the reviewed main draw and verify the saved draft', async () => {
    const page = await open('native-draw');
    try {
        await clickText(page, 'Reopen draw for corrections');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'reopen_native_draw_for_corrections')), false);
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Draw reopened for corrections.', { polling: 50 });
        assert.deepEqual(await page.evaluate(() => window.calls.find(call => call[0] === 'reopen_native_draw_for_corrections')), ['reopen_native_draw_for_corrections',{p_draw_id:'draw-a'}]);
    } finally { await page.close(); }
});

test('native draw announcements publish and remove only the reviewed event and draw scope', async () => {
    const publish = await open('native-draw');
    try {
        await publish.waitForSelector('dialog textarea');
        await publish.type('dialog textarea', 'Use the south door');
        await clickText(publish, 'Review announcement');
        assert.equal(await publish.evaluate(() => window.calls.some(call => call[0] === 'insert')), false);
        await clickText(publish, 'Confirm draw action');
        await publish.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Announcement published.', { polling: 50 });
        assert.deepEqual(await publish.evaluate(() => window.calls.find(call => call[0] === 'insert')), ['insert','native_draw_announcements',
            {event_id:11,division_id:51,draw_id:'draw-a',title:null,message:'Use the south door',is_pinned:false}]);
    } finally { await publish.close(); }

    const remove = await open('native-draw');
    try {
        await clickText(remove, 'Remove announcement');
        assert.equal(await remove.evaluate(() => window.calls.some(call => call[0] === 'delete')), false);
        await clickText(remove, 'Confirm draw action');
        await remove.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Announcement removed.', { polling: 50 });
        const mutation = await remove.evaluate(() => window.calls.find(call => call[0] === 'delete'));
        assert.deepEqual(mutation.slice(0, 3), ['delete','native_draw_announcements',
            { id:'announcement-1',event_id:11,updated_at:'notice-v1',division_id:51,draw_id:'draw-a' }]);
    } finally { await remove.close(); }
});

test('Event Manager Draw generator selects a division with no saved draw and saves the reviewed private bracket', async () => {
    const page = await open('draw-generator');
    try {
        await clickText(page, 'Draw generator');
        await page.waitForSelector('[data-query="?event=505&workspace=draws&division=fixture-open-division"]');
        await clickText(page, 'Generate draw preview');
        await page.waitForFunction(() => document.body.textContent.includes('One / Two') && document.body.textContent.includes('Three / Four'), { polling: 50 });
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'tm_save_draw')), false);
        await clickText(page, 'Save draft');
        await page.waitForFunction(() => document.body.textContent.includes('Private draw saved'), { polling: 50 });
        const mutation = await page.evaluate(() => window.calls.find(call => call[0] === 'tm_save_draw'));
        assert.equal(mutation[1].p_event, 505);
        assert.equal(mutation[1].p_division, 'fixture-open-division');
        assert.equal(mutation[1].p_expected, 7);
        assert.equal(mutation[1].p_draw.format, 'knockout');
        assert.equal(mutation[1].p_draw.entries.length, 2);
        assert.equal(mutation[1].p_draw.matches.length, 1);
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'tm_publish_draw')), false);
    } finally { await page.close(); }
});

test('per-match court setup saves only the reviewed fixture and preserves a start time when the court changes', async () => {
    const page = await open('court-single');
    try {
        await page.waitForFunction(() => [...document.querySelectorAll('dialog label')].some(node => node.textContent.startsWith('Match')), { polling: 50 });
        await page.evaluate(() => [...document.querySelectorAll('dialog label')].find(node => node.textContent.startsWith('Match')).querySelector('button').click());
        await clickText(page, 'Final · First Pair vs Second Pair', '[role=option]');
        await clickText(page, 'Match court setup');
        const courtInput = '.ap-native-court-setup input[placeholder="Court 1"]';
        await page.$eval(courtInput, input => { input.focus(); input.select(); });
        await page.keyboard.type('Court 3');
        await clickText(page, 'Review court changes');
        await page.waitForFunction(() => document.querySelector('.ap-native-court-review')?.textContent.includes('Court 3 · 2035-01-21 14:00 SAST'), { polling: 50 });
        await clickText(page, 'Back');
        assert.equal(await page.$eval(courtInput, input => input.value), 'Court 3');
        await clickText(page, 'Review court changes');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'update')), false);
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Match court setup saved.', { polling: 50 });
        const update = await page.evaluate(() => window.calls.find(call => call[0] === 'update'));
        assert.deepEqual(update[2], {id:'match-tm-1',draw_id:'draw-a',status:'scheduled',updated_at:'match-v1'});
        assert.equal(update[3].court_name, 'Court 3');
        assert.equal(update[3].scheduled_start, undefined);
    } finally { await page.close(); }
});

test('bulk court setup uses SAST, keeps existing court assignments, and updates only the reviewed draw fixtures', async () => {
    const page = await open('court-bulk');
    try {
        await clickText(page, 'Bulk court setup');
        await page.type('.ap-native-court-setup input[placeholder="Court 1"]', 'Court 2');
        await page.$eval('.ap-native-court-setup input[type=datetime-local]', input => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2035-01-21T14:00');
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
        });
        await clickText(page, 'Review court changes');
        await page.waitForFunction(() => document.querySelector('.ap-native-court-review')?.textContent.includes('Court 2 · 2035-01-21 15:00 SAST'), { polling: 50 });
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'update')), false);
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Court setup saved for 2 matches.', { polling: 50 });
        const updates = await page.evaluate(() => window.calls.filter(call => call[0] === 'update'));
        assert.deepEqual(updates.map(row => row[2].id), ['court-a', 'court-b']);
        assert.ok(updates.every(row => row[2].draw_id === 'draw-a'));
        assert.equal(updates[0][3].court_name, undefined);
        assert.equal(updates[0][3].scheduled_start, '2035-01-21T12:00:00.000Z');
        assert.equal(updates[0][3].scheduled_end, '2035-01-21T12:45:00.000Z');
        assert.equal(updates[1][3].court_name, 'Court 2');
        assert.equal(updates[1][3].scheduled_start, '2035-01-21T13:00:00.000Z');
    } finally { await page.close(); }
});

test('bulk court setup accounts for a partial write and denies a tenant scope before reading draw controls', async () => {
    const partial = await open('court-bulk');
    try {
        await clickText(partial, 'Bulk court setup');
        await partial.type('.ap-native-court-setup input[placeholder="Court 1"]', 'Court 2');
        await partial.$eval('.ap-native-court-setup input[type=datetime-local]', input => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2035-01-21T14:00');
            input.dispatchEvent(new Event('input', {bubbles:true}));
        });
        await partial.evaluate(() => { window.failSecondCourt=true; });
        await clickText(partial, 'Review court changes');
        await clickText(partial, 'Confirm draw action');
        await partial.waitForFunction(() => document.querySelector('dialog [role=alert]')?.textContent.includes('Saved 1 of 2 reviewed matches'), { polling: 50 });
        const writes = await partial.evaluate(() => window.calls.filter(call => call[0] === 'update').map(call => call[2].id));
        assert.deepEqual(writes, ['court-a']);
    } finally { await partial.close(); }

    const tenant = await open('court-tenant');
    try {
        await tenant.waitForFunction(() => document.querySelector('dialog [role=alert]')?.textContent.includes('host organisation is required'), { polling: 50 });
        const calls = await tenant.evaluate(() => window.calls);
        assert.deepEqual(calls, [
            ['can_manage_event', { p_event_id: 11 }],
            ['admin_organisation_host_builder', { p_organisation_id: 'org-a', p_event_id: 11 }],
        ]);
        assert.doesNotMatch(await tenant.$eval('dialog', node => node.textContent), /Bulk court setup|Match court setup/);
    } finally { await tenant.close(); }
});


test('the original correction dialog confirms the same receipt through the audited RPC', async () => {
    const page = await open('payment-correct');
    try {
        await page.waitForSelector('dialog[open]');
        assert.match(await page.$eval('dialog .ap-payment-amount', node => node.textContent), /700/);
        await page.click('button[aria-label="Payment received via"]');
        await clickText(page, 'Cash', '[role="option"] span');
        await page.click('button[aria-label="Payment received by"]');
        await clickText(page, '4M', '[role="option"] span');
        assert.deepEqual(await page.evaluate(() => window.calls), []);
        await clickText(page, 'Save payment');
        await page.waitForSelector('dialog [role="status"]');
        assert.deepEqual(await page.evaluate(() => window.calls.filter(([action]) => action === 'correct_manual_event_payment')), [
            ['correct_manual_event_payment', { p_event:11, p_registration:'reg-1', p_payment:'receipt-1', p_method:'cash', p_recipient:'4m', p_note:'Original note' }],
        ]);
        await clickText(page, 'Done');
        assert.deepEqual(await page.evaluate(() => window.calls.at(-1)), ['closed', { refresh:true }]);
    } finally { await page.close(); }
});

test('manual receipt corrections stop when the receipt changes or the workspace is scoped to a tenant', async () => {
    for (const [kind, message] of [['payment-stale', 'The receipt changed.'], ['payment-tenant', 'all-workspaces administrator']]) {
        const page = await open(kind);
        try {
            await clickText(page, 'Save payment');
            await page.waitForSelector('dialog [role="alert"]');
            assert.ok((await page.$eval('dialog [role="alert"]', node => node.textContent)).includes(message));
            assert.equal(await page.evaluate(() => window.calls.some(([action]) => action === 'correct_manual_event_payment')), false);
        } finally { await page.close(); }
    }
});

test('marking a native draw complete checks exact reviewed match states, draw version, event and division', async () => {
    const page = await open('draw-complete');
    try {
        await clickText(page, 'Mark draw complete');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'update')), false);
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Draw marked complete.', { polling: 50 });
        const mutation = await page.evaluate(() => window.calls.find(call => call[0] === 'update'));
        assert.deepEqual(mutation.slice(1,3), ['draws', { id:'draw-a',event_id:11,division_id:51,status:'published',updated_at:'draw-v1' }]);
        assert.equal(mutation[3].status, 'completed');
        assert.ok(mutation[3].completed_at);
    } finally { await page.close(); }
});

test('ranking awards review inserts exact finalists and winners into the scoped ledger without replacing prior awards', async () => {
    const page = await open('draw-ranking');
    try {
        await clickText(page, 'Review ranking points');
        await page.waitForFunction(() => document.querySelector('[aria-label="Final placements and points"]')?.textContent.includes('Avery (awarded)'), { polling: 50 });
        await clickText(page, 'Review points to award');
        await page.waitForFunction(() => document.querySelector('.ap-native-court-review')?.textContent.includes('Morgan'), { polling: 50 });
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'insert')), false);
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === '3 player awards recorded.', { polling: 50 });
        const writes = await page.evaluate(() => window.calls.filter(call => call[0] === 'insert'));
        assert.equal(writes.length, 1);
        assert.equal(writes[0][1], 'player_ranking_points');
        const awards = writes[0][2].map(row => [row.player_id,row.event_id,row.division_id,row.round_code,row.points,row.config_snapshot.draw_id]);
        assert.deepEqual(awards, [[2,11,51,'winner',100,'draw-a'],[3,11,51,'finalist',65,'draw-a'],[4,11,51,'finalist',65,'draw-a']]);
    } finally { await page.close(); }
});

test('native draw completion and ranking awards reject stale reviewed data without any write', async () => {
    const completion = await open('draw-complete');
    try {
        await clickText(completion, 'Mark draw complete');
        await completion.evaluate(() => { window.changeResultRevision=true; });
        await clickText(completion, 'Confirm draw action');
        await completion.waitForFunction(() => document.querySelector('dialog [role=alert]')?.textContent.includes('reviewed results changed'), { polling: 50 });
        assert.equal(await completion.evaluate(() => window.calls.some(call => call[0] === 'update')), false);
    } finally { await completion.close(); }

    const ranking = await open('draw-ranking');
    try {
        await clickText(ranking, 'Review ranking points');
        await clickText(ranking, 'Review points to award');
        await ranking.evaluate(() => { window.changeRankingRule=true; });
        await clickText(ranking, 'Confirm draw action');
        await ranking.waitForFunction(() => document.querySelector('dialog [role=alert]')?.textContent.includes('placements, rules or award ledger changed'), { polling: 50 });
        assert.equal(await ranking.evaluate(() => window.calls.some(call => call[0] === 'insert')), false);
    } finally { await ranking.close(); }
});

test('linked Silver and Bronze plate reviews show only opening-round losers and submit exact revisions', async () => {
    for (const [kind, label] of [['special-silver','Create Silver plate'], ['special-bronze','Create Bronze plate']]) {
        const page = await open(kind);
        try {
            await clickText(page, label);
            assert.match(await page.$eval('dialog', node => node.textContent), /Plate Team 2Plate Team 4/);
            assert.doesNotMatch(await page.$eval('dialog', node => node.textContent), /Plate Team 1|Plate Team 3/);
            assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'native_create_linked_plate')), false);
            await clickText(page, 'Confirm draw action');
            await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent.includes('created and published'), { polling: 50 });
            const calls = await page.evaluate(() => window.calls.filter(call => call[0] === 'native_create_linked_plate'));
            assert.deepEqual(calls, [['native_create_linked_plate', {
                p_event_id:11,p_parent_draw:'draw-a',p_expected_parent:'draw-v1',p_expected_matches:{'plate-first':'match-v1','plate-second':'match-v1'},
            }]]);
        } finally { await page.close(); }
    }
});

test('legacy main draw enables Silver after confirmation and keeps plate creation as a separate reviewed action', async () => {
    const page = await open('special-enable-silver');
    try {
        await clickText(page, 'Enable Silver plate');
        assert.match(await page.$eval('dialog', node => node.textContent), /Open · Main draw · published/);
        assert.match(await page.$eval('dialog', node => node.textContent), /use Create Silver plate/);
        assert.equal(await page.evaluate(() => window.calls.some(([name]) => name === 'native_enable_silver_plate')), false);
        await clickText(page, 'Back');
        await clickText(page, 'Enable Silver plate');
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent.includes('Silver plate enabled'));
        const actions = await page.evaluate(() => window.calls.filter(([name]) => ['native_enable_silver_plate','native_create_linked_plate'].includes(name)));
        assert.deepEqual(actions, [['native_enable_silver_plate', { p_event_id: 11, p_draw_id: 'draw-a', p_expected_draw: 'draw-v1' }]]);

        await page.evaluate(() => { window.show('native-draw'); });
        await page.evaluate(() => { window.show('special-enable-silver'); });
        await clickText(page, 'Create Silver plate');
        assert.match(await page.$eval('dialog', node => node.textContent), /Plate Team 2Plate Team 4/);
        assert.equal(await page.evaluate(() => window.calls.some(([name]) => name === 'native_create_linked_plate')), false);
    } finally { await page.close(); }
});

test('legacy Silver enable rejects a stale server review and disallows tenant attempts', async () => {
    const stale = await open('special-enable-silver');
    try {
        await clickText(stale, 'Enable Silver plate');
        await stale.evaluate(() => { window.rejectSilverReview=true; });
        await clickText(stale, 'Confirm draw action');
        await stale.waitForFunction(() => document.querySelector('dialog [role=alert]')?.textContent.includes('draw changed'));
        assert.equal(await stale.evaluate(() => Boolean(window.silverEnabled)), false);
    } finally { await stale.close(); }

    const tenant = await open('special-enable-silver-tenant');
    try {
        await tenant.waitForFunction(() => document.querySelector('dialog [role=alert]')?.textContent.includes('host organisation is required'));
        assert.equal(await tenant.evaluate(() => document.querySelector('dialog')?.textContent.includes('Enable Silver plate')), false);
        assert.equal(await tenant.evaluate(() => window.calls.some(([name]) => name === 'native_enable_silver_plate')), false);
    } finally { await tenant.close(); }
});

test('play-day changes work before a draw exists, using exact event and day versions', async () => {
    const page = await open('special-days');
    try {
        await clickText(page, 'Play days & courts');
        await page.waitForSelector('input[type=date]');
        await page.$eval('input[type=date]', input => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2035-01-22');
            input.dispatchEvent(new Event('input', {bubbles:true}));
        });
        await clickText(page, 'Add play day');
        await clickText(page, 'Review playing hours');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'native_save_event_play_days')), false);
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Playing hours and courts saved.', { polling: 50 });
        const payload = await page.evaluate(() => window.calls.find(call => call[0] === 'native_save_event_play_days')[1]);
        assert.equal(payload.p_event_id,11);
        assert.deepEqual(payload.p_expected, { '2035-01-21':'day-v1','2035-01-22':null });
        assert.deepEqual(payload.p_days.map(day => day.play_date), ['2035-01-21','2035-01-22']);
    } finally { await page.close(); }

    const remove = await open('special-remove');
    try {
        await clickText(remove, 'Play days & courts');
        await clickText(remove, 'Remove 2035-01-21');
        assert.equal(await remove.evaluate(() => window.calls.some(call => call[0] === 'remove_event_play_day')), false);
        await clickText(remove, 'Confirm draw action');
        await remove.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Play day removed.', { polling: 50 });
        assert.deepEqual(await remove.evaluate(() => window.calls.find(call => call[0] === 'remove_event_play_day')),
            ['remove_event_play_day',{p_event_id:11,p_play_date:'2035-01-21'}]);
    } finally { await remove.close(); }
});

test('division schedule never offers another event and preserves its shared player review fields', async () => {
    const page = await open('special-division');
    try {
        await clickText(page, 'Division schedule');
        await page.waitForFunction(() => [...document.querySelectorAll('dialog label')].some(label => label.textContent.startsWith('Scheduling priority')), { polling: 50 });
        assert.doesNotMatch(await page.$eval('dialog', element => element.textContent), /Other Event Open/);
        await page.evaluate(() => [...document.querySelectorAll('dialog label')].find(label => label.textContent.startsWith('Scheduling priority')).querySelector('input').focus());
        await page.keyboard.type('2');
        await page.evaluate(() => [...document.querySelectorAll('dialog label')].find(label => label.textContent === 'Rounds').querySelector('input').focus());
        await page.keyboard.type('3');
        await clickText(page, 'Review division plan');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'update')), false);
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Division schedule saved.', { polling: 50 });
        const mutation = await page.evaluate(() => window.calls.find(call => call[0] === 'update'));
        assert.deepEqual(mutation.slice(1,3), ['draw_player_reviews',{event_id:11,division_id:51,updated_at:'review-v1'}]);
        assert.equal(mutation[3].confirmed_by,'fixture-user');
        assert.deepEqual(mutation[3].state,{fingerprint:'retain-fingerprint',workflow:{format:'knockout',schedule_days:{'2035-01-21':{start_time:'',rounds:3}},schedule_priority:2}});
    } finally { await page.close(); }
});

test('automatic court planning consumes saved division hours and confirms the entire reviewed set atomically', async () => {
    const page = await open('special-automatic');
    try {
        await clickText(page, 'Preview automatic court plan');
        await page.waitForFunction(() => document.querySelector('.ap-native-court-review, dialog [role=alert]'), { polling: 50 });
        const review = await page.evaluate(() => document.querySelector('.ap-native-court-review, dialog [role=alert]').textContent);
        assert.match(review, /2035-01-21 10:00 SAST/);
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'native_apply_court_schedule')), false);
        await clickText(page, 'Confirm draw action');
        await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent === 'Court bookings saved for 2 matches.', { polling: 50 });
        const calls = await page.evaluate(() => window.calls.filter(call => call[0] === 'native_apply_court_schedule'));
        assert.equal(calls.length,1);
        assert.equal(calls[0][1].p_event_id,11);
        const planned = calls[0][1].p_bookings;
        assert.deepEqual(planned.map(item => [item.match_id,item.draw_id,item.expected_version]),
            [['court-a','draw-a','match-v1'],['court-b','draw-a','match-v1']]);
        assert.equal(planned[0].scheduled_start, '2035-01-21T08:00:00.000Z');
    } finally { await page.close(); }
});

test('the organisation Draw generator reviews eligibility and seeds, saves privately, and reloads before a stale publication can be retried', async () => {
    const page = await open('host-tournament-generator');
    try {
        await page.evaluate(() => { window.hostInitialFailure=true; });
        await clickText(page, 'Draw generator');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=alert]')?.textContent.includes('Draw snapshot temporarily unavailable'), { polling:50 });
        assert.equal(await page.$('input[aria-label="Search tournaments"]'), null);
        await clickText(page, 'Try again');
        await page.waitForSelector('.tm-tabs');
        assert.deepEqual(await page.$$eval('.tm-tabs a', links => links.map(link => link.textContent)), ['Players', 'Divisions', 'Draws']);
        await clickText(page, 'Review player list');
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => /Add player \/ team|^Edit$/.test(button.textContent))), false);
        await clickText(page, 'Confirm player list');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=status]')?.textContent.includes('Player list confirmed'));
        await page.$eval('.tm-tabs a:nth-child(3)', link => link.click());
        await clickText(page, 'Review format and seeds');
        await clickText(page, 'Confirm seeds');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=status]')?.textContent.includes('Seed order'));
        await page.$eval('.tm-tabs a:nth-child(3)', link => link.click());
        await clickText(page, 'Generate draw preview');
        await clickText(page, 'Save draft');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=status]')?.textContent.includes('Private draw saved'));
        await page.$eval('input[type=checkbox]', input => input.click());
        await page.evaluate(() => { window.hostStale=true; });
        await clickText(page, 'Publish draw');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=alert]')?.textContent.includes('The saved draw changed'));
        assert.equal(await page.$$eval('button', buttons => buttons.find(button => button.textContent === 'Publish draw')?.disabled), true);
        await clickText(page, 'Refresh');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=status]')?.textContent.includes('Tournament refreshed'));
        assert.equal(await page.$eval('input[type=checkbox]', input => input.checked), false);
        await page.$eval('input[type=checkbox]', input => input.click());
        await clickText(page, 'Publish draw');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=status]')?.textContent === 'Draw published');
        const calls = await page.evaluate(() => window.calls);
        assert.ok(calls.every(([method, args]) => method === 'tm_host_draw_preparation' && args.p_organisation === 'org-a' && String(args.p_event) === '505'));
        const actions = calls.map(([, args]) => args);
        assert.deepEqual(actions.filter(args => args.p_action === 'confirm').map(args => [args.p_payload.p_kind, args.p_payload.p_expected]),
            [['players', 0], ['format_and_seeds', 1]]);
        assert.deepEqual(actions.find(args => args.p_action === 'save_draw')?.p_payload.p_draw.entries.length, 2);
        assert.deepEqual(actions.filter(args => args.p_action === 'publish_draw').map(args => args.p_payload.p_draw_token), ['host-token-v1', 'host-token-v2']);
        await page.$eval('a.tm-back', link => link.click());
        await page.waitForSelector('.ap-primary');
        assert.match(await page.$eval('output', output => output.getAttribute('data-query')), /event=505&tab=draws$/);
    } finally { await page.close(); }
});
