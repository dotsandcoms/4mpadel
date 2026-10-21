import {renameSampleData} from './sampleNames';
import {createClient} from '@supabase/supabase-js';
// This dedicated build cannot inherit production credentials from .env files.
export const STAGING_URL = 'https://cefmzkwabdqqoagxhekc.supabase.co';
const publishableKey = 'sb_publishable_GA4Pb_7EOQ8xIDtpOoo3qw_M6vSd38I';
export const supabase = createClient(STAGING_URL, publishableKey, {
    auth:{storageKey:'4m-draw-sandbox-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
    global:{fetch:async(input, init)=>{
        const url=new URL(typeof input==='string' ? input : input.url);
        if(url.origin!==STAGING_URL || !/^\/(auth|rest)\/v1\//.test(url.pathname)) throw new Error('This integration is disabled in the draw sandbox.');
        const response = await fetch(input,init);
        if (!response.ok || !url.pathname.startsWith('/rest/v1/') || !response.headers.get('content-type')?.includes('application/json')) return response;
        const payload = await response.clone().json();
        const headers = new Headers(response.headers); headers.delete('content-length'); headers.delete('content-encoding');
        return new Response(JSON.stringify(renameSampleData(payload)), {status:response.status, statusText:response.statusText, headers});
    }},
});
export const isSupabaseConfigured=()=>true;
