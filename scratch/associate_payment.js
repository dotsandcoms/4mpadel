import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const eventId = 381;
    
    console.log("=== STARTING PAYMENT ASSOCIATION UPDATE ===");

    // 1. Update tournament_participants for Dominic Arendse's Men's intermediate entry
    const participantId = '243287c4-fbd8-4261-bcf8-b2ae8b82bd2f';
    console.log(`Updating tournament_participants entry (${participantId}) to paid...`);
    
    const { data: pResult, error: pError } = await supabase
        .from('tournament_participants')
        .update({
            is_paid: true,
            metadata: {
                payment_method: 'system',
                notes: "Transferred partner payment from Daniel Deutschmann"
            }
        })
        .eq('id', participantId)
        .select();

    if (pError) {
        console.error("Error updating tournament_participants:", pError);
    } else {
        console.log("Successfully updated tournament_participants:", JSON.stringify(pResult, null, 2));
    }

    // 2. Update event_registrations row for Daniel Deutschmann (convert to Dominic's intermediate entry)
    const regIdDaniel = 'd425149a-7512-4c91-8835-77dbf389f34f';
    console.log(`Updating event_registrations entry for Daniel (${regIdDaniel}) to Dominic's Men's intermediate...`);
    
    const { data: rResultDaniel, error: rErrorDaniel } = await supabase
        .from('event_registrations')
        .update({
            full_name: "Dominic Arendse",
            email: "i.am.dcarendse@gmail.com",
            phone: "0623489186",
            partner_name: null,
            division: "Men's intermediate (Guide under 4 Playtomic)",
            payment_status: "paid",
            partner_payment_status: null
        })
        .eq('id', regIdDaniel)
        .select();

    if (rErrorDaniel) {
        console.error("Error updating Daniel's event_registration:", rErrorDaniel);
    } else {
        console.log("Successfully updated Daniel's registration:", JSON.stringify(rResultDaniel, null, 2));
    }

    // 3. Update event_registrations row for Dominic's Men's Advanced registration to remove Daniel as partner
    const regIdDominic = '1cfffdf7-9dc7-413e-a949-eb8dbe0fc983';
    console.log(`Updating event_registrations entry for Dominic (${regIdDominic}) to clear partner...`);
    
    const { data: rResultDominic, error: rErrorDominic } = await supabase
        .from('event_registrations')
        .update({
            partner_name: null,
            partner_payment_status: null
        })
        .eq('id', regIdDominic)
        .select();

    if (rErrorDominic) {
        console.error("Error updating Dominic's event_registration:", rErrorDominic);
    } else {
        console.log("Successfully updated Dominic's registration:", JSON.stringify(rResultDominic, null, 2));
    }
}

run();
