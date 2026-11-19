import React,{useEffect,useRef,useState} from 'react';
import {supabase} from '../../supabaseClient';
import SearchableDropdown from '../../components/SearchableDropdown';
import {currentLicenseYear,licenseStartDate,licenseLabel,licenseDate,licenseTimestamp,licenseMoney,licenseSource,readLicenseRpc,loadLicenseOptions,listLicenseArgs,fullLicensePrice,licenseReviewPayload,exportLicenseRegister,licenseCsvCell,writeLicenseReview} from './licenseData';
import { coverageStatus, groupLicensePayments } from '../../utils/licenseReporting';
import { hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';
import { LicenceFederationExport, LicenceSalesOverview } from './PreviewLicenceSales';
import './LicensesWorkspace.css';

function Field({label,children}){return <label className="lw-field"><span>{label}</span>{children}</label>;}
function Select({label,value,onChange,options}){return <Field label={label}><SearchableDropdown value={value} onChange={e=>onChange(e.target.value)}>{options.map(([id,title])=><option key={id} value={id}>{title}</option>)}</SearchableDropdown></Field>;}
function Table({headers,children,label}){return <div className="lw-scroll"><table aria-label={label}><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;}
function Status({value}){return <span className={`lw-status lw-status-${value}`}>{value||'Unknown'}</span>;}
function Purchased({row}){return <>{licenseDate(row.source==='complimentary'?row.granted_on:row.purchased_on)}<small>{row.source==='complimentary'?'Complimentary grant':!row.purchased_on?'Payment match needed':''}</small></>;}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
function Review({ value, onBack, onConfirm }) {
  const [status, setStatus] = useState({});
  const pending = useRef(false);
  const confirm = async () => {
    if (pending.current) return;
    pending.current = true;
    setStatus({ busy: true });
    try {
      await onConfirm(value);
    } catch (error) {
      setStatus({ error: error.message || 'Could not save the licence change.' });
    } finally {
      pending.current = false;
    }
  };
  return <section className="lw-review" aria-busy={status.busy}>
    <h3>Confirm licence change</h3>
    <dl>{Object.entries(value.p_input).map(([key,val])=><React.Fragment key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{String(val??'None')}</dd></React.Fragment>)}</dl>
    {status.error && <p role="alert">{status.error}</p>}
    <div className="lw-actions">
      <button type="button" className="ap-secondary" disabled={status.busy} onClick={onBack}>Back to editing</button>
      <button type="button" className="ap-primary" disabled={status.busy} onClick={confirm}>{status.busy ? 'Saving…' : 'Confirm and save'}</button>
    </div>
  </section>;
}
function ChangeForm({action,row,player,options,onClose,onConfirm}){
  const offered = options.seasons.filter(season => !season.archived_at);
  const [form,setForm]=useState(()=>{
    const year = offered.find(season => Number(season.year) === currentLicenseYear())?.year || offered[0]?.year || '';
    return { license_type: row?.license_type || 'full', year, event_id: '', source: 'manual', amount: fullLicensePrice(player.licenses || [], offered, year), payment_method: 'eft', receipt: '', reason: '' };
  });
  const [review,setReview]=useState(null),[error,setError]=useState('');
  const patch=p=>setForm(f=>({...f,...p}));
  const price=year=>fullLicensePrice(player.licenses||[],options.seasons,year);
  return <aside className="lw-editor"><header className="lw-actions"><h3>{action==='grant'?'Add licence':action==='revoke'?'Revoke coverage':'Restore coverage'}</h3><button className="ap-secondary" onClick={onClose} disabled={Boolean(review)}>Close editor</button></header>{row&&<p>{licenseLabel(row)}</p>}{review?<Review value={review} onBack={()=>setReview(null)} onConfirm={onConfirm}/>:<form onSubmit={e=>{e.preventDefault();try{setReview(licenseReviewPayload(action,form,player.player_id||player.id,row));}catch(err){setError(err.message);}}}>
    {action==='grant'&&<div className="lw-fields"><Select label="Licence type" value={form.license_type} onChange={value=>patch({license_type:value,amount:value==='temporary'?Number(options.config.temp_license_price??120):price(form.year)})} options={ [['full','Full annual'],['temporary','Temporary event']] }/>
    {form.license_type==='full'?<Select label="Calendar year" value={form.year} onChange={year=>patch({year:Number(year),amount:price(year)})} options={offered.length ? offered.map(season => [season.year, String(season.year)]) : [['', 'No years offered']]}/>:<Field label="Event"><SearchableDropdown required value={form.event_id} onChange={e=>patch({event_id:e.target.value})}><option value="">Select event</option>{options.events.map(e=><option key={e.id} value={e.id}>{e.event_name}</option>)}</SearchableDropdown></Field>}
    <Select label="Source" value={form.source} onChange={source=>patch({source})} options={ [['manual','Manual payment received'],['complimentary','Complimentary']] }/>
    {form.source==='manual'&&<><Field label="Amount (R)"><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>patch({amount:e.target.value})}/></Field><Select label="Method" value={form.payment_method} onChange={payment_method=>patch({payment_method})} options={ [['eft','EFT'],['cash','Cash']] }/><Field label="Receipt / bank reference"><input value={form.receipt} onChange={e=>patch({receipt:e.target.value})}/></Field></>}
    </div>}
    <Field label="Reason for change"><textarea required value={form.reason} onChange={e=>patch({reason:e.target.value})}/></Field>{action==='revoke'&&<p>Revocation keeps payment history; it does not refund money. Refunds are handled in Finance.</p>}{error&&<p role="alert">{error}</p>}<button className="ap-primary" disabled={action==='grant' && form.license_type==='full' && !form.year}>Review {action==='grant'?'licence':action}</button>
  </form>}</aside>;
}
function PlayerPanel({data,options,onBack,onConfirm}){const [editor,setEditor]=useState(null);return <>
  <button className="ap-secondary" onClick={onBack}>All licences</button><header className="lw-actions"><div><h2>{data.name}</h2><p>{data.email}</p><strong>{data.license_number||'No licence number yet'}</strong></div><button className="ap-primary" onClick={()=>setEditor({action:'grant'})}>Add licence — review</button></header>
  {editor&&<ChangeForm key={`${editor.action}-${editor.row?.id||''}`} {...editor} player={data} options={options} onClose={()=>setEditor(null)} onConfirm={onConfirm}/>}
  <section><h3>Coverage</h3><Table label="Player licence coverage" headers={['Licence','Purchased / granted','Coverage','Status','Review action']}>{(data.licenses||[]).map(row=><tr key={row.id}><td>{licenseLabel(row)}<small>{licenseSource(row.source)}</small></td><td><Purchased row={row}/></td><td>{licenseDate(licenseStartDate(row))}<small>to {licenseDate(row.ends_on)}</small></td><td><Status value={coverageStatus(row)}/></td><td><button className="ap-secondary" onClick={()=>setEditor({action:row.status==='revoked'?'restore':'revoke',row})}>{row.status==='revoked'?'Restore':'Revoke'} — review</button></td></tr>)}</Table>{!data.licenses?.length&&<p>No licences on file.</p>}</section>
  <section><h3>Licence payments</h3><Table label="Licence payments" headers={['Paid / recorded','Payment','Method','Amount','Status']}>{groupLicensePayments(data.payments).map(p=><tr key={p.id}><td>{licenseTimestamp(p.created_at)}</td><td>{p.bundled?'Event checkout with licence':p.payment_type==='temp_license'?'Temporary licence':'Full licence'}{p.license_year?` · ${p.license_year}`:''}{p.is_test&&<strong> · Test</strong>}<small>{p.reference||p.id}</small><small>{p.event_name}</small><small>{p.linked?'Linked to licence':'Historical payment record'}</small></td><td>{p.payment_method||'—'}</td><td>{licenseMoney(p.amount,p.currency||'ZAR')}{p.bundled&&<small>Checkout total</small>}{p.allocations.length>0&&<details><summary>Licence allocations</summary>{p.allocations.map(child=><small key={child.id}>{child.reference||child.id} · {licenseMoney(child.amount,child.currency||'ZAR')} · {child.status}</small>)}</details>}</td><td><Status value={p.status}/></td></tr>)}</Table>{!data.payments?.length&&<p>No licence payments found.</p>}<p>All matching records are shown, including failed, test and historical payments. Splits or duplicates do not issue extra coverage.</p></section>
  <details><summary>Change history ({data.history?.length||0})</summary>{(data.history||[]).map(h=><article className="lw-history" key={h.id}><strong>{h.action?.replaceAll('_',' ')}</strong><p>{h.reason}</p><small>{h.actor_email||'System'} · {licenseTimestamp(h.created_at)}</small></article>)}</details>
  </>;}
function Settings({options,onConfirm}){
  const [seasons,setSeasons]=useState(options.seasons),[temp,setTemp]=useState({price:options.config.temp_license_price??120,sales_open:options.config.temp_license_enabled??true}),[reason,setReason]=useState(''),[year,setYear]=useState(currentLicenseYear()+2),[review,setReview]=useState(null),[error,setError]=useState('');
  const edit=(index,key,value)=>setSeasons(rows=>rows.map((s,i)=>i===index?{...s,[key]:value}:s));
  const preview=(action,input)=>{
    setError('');
    try { setReview(licenseReviewPayload(action,{...input,reason})); }
    catch (failure) { setError(failure.message); }
  };
  if(review)return <Review value={review} onBack={()=>setReview(null)} onConfirm={onConfirm}/>;
  return <section><h2>Sales and prices</h2><p>New Full and renewal prices are separate. Renewals are for previous Full holders. Coverage starts on purchase or the configured date, whichever is later.</p><Field label="Reason for settings changes"><input value={reason} onChange={e=>setReason(e.target.value)}/></Field>
    {error&&<p role="alert">{error}</p>}
    {seasons.map((s,i)=>s.archived_at ? null : <section className="lw-editor" key={s.year}><h3>{s.year} Full</h3><div className="lw-fields">{[['price','New Full (R)','number'],['renewal_price','Renewal (R)','number'],['coverage_starts_on','Coverage can start from','date']].map(([key,label,type])=><Field key={key} label={label}><input type={type} min={type==='number'?'0.01':undefined} step={type==='number'?'0.01':undefined} value={s[key]??(key==='renewal_price'?500:`${s.year}-01-01`)} onChange={e=>edit(i,key,e.target.value)}/></Field>)}<label className="lw-check"><input type="checkbox" checked={!!s.sales_open} onChange={e=>edit(i,'sales_open',e.target.checked)}/>Open for purchases</label></div><button className="ap-secondary" disabled={!reason.trim()} onClick={()=>preview('save_season',s)}>Review {s.year} settings</button> <button type="button" className="ap-secondary" disabled={!reason.trim()} onClick={()=>preview('archive_season',{year:s.year})}>Remove {s.year} from offerings</button></section>)}
    <div className="lw-actions"><Field label="Add calendar year"><input type="number" min="2026" max="2200" value={year} onChange={e=>setYear(Number(e.target.value))}/></Field><button className="ap-secondary" disabled={!reason.trim()||year<2026||year>2200||seasons.some(s=>Number(s.year)===year)} onClick={()=>preview('save_season',{year,price:650,renewal_price:500,coverage_starts_on:`${year}-01-01`,sales_open:false})}>Review new year</button><p>New years start with sales closed.</p></div>
    {seasons.some(s=>s.archived_at)&&<details><summary>Removed licence years</summary>{seasons.filter(s=>s.archived_at).map(s=><div className="lw-actions" key={s.year}><span>{s.year} Full · existing coverage retained</span><button type="button" className="ap-secondary" disabled={!reason.trim()} onClick={()=>preview('restore_season',{year:s.year})}>Restore {s.year} offering</button></div>)}</details>}
    <section className="lw-editor"><h3>Temporary event</h3><div className="lw-fields"><Field label="Price (R)"><input type="number" min="0.01" step="0.01" value={temp.price} onChange={e=>setTemp(t=>({...t,price:e.target.value}))}/></Field><label className="lw-check"><input type="checkbox" checked={!!temp.sales_open} onChange={e=>setTemp(t=>({...t,sales_open:e.target.checked}))}/>Open for purchases</label></div><button className="ap-secondary" disabled={!reason.trim()} onClick={()=>preview('save_temporary',temp)}>Review temporary settings</button></section>
  </section>;
}
function Sales({read}){
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[metric,setMetric]=useState('sold'),[state,setState]=useState({loading:true});
  useEffect(()=>{let live=true;const timer=setTimeout(()=>{setState({loading:true});read('temporary_license_sales_report',{p_from:from||null,p_to:to||null}).then(report=>{if(live)setState({report});}).catch(e=>{if(live)setState({error:e.message});});},200);return()=>{live=false;clearTimeout(timer);};},[from,to,read]);
  const report=state.report;
  return <section><header className="lw-actions"><div><h2>Temporary licence sales over time</h2><p>One paid licence per player, per event. Multiple divisions and split payments count once.</p></div><button className="ap-secondary" disabled={!report} onClick={()=>download('\uFEFF'+[['Month','Paid temporary licences','Cumulative paid licences','With completed refunds','Complimentary'],...(report.series||[]).map(r=>[r.month,r.sold,r.cumulative,r.refunded,r.complimentary])].map(r=>r.map(licenseCsvCell).join(',')).join('\r\n'),'4M-temporary-license-sales.csv')}>Export monthly sales</button></header>
    <div className="lw-filters"><Field label="From"><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field label="To"><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></Field><button className="ap-secondary" onClick={()=>{setFrom('');setTo('');}}>All time</button><Select label="Chart" value={metric} onChange={setMetric} options={ [['sold','Monthly paid licences'],['cumulative','Cumulative paid licences']] }/></div>
    {state.loading&&<p role="status">Loading sales history…</p>}{state.error&&<p role="alert">{state.error}</p>}{report&&<><div className="lw-counts">{[['All-time sold',report.all_time_sold],['Sold in date range',report.sold],['With completed refunds',report.refunded],['Complimentary in range',report.complimentary]].map(([label,value])=><div key={label}><small>{label}</small><strong>{Number(value||0).toLocaleString('en-ZA')}</strong></div>)}</div>
    <div className="lw-chart" aria-label={metric==='sold'?'Monthly paid licences':'Cumulative paid licences'}>{(report.series||[]).map(row=><div key={row.month}><span>{licenseDate(row.month)}</span><meter min="0" max={Math.max(1,...report.series.map(r=>Number(r[metric])||0))} value={row[metric]}/><strong>{row[metric]}</strong></div>)}</div>
    <Table label="Monthly temporary sales" headers={['Month','Sold','Cumulative','Refunded','Complimentary']}>{(report.series||[]).map(r=><tr key={r.month}><td>{licenseDate(r.month)}</td>{['sold','cumulative','refunded','complimentary'].map(k=><td key={k}>{r[k]}</td>)}</tr>)}</Table>
    <p>Paid sales use successful, non-test payments and South African dates. Refunded licences remain in gross sales, shown separately against their original month. Complimentary grants are excluded from paid sales.</p><p>{report.legacy_without_payment||0} legacy player/event records without matching payment evidence excluded. {report.unattributed||0} paid records have incomplete player/event details.</p></>}
  </section>;
}

function LicenseWorkspaceContent({session,permissions,scopeId='all',client=supabase,refreshRevision=0,initialPlayerId=null}){
  const [tab,setTab]=useState('register'),[playerId,setPlayerId]=useState(initialPlayerId),[filters,setFilters]=useState(()=>({year:String(currentLicenseYear()),type:'',status:'',source:'',search:'',purchase_year:'',renewed_from_year:'',page:0,page_size:50})),[state,setState]=useState({loading:true}),[options,setOptions]=useState(null),[player,setPlayer]=useState(null),[lookup,setLookup]=useState(''),[found,setFound]=useState([]),[exporting,setExporting]=useState(false),[retry,setRetry]=useState(0);
  const [salesYear,setSalesYear]=useState(String(currentLicenseYear()));
  const [showExport,setShowExport]=useState(false),[notice,setNotice]=useState('');
  const userId=session?.user?.id,context=JSON.stringify([userId,scopeId,permissions]),identity=useRef({});
  const read=React.useCallback((name,args,signal)=>readLicenseRpc(client,{user:{id:userId}},scopeId,name,args,signal),[client,userId,scopeId]);
  useEffect(()=>{const controller=new AbortController();const token={signal:controller.signal};identity.current=token;setOptions(null);setPlayer(null);setFound([]);setState({loading:true});loadLicenseOptions(client,{user:{id:userId}},scopeId,controller.signal).then(data=>{if(!controller.signal.aborted)setOptions(data);}).catch(e=>{if(!controller.signal.aborted)setState({error:e.message});});return()=>{controller.abort();identity.current={};};},[client,userId,scopeId,context,refreshRevision,retry]);
  useEffect(()=>{if(!options)return;let live=true;setState({loading:true});const timer=setTimeout(()=>read('manage_license',listLicenseArgs(filters)).then(result=>{if(live)setState({result});}).catch(e=>{if(live)setState({error:e.message});}),200);return()=>{live=false;clearTimeout(timer);};},[read,options,filters]);
  useEffect(()=>{setPlayer(null);if(!playerId||!options)return;let live=true;read('get_player_licenses',{p_player_id:Number(playerId)}).then(data=>{if(live)setPlayer(data?{...data,player_id:Number(playerId)}:{error:'Player not found.'});}).catch(e=>{if(live)setPlayer({error:e.message});});return()=>{live=false;};},[playerId,read,options]);
  useEffect(()=>{setFound([]);if(lookup.trim().length<2)return;let live=true;const timer=setTimeout(()=>read('manage_license',{p_action:'players',p_input:{search:lookup.trim()}}).then(rows=>{if(live)setFound(rows||[]);}).catch(e=>{if(live)setState(s=>({...s,error:e.message}));}),250);return()=>{live=false;clearTimeout(timer);};},[lookup,read]);
  useEffect(()=>{setPlayerId(initialPlayerId);},[initialPlayerId]);
  const patch=change=>setFilters(f=>({
    ...f,...change,
    ...('year' in change && !('renewed_from_year' in change) ? { renewed_from_year:'' } : {}),
    ...('type' in change && change.type!=='renewal' ? { renewed_from_year:'' } : {}), page:0,
  }));
  const applyCohort = change => {
    patch({ year:'', type:'', status:'', source:'', search:'', purchase_year:'', renewed_from_year:'', ...change });
    setTab('register');
  };
  const saveReview = async value => {
    const token = identity.current;
    await writeLicenseReview(client, session, scopeId, value, token.signal);
    if (identity.current !== token) return;
    setNotice('Licence changes saved.');
    setRetry(n => n + 1);
  };
  const exportToken = identity.current;
  const salesYears = [...new Set([currentLicenseYear(), ...(options?.seasons || []).map(row => Number(row.year))])].sort((a,b)=>b-a);
  const exportCsv=async()=>{const token=identity.current;setExporting(true);try{const csv=await exportLicenseRegister(client,session,scopeId,filters);if(identity.current===token)download(csv,'4M-licenses.csv');}catch(e){if(identity.current===token)setState(s=>({...s,error:e.message}));}finally{if(identity.current===token)setExporting(false);}};
  const result=state.result;
  return <section className="lw-root"><header className="lw-actions"><div><p className="ap-kicker">Players / Licences</p><h1>Licences</h1><p>Player coverage and payment records</p></div>{!playerId&&<div className="lw-actions"><button className="ap-secondary" disabled={exporting||!result} onClick={exportCsv}>{exporting?'Exporting…':'Export CSV'}</button><button className="ap-secondary" disabled={!options} aria-expanded={showExport} onClick={()=>setShowExport(value=>!value)}>Export Excel</button><button className="ap-secondary" disabled={!options} onClick={()=>setRetry(n=>n+1)}>Refresh licences</button></div>}</header>
    {notice&&<p role="status">{notice}</p>}
    {showExport&&options&&<LicenceFederationExport read={read} year={salesYear} seasons={options.seasons} isCurrent={()=>identity.current===exportToken} onClose={()=>setShowExport(false)}/>}
    {state.error&&<p role="alert">{state.error} <button className="ap-secondary" onClick={()=>setRetry(n=>n+1)}>Retry authorised load</button></p>}
    {!options?<p role="status">{state.error?'Licence data unavailable.':'Loading authorised licence records…'}</p>:playerId?player?.error?<p role="alert">{player.error}<button className="ap-secondary" onClick={()=>setPlayerId(null)}>All licences</button></p>:player?<PlayerPanel key={`${context}-${playerId}-${refreshRevision}`} data={player} options={options} onBack={()=>setPlayerId(null)} onConfirm={saveReview}/>:<p role="status">Loading player licences…</p>:<>
    <nav className="lw-tabs" aria-label="Licence management">{[['overview','Overview'],['register','Register'],['sales','Temporary sales history'],['settings','Sales and prices']].map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='overview'?<LicenceSalesOverview key={retry} read={read} years={salesYears} year={salesYear} onYearChange={setSalesYear} onRegister={applyCohort} onTemporary={()=>setTab('sales')} download={download}/>:tab==='settings'?<Settings key={`${context}-${refreshRevision}-${retry}`} options={options} onConfirm={saveReview}/>:tab==='sales'?<Sales read={read}/>:<><div className="lw-counts"><div><small>{filters.year||'All years'} licences</small><strong>{result?.total??'—'}</strong></div>{['active','upcoming','expired','revoked'].map(s=><div key={s}><small>{s}</small><strong>{result?.counts?.[s]??'—'}</strong></div>)}</div>
    <div className="lw-sales-cards" aria-label="Current licence breakdown">{[
      ['total','Current licences',''],['full','Full licences','full'],['temporary','Temporary licences','temporary'],['renewals','Renewed Full','renewal'],
    ].map(([key,label,type])=><button type="button" key={key} className="ap-secondary" onClick={()=>applyCohort({ type, status:'current' })}><span>{label}</span><strong>{result?.current_counts?.[key]??'—'}</strong></button>)}</div>
    <div className="lw-filters"><Field label="Search register"><input value={filters.search} placeholder="Name, email or licence number…" onChange={e=>patch({search:e.target.value})}/></Field>{[
      ['year','Year',[['','All years'],...options.seasons.map(s=>[String(s.year),String(s.year)])]],['purchase_year','Bought in',[['','All years'],...salesYears.map(year=>[String(year),String(year)])]],['type','Type',[['','All types'],['full','Full'],['paid_full','Paid Full sales'],['new_full','New Full sales'],['temporary','Temporary'],['renewal','Full renewals']]],['status','Status',[['','All statuses'],['current','Current · including upcoming'],...['active','upcoming','expired','revoked'].map(s=>[s,s])]],['source','Payment source',[['','All sources'],...['payment','manual','complimentary','legacy'].map(s=>[s,licenseSource(s)])]]
    ].map(([key,label,choices])=><Select key={key} label={label} value={filters[key]} onChange={value=>patch({[key]:value})} options={choices}/>)}</div>
    {(filters.purchase_year||filters.renewed_from_year)&&<div className="lw-actions">{filters.renewed_from_year&&<p>Renewed from {filters.renewed_from_year}</p>}<button type="button" className="ap-secondary" onClick={()=>patch({purchase_year:'',renewed_from_year:''})}>Clear purchase filters</button></div>}
    <Table label="Licence register" headers={['Player','Licence','Licence year','Purchased','Coverage','Status','Source']}>{(result?.rows||[]).map(row=><tr key={row.id} onClick={e=>{if(!e.target.closest('button,a'))setPlayerId(row.player_id);}}><td><button className="lw-player" onClick={()=>setPlayerId(row.player_id)}>{row.name}</button><small>{row.email}</small><small>{row.license_number}</small></td><td>{licenseLabel(row)}{row.is_renewal&&<small>{row.renewed_from_year?`Renewed from ${row.renewed_from_year}`:'Full renewal'}</small>}</td><td>{row.season_year||'Not recorded'}</td><td><Purchased row={row}/></td><td>{licenseDate(licenseStartDate(row))}<small>to {licenseDate(row.ends_on)}</small></td><td><Status value={row.status}/></td><td>{licenseSource(row.source)}</td></tr>)}</Table>{!result?.rows?.length&&<p role="status">{state.loading?'Loading register…':'No licences match these filters.'}</p>}
    <footer className="lw-actions"><span>{result?.total?`${filters.page*filters.page_size+1}–${Math.min((filters.page+1)*filters.page_size,result.total)} of ${result.total}`:'0 licences'}</span><Select label="Rows per page" value={String(filters.page_size)} onChange={pageSize=>patch({page_size:Number(pageSize)})} options={[10,25,50].map(size=>[String(size),String(size)])}/><div className="lw-actions"><button className="ap-secondary" disabled={!filters.page||state.loading} onClick={()=>setFilters(f=>({...f,page:f.page-1}))}>Previous</button><span>Page {filters.page+1}</span><button className="ap-secondary" disabled={!result||(filters.page+1)*filters.page_size>=result.total||state.loading} onClick={()=>setFilters(f=>({...f,page:f.page+1}))}>Next</button></div></footer>
    <section><h2>Find any player</h2><p>Including players without a licence.</p><Field label="Player name, email or licence number"><input value={lookup} onChange={e=>setLookup(e.target.value)} placeholder="Type at least 2 characters…"/></Field>{found.map(p=><button className="lw-result" key={p.id} onClick={()=>setPlayerId(p.id)}>{p.name}<small>{p.email}</small></button>)}</section>
    {!!result?.reviews?.length&&<details><summary>Payments needing review ({result.reviews.length})</summary>{result.reviews.map((r,i)=><button className="lw-result" key={i} onClick={()=>setPlayerId(r.player_id)}>{r.name}<small>{r.reason}</small></button>)}</details>}
    </>}
    </>}
  </section>;
}

// Remove private rows and in-progress reviews synchronously on account/scope/grant
// changes rather than displaying the previous account until an effect runs.
export default function LicensesWorkspace(props){
  const [identity,setIdentity]=useState({client:props.client,version:0});
  if(identity.client!==props.client){setIdentity({client:props.client,version:identity.version+1});return null;}
  const platform = props.permissions?.role === 'super_admin';
  const standalone = !hasTenantMembership(props.permissions) && props.permissions?.allowed_tabs?.includes('licenses');
  if (!props.session?.user?.id || (props.scopeId && props.scopeId !== 'all') || !(platform || standalone)) {
    return <section className="lw-root"><h1>Licences</h1><p>Platform Licences access is required.</p></section>;
  }
  return <LicenseWorkspaceContent key={JSON.stringify([props.session.user.id,props.scopeId,props.permissions,identity.version])} {...props}/>;
}
