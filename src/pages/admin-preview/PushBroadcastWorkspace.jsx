import React, { useEffect, useMemo, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { Dialog } from './PlayersWorkspace';
import { PUSH_DESTINATIONS, pushAudience, pushMessage, pushHistoryDate, pushBroadcastRead, previewPushAudience, searchPushPlayers } from './pushBroadcastData.js';
import './PushBroadcastWorkspace.css';

// Remount the controller for client/identity/scope changes: old async work cannot
// publish data into a different account, even when a transport ignores abort.
let generation=0;
export default function PushBroadcastWorkspace(props) {
  const context=useMemo(()=>({key:++generation,client:props.client,userId:props.session?.user?.id,email:props.session?.user?.email,scopeId:props.scopeId}),[props.client,props.session?.user?.id,props.session?.user?.email,props.scopeId]);
  return <PushController key={context.key} {...props}/>;
}
function PushController({client,session,scopeId='all',refreshRevision=0}) {
  const [catalog,setCatalog]=useState({loading:true}),[history,setHistory]=useState({loading:true});
  const [eventIds,setEventIds]=useState([]),[players,setPlayers]=useState([]),[payment,setPayment]=useState('all'),[partner,setPartner]=useState('all'),[excluded,setExcluded]=useState([]);
  const [query,setQuery]=useState(''),[results,setResults]=useState({rows:[]}),[audience,setAudience]=useState({}),[revision,setRevision]=useState(0);
  const [title,setTitle]=useState(''),[body,setBody]=useState(''),[path,setPath]=useState('/calendar'),[review,setReview]=useState(null),[error,setError]=useState(''),[recipientSearch,setRecipientSearch]=useState('');
  const options=useMemo(()=>({client,userId:session?.user?.id,expectedEmail:session?.user?.email,scopeId}),[client,session?.user?.id,session?.user?.email,scopeId]);
  const selection=useMemo(()=>pushAudience({eventIds,playerIds:players.map(p=>p.id),payment,partner,excluded}),[eventIds,players,payment,partner,excluded]);
  const key=JSON.stringify(selection), current=audience.key===key?audience.data:null;
  useEffect(()=>{
    const abort=new AbortController(); const opts={...options,signal:abort.signal};
    queueMicrotask(()=>{if(!abort.signal.aborted){setCatalog({loading:true});setHistory({loading:true});}});
    const timer=setTimeout(()=>{abort.abort();setCatalog({error:'Loading timed out. Refresh to retry.'});setHistory({error:'Loading timed out. Refresh to retry.'});},20000);
    Promise.all([
      pushBroadcastRead(opts,'admin_push_broadcast_events').then(rows=>{if(!Array.isArray(rows))throw Error('Invalid event list.');if(!abort.signal.aborted)setCatalog({rows:[...rows].sort((a,b)=>String(a.start_date||'9999').localeCompare(String(b.start_date||'9999')))});}).catch(e=>{if(!abort.signal.aborted)setCatalog({error:e.message});}),
      pushBroadcastRead(opts,'list_push_broadcasts').then(rows=>{if(!Array.isArray(rows))throw Error('Invalid broadcast history.');if(!abort.signal.aborted)setHistory({rows});}).catch(e=>{if(!abort.signal.aborted)setHistory({error:e.message});})
    ]).finally(()=>clearTimeout(timer));
    return()=>{abort.abort();clearTimeout(timer);};
  },[options,revision,refreshRevision]);
  useEffect(()=>{
    const abort=new AbortController();queueMicrotask(()=>{if(!abort.signal.aborted)setResults({rows:[],loading:query.trim().length>=2});});
    let timeout;
    const timer=setTimeout(()=>{
      timeout=setTimeout(()=>{abort.abort();setResults({rows:[],error:'Search timed out. Change the search to retry.'});},20000);
      searchPushPlayers({...options,signal:abort.signal},query).then(rows=>{if(!abort.signal.aborted)setResults({rows});}).catch(e=>{if(!abort.signal.aborted)setResults({rows:[],error:e.message});}).finally(()=>clearTimeout(timeout));
    },250);
    return()=>{abort.abort();clearTimeout(timer);clearTimeout(timeout);};
  },[options,query]);
  useEffect(()=>{
    const abort=new AbortController();queueMicrotask(()=>{if(!abort.signal.aborted){setAudience({loading:true});setReview(null);}});
    const timer=setTimeout(()=>{abort.abort();setAudience({error:'Audience loading timed out. Refresh to retry.'});},20000);
    previewPushAudience({...options,signal:abort.signal},selection).then(data=>{if(!abort.signal.aborted)setAudience({key,data});}).catch(e=>{if(!abort.signal.aborted)setAudience({error:e.message});}).finally(()=>clearTimeout(timer));
    return()=>{abort.abort();clearTimeout(timer);};
  },[options,selection,key,revision,refreshRevision]);
  const events=catalog.rows||[], visible=(current?.recipients||[]).filter(p=>`${p.name} ${p.email}`.toLowerCase().includes(recipientSearch.toLowerCase()));
  const buildReview=()=>{
    try { const message=pushMessage({title,body,path}); if(!current?.ready)throw Error('Preview an audience with at least one push-enabled recipient.');if(current.total>10000)throw Error('Limit broadcasts to 10,000 recipients.');setReview({message,audience:current});setError(''); }
    catch(e){setError(e.message);}
  };
  return <div className="ap-push-workspace">
    <header><div><h1>Push broadcasts</h1><p>Target app notifications to event entrants and individual players.</p></div><button className="ap-secondary" onClick={()=>setRevision(v=>v+1)}>Refresh</button></header>
    <div className="ap-push-columns"><div>
      <section><h2>Choose recipients</h2><p>Combine lists without duplicate messages. Audience membership and availability are resolved by the server.</p>
        <label>Find individual players<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name or email…" autoComplete="off"/></label>
        {query.trim().length<2&&<p>Type at least 2 characters to search.</p>}{results.loading&&<p role="status">Searching players…</p>}{results.error&&<p role="alert">{results.error}</p>}
        {query.trim().length>=2&&!results.loading&&!results.error&&!results.rows.length&&<p>No matching players.</p>}
        <ul className="ap-push-list">{results.rows.map(player=><li key={player.id}><span><b>{player.name||'Player'}</b><small>{player.email}</small></span><button className="ap-secondary" disabled={players.some(p=>p.id===player.id)||players.length>=1000} onClick={()=>setPlayers(old=>[...old,player])}>Add</button></li>)}</ul>
        {players.length>0&&<ul className="ap-push-selected">{players.map(player=><li key={player.id}>{player.name||player.email}<button aria-label={`Remove ${player.name||player.email}`} onClick={()=>setPlayers(old=>old.filter(p=>p.id!==player.id))}>×</button></li>)}</ul>}
        <label>Add an event list<SearchableDropdown value="" disabled={catalog.loading||!!catalog.error||eventIds.length>=100} onChange={e=>{const id=Number(e.target.value);if(id&&!eventIds.includes(id))setEventIds(old=>[...old,id]);}}><option value="">Search and select an event</option>{events.map(event=><option key={event.id} value={event.id} disabled={eventIds.includes(Number(event.id))}>{event.event_name} · {event.start_date||'Date not set'}</option>)}</SearchableDropdown></label>
        {catalog.loading&&<p role="status">Loading events…</p>}{catalog.error&&<p role="alert">{catalog.error}</p>}
        <ul className="ap-push-selected">{eventIds.map(id=><li key={id}>{events.find(e=>Number(e.id)===id)?.event_name||`Event ${id}`}<button aria-label={`Remove event ${id}`} onClick={()=>setEventIds(old=>old.filter(value=>value!==id))}>×</button></li>)}</ul>
        <div className="ap-push-fields"><label>Payment status<SearchableDropdown value={payment} onChange={e=>setPayment(e.target.value)}><option value="all">All payments</option><option value="paid">Paid</option><option value="pending">Pending / unpaid</option></SearchableDropdown></label><label>Partner status<SearchableDropdown value={partner} onChange={e=>setPartner(e.target.value)}><option value="all">All entries</option><option value="has_partner">Has a partner</option><option value="solo">Solo / no partner</option></SearchableDropdown></label></div>
        {(payment!=='all'||partner!=='all')&&<p>Filters apply to site registrations. RankedIn lists are excluded while filtering; individually selected players remain included.</p>}
      </section>
      <section><h2>Notification message</h2><label>Title<input value={title} maxLength={80} onChange={e=>{setTitle(e.target.value);setReview(null);}}/></label><label>Message<textarea rows={4} value={body} maxLength={500} onChange={e=>{setBody(e.target.value);setReview(null);}}/></label><small>{title.length}/80 title · {body.length}/500 message</small>
        <label>Open when tapped<SearchableDropdown value={path} onChange={e=>{setPath(e.target.value);setReview(null);}}>{PUSH_DESTINATIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}<optgroup label="Event destination">{events.map(event=><option key={event.id} value={`/events/${event.id}`}>{event.event_name}</option>)}</optgroup></SearchableDropdown></label><p>Event destinations must be published and viewable in the app; the server checks this when sending.</p>
      </section>
    </div><aside><section><h2>Notification preview</h2><div className="ap-push-notification"><small>4M Padel · now</small><h3>{title||'Your notification title'}</h3><p>{body||'Your message will appear here.'}</p></div></section>
      <section><h2>Audience preview</h2>{audience.loading&&<p role="status">Updating audience…</p>}{audience.error&&<p role="alert">{audience.error}</p>}{current&&<><dl>{[['ready','Can receive push'],['total','Selected players'],['disabled','Push disabled'],['no_device','No app device']].map(([name,label])=><div key={name}><dt>{label}</dt><dd>{current[name]}</dd></div>)}</dl><details><summary>Review all recipients</summary><label>Find a recipient<input value={recipientSearch} onChange={e=>setRecipientSearch(e.target.value)} placeholder="Name or email…"/></label><ul className="ap-push-list ap-push-recipients">{visible.map(person=><li key={person.email}><span><b>{person.name}</b><small>{person.email}</small><small>{({ready:'Push available',disabled:'Push disabled',no_device:'No app device'})[person.availability]}</small></span><button className="ap-secondary" onClick={()=>setExcluded(old=>[...old,person.email])}>Exclude</button></li>)}</ul></details></>}
        {excluded.length>0&&<button className="ap-secondary" onClick={()=>setExcluded([])}>Restore {excluded.length} excluded recipients</button>}
        <p>Push respects notification preferences and quiet hours. Selected recipients also receive an app-inbox entry.</p>
        {error&&<p role="alert">{error}</p>}<button className="ap-primary" disabled={!current?.ready||audience.loading} onClick={buildReview}>Review broadcast</button><p className="ap-push-held">Sending and test notifications are held pending server authorization review. Previewing does not notify anyone.</p>
      </section></aside></div>
    <section><h2>Recent broadcasts</h2>{history.loading&&<p role="status">Loading history…</p>}{history.error&&<p role="alert">{history.error}</p>}{history.rows?.length===0&&<p>No broadcasts have been recorded.</p>}<ul className="ap-push-history">{history.rows?.map(item=><li key={item.id}><h3>{item.title}</h3><p>{item.body}</p><small>{pushHistoryDate(item.created_at)} SAST · {item.created_by_email}</small><p>{item.recipient_count} recipients · {item.pending} pending · {item.sent} provider accepted · {item.skipped} skipped · {item.failed} failed</p></li>)}</ul><p>Provider acceptance does not confirm that a player opened the message.</p></section>
    {review&&<Dialog title="Review push broadcast" kicker="No notifications sent" onClose={()=>setReview(null)}><div className="ap-push-review"><h3>{review.message.p_title}</h3><p>{review.message.p_body}</p><dl><div><dt>Destination</dt><dd>{review.message.p_path}</dd></div><div><dt>Push recipients</dt><dd>{review.audience.ready}</dd></div><div><dt>App inbox recipients</dt><dd>{review.audience.total}</dd></div></dl><p role="status">This is a review only. Sending remains held; no notification will be queued.</p><button className="ap-secondary" onClick={()=>setReview(null)}>Back to draft</button></div></Dialog>}
  </div>;
}
