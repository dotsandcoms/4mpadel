
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addAlbumDateColumn() {
  console.log('Adding album_date column to albums table...');
  
  // Using rpc or just a direct query if possible. 
  // Since we don't have a direct SQL execution RPC by default, 
  // we might need to use a trick or just tell the user.
  // However, I can try to use the `supabase.rpc` if there's an 'exec_sql' function.
  
  const { error } = await supabase.rpc('exec_sql', {
    sql_query: 'ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS album_date TIMESTAMPTZ;'
  });

  if (error) {
    if (error.message.includes('function "exec_sql" does not exist')) {
        console.error('exec_sql function does not exist. Please run this SQL in the Supabase SQL Editor:');
        console.log('ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS album_date TIMESTAMPTZ;');
    } else {
        console.error('Error adding column:', error);
    }
  } else {
    console.log('Successfully added album_date column.');
  }
}

addAlbumDateColumn();
