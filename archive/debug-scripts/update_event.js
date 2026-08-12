import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://uzglrpbixubfijvjbtgz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2xycGJpeHViZmlqdmpidGd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MTU4MTQsImV4cCI6MjA4NjE5MTgxNH0.ubHInj40UnMC0yCTwPEH8Bgq8ZcNkqzjusuZb5xZXf4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const slug = 'padel-odyssey-finals';
const eventData = {
    event_name: 'Padel Odyssey Summer Finals',
    slug: 'padel-odyssey-finals',
    event_dates: '7 - 8 February 2026',
    start_date: '2026-02-07',
    start_time: '08:00 AM',
    end_time: '10:00 PM',
    city: 'Johannesburg',
    venue: 'Padel Odyssey',
    address: '38 Bath Avenue, Rosebank',
    sapa_status: 'Major',
    description: 'Padel Odyssey Major Travel Package & Sponsor Gift Bag. The tournament is part of the Padel Odyssey Cup, structured across multiple divisions (Men\'s Pro, Men\'s A, Men\'s B, Ladies A, Ladies Pro, Mixed) based on Playtomic levels (1.0–7.0). The finals follow qualifying events and are played under specific SAPA rankings.',
    organizer_name: 'Padel Odyssey',
    organizer_phone: '',
    organizer_email: '',
    organizer_website: 'www.rankedin.com/en/tournament/63194/padel-odyssey-summer-finals',
    image_url: 'https://rankedin-file-uploads.s3.eu-central-1.amazonaws.com/tournament/63194/cover/1200_300_20241219_103632_78C5389F-8344-4E57-BF69-5C482A0937BB.jpeg'
};

const run = async () => {
    console.log(`Checking for event with slug: ${slug}`);
    const { data: existing, error: fetchError } = await supabase
        .from('calendar')
        .select('*')
        .eq('slug', slug)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        process.exit(1);
    }

    if (existing) {
        console.log('Event found. Updating...');
        const { error: updateError } = await supabase
            .from('calendar')
            .update(eventData)
            .eq('id', existing.id);
        if (updateError) process.exit(1);
        console.log('Update successful.');
    } else {
        console.log('Event not found. Inserting...');
        const { error: insertError } = await supabase
            .from('calendar')
            .insert([eventData]);
        if (insertError) process.exit(1);
        console.log('Insert successful.');
    }
};

run();
