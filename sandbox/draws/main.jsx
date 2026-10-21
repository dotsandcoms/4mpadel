/* eslint-disable react-refresh/only-export-components -- standalone application entry */
import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation} from 'react-router-dom';
import {Toaster} from 'sonner';
import {supabase} from './client';
import NativeDrawManager from '../../src/components/admin/NativeDrawManager';
import NativeTournamentDraw from '../../src/pages/NativeTournamentDraw';
import '../../src/index.css';
const allowed=['brad@dotsandcoms.co.za','markstillerman@gmail.com'];
function App(){
 const {pathname}=useLocation();
 const [session,setSession]=useState(null),[ready,setReady]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[signup,setSignup]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{supabase.auth.getSession().then(({data,error})=>{setSession(data?.session);setError(error?.message||'');setReady(true);});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>subscription.unsubscribe();},[]);
 const userId=session?.user?.id;
 useEffect(()=>{let active=true;setData(null);if(!userId)return;supabase.rpc('get_draw_sandbox').then(({data,error})=>{if(active){setData(data);setError(error?.message||'');}});return()=>{active=false;};},[userId]);
 async function login(event){event.preventDefault();setError('');setMessage('');if(!allowed.includes(email.trim().toLowerCase())){setError('Use one of the two approved sandbox email addresses.');return;}setBusy(true);try{const credentials={email:email.trim().toLowerCase(),password};const {error}=signup?await supabase.auth.signUp({...credentials,options:{emailRedirectTo:window.location.origin}}):await supabase.auth.signInWithPassword(credentials);if(error)throw error;if(signup)setMessage('Check your email to confirm your sandbox account, then sign in here.');}catch(e){setError(e.message);}finally{setBusy(false);setPassword('');}}
 const playersByEmail=useMemo(()=>new Map((data?.registrations||[]).flatMap(r=>[[r.email,{name:r.full_name,license_type:'full',paid_registration:true}],[r.partner_email,{name:r.partner_name,license_type:'full',paid_registration:true}]]).filter(([email])=>email)),[data]);
 const expandTestCount=async(divisionId,count)=>{const {data:rows,error}=await supabase.rpc('expand_draw_sandbox',{p_division_id:divisionId,p_count:count});if(error)throw error;setData(current=>({...current,registrations:rows}));};
 const restartDivision=async(divisionId)=>{
  if(!data?.divisions.some(d=>d.id===divisionId))throw new Error('Choose a sandbox division.');
  const {data:draws,error:readError}=await supabase.from('draws').select('id').eq('event_id',data.event.id).eq('division_id',divisionId);
  if(readError)throw readError;
  if(!draws?.length)throw new Error('No saved draw found. Refresh and try again.');
  const {data:removed,error}=await supabase.from('draws').delete().eq('event_id',data.event.id).eq('division_id',divisionId).in('id',draws.map(d=>d.id)).select('id');
  if(error)throw error;
  if(removed?.length!==draws.length)throw new Error('The draw could not be fully restarted. Refresh before trying again.');
 };
 const input='mt-2 w-full rounded-xl border border-white/20 bg-black p-3 text-white';
 return <main className="mx-auto max-w-7xl p-4 sm:p-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/50 bg-amber-300/10 p-4"><div><p className="font-bold text-amber-200">Draw sandbox · Test data only</p><p className="mt-1 text-sm text-gray-300">Shared sample competitions. Publishing here never changes live events.</p></div>{session&&<button onClick={()=>supabase.auth.signOut()} className="rounded-lg border border-white/20 px-4 py-2 text-white">Sign out</button>}</div>
 {error&&<p role="alert" className="mb-4 rounded-xl border border-red-300/50 bg-red-300/10 p-4 text-red-200">{error}</p>}
 {!ready?<p className="text-white">Loading…</p>:!session?<form onSubmit={login} className="mx-auto max-w-md space-y-5 rounded-2xl border border-white/15 bg-[#111] p-6"><h1 className="text-2xl font-bold text-white">{signup?'Create your sandbox login':'Sign in to the draw sandbox'}</h1><p className="text-sm text-gray-400">Use your separate test account. Your live 4M Padel login is unchanged.</p><label className="block text-sm text-gray-200">Email<input autoComplete="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} className={input}/></label><label className="block text-sm text-gray-200">Password<input type="password" autoComplete={signup?'new-password':'current-password'} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} className={input}/></label><button disabled={busy} className="w-full rounded-xl bg-padel-green p-3 font-bold text-black disabled:opacity-50">{busy?'Please wait…':signup?'Create test account':'Sign in'}</button><button type="button" onClick={()=>{setSignup(!signup);setError('');}} className="text-sm text-sky-200 underline">{signup?'Already registered? Sign in':'First visit? Create your test account'}</button>{message&&<p role="status" className="text-sm text-sky-200">{message}</p>}</form>:!data?<p className="text-gray-300">Loading sample competition…</p>:pathname.startsWith('/native-draws/')||pathname.startsWith('/draws-preview/')?<NativeTournamentDraw event={data.event} preview={pathname.startsWith('/draws-preview/')}/>:<><p className="mb-5 text-sm text-gray-400">Choose your test size in Players. Extra sample entries are created when needed, up to 256 per division. Sample players have simulated full licences. You and your partner share the saved draws.</p><NativeDrawManager sandboxTesting onRestartSandbox={restartDivision} onExpandTestCount={expandTestCount} event={data.event} divisions={data.divisions} registrations={data.registrations} playersByEmail={playersByEmail}/></>}
 <Toaster/></main>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);
