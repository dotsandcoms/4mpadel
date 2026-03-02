/**
 * Run a quick Supabase connection test and log results to console.
 * Helps debug "data not pulling through" issues.
 */
export async function runSupabaseDiagnostics(supabase) {
  const hasUrl = Boolean(import.meta.env.VITE_SUPABASE_URL);
  const hasKey = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY);

  console.group('🔌 Supabase connection check');
  console.log('Env VITE_SUPABASE_URL set:', hasUrl);
  console.log('Env VITE_SUPABASE_ANON_KEY set:', hasKey);

  if (!hasUrl || !hasKey) {
    console.error('❌ Missing env vars! Add in Vercel → Settings → Environment Variables:');
    console.error('   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
    console.error('Names must start with VITE_. Redeploy after adding.');
    console.groupEnd();
    return;
  }

  try {
    const { data, error } = await supabase.from('calendar').select('id').limit(1);
    if (error) {
      console.error('❌ Calendar fetch failed:', error.message, error.code, error.details);
    } else {
      console.log('✅ Calendar connected. Row count:', data?.length ?? 0);
    }
  } catch (err) {
    console.error('❌ Supabase error:', err);
  }
  console.groupEnd();
}
