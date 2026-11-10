import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { createSummaryHandler } from './handler.mjs';
import { buildFinanceOverviewSummaries } from './summary.mjs';

const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
Deno.serve(createSummaryHandler({ createClient,
    url: Deno.env.get('SUPABASE_URL') || '', key: publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY') || '',
    summarize: buildFinanceOverviewSummaries,
    reportError: (stage, error) => console.error(stage, error?.code || '', error?.message || ''),
}));
