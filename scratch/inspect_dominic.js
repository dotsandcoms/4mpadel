import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const eventId = 381;
    const email = 'i.am.dcarendse@gmail.com';
    const namePart1 = 'Dominic Arendse';
    const namePart2 = 'Daniel Deutschmann';

    console.log("=== 1. TOURNAMENT PARTICIPANTS ===");
    const { data: participants, error: pError } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('event_id', eventId);
    
    if (pError) console.error("Error fetching participants:", pError);
    else {
        const filtered = participants.filter(p => 
            (p.email && p.email.toLowerCase().includes('dcarendse')) ||
            (p.full_name && p.full_name.toLowerCase().includes('arendse')) ||
            (p.full_name && p.full_name.toLowerCase().includes('deutschmann'))
        );
        console.log("Filtered participants:", JSON.stringify(filtered, null, 2));
    }

    console.log("=== 2. EVENT REGISTRATIONS ===");
    const { data: registrations, error: rError } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', eventId);

    if (rError) console.error("Error fetching registrations:", rError);
    else {
        const filtered = registrations.filter(r => 
            (r.email && r.email.toLowerCase().includes('dcarendse')) ||
            (r.full_name && r.full_name.toLowerCase().includes('arendse')) ||
            (r.full_name && r.full_name.toLowerCase().includes('deutschmann'))
        );
        console.log("Filtered registrations:", JSON.stringify(filtered, null, 2));
    }

    console.log("=== 3. PAYMENTS ===");
    const { data: payments, error: payError } = await supabase
        .from('payments')
        .select('*')
        .eq('event_id', eventId);

    if (payError) console.error("Error fetching payments:", payError);
    else {
        const filtered = payments.filter(p => 
            (p.metadata && JSON.stringify(p.metadata).toLowerCase().includes('dcarendse')) ||
            (p.payment_reference && p.payment_reference.includes('REGEV-381-1782087507618'))
        );
        console.log("Filtered payments:", JSON.stringify(filtered, null, 2));
    }
}

run();
