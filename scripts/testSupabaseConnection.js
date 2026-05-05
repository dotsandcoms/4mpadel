#!/usr/bin/env node
/**
 * Test Supabase connection - run: node scripts/testSupabaseConnection.js
 * Loads .env automatically, or pass: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/testSupabaseConnection.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY;

if (!url || !key) {
  console.error('❌ Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env or as env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

async function test() {
  console.log('Testing Supabase connection...');
  const { data, error } = await supabase.from('calendar').select('id, event_name').limit(3);
  if (error) {
    console.error('❌ Error:', error.message, '\nCode:', error.code);
    process.exit(1);
  }
  console.log('✅ Connected! Sample events:', data?.length ?? 0);
  data?.forEach((r, i) => console.log(`  ${i + 1}. ${r.event_name}`));
}

test();
