
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function simulateSync() {
    const email = 'faiyaad.rawat@gmail.com';
    const trx = {
        id: 'REGEV-299-1778744080092',
        user: email,
        amount: 'R 770.00',
        rawDate: '2026-05-14T07:34:58.000Z',
        metadata: null
    };

    console.log("--- Simulating Sync for Faiyaad ---");
    const amount = parseFloat(trx.amount.replace('R ', '').replace(',', ''));
    console.log("Parsed Amount:", amount);

    const { data: player } = await supabase.from('players').select('*').ilike('email', email).maybeSingle();
    console.log("Player:", player.id, "Paid Reg:", player.paid_registration);

    const { data: eventData } = await supabase.from('calendar').select('*').eq('id', 299).maybeSingle();
    console.log("Event Fee:", eventData.entry_fee);

    const { data: participants } = await supabase.from('tournament_participants').select('*').eq('event_id', 299).eq('profile_id', player.id);
    console.log("Participants Found:", participants.length);
    participants.forEach(p => console.log(" - Division:", p.class_name, "ID:", p.id));

    const { data: intentData } = await supabase.from('event_registrations').select('*').eq('event_id', 299).ilike('email', email).eq('payment_status', 'paid');
    console.log("Intent Data (Paid Regs):", intentData.length);

    // Simulation of Greedy Logic
    let licensePortion = 0;
    let licenseType = null;
    const needsLicense = !player.paid_registration;
    
    let totalExpectedEntryFees = 0;
    participants.forEach(p => {
        const fee = eventData.category_fees?.[p.class_name] || eventData.entry_fee || 0;
        totalExpectedEntryFees += fee;
    });
    console.log("Total Expected Entry Fees:", totalExpectedEntryFees);

    if (needsLicense) {
        if (amount === 770 || (amount > 120 && amount < totalExpectedEntryFees)) {
            licensePortion = 120;
            licenseType = 'temporary';
        }
    }
    console.log("Detected License Portion:", licensePortion);

    const entryFeePortion = amount - licensePortion;
    console.log("Entry Fee Portion:", entryFeePortion);

    let runningEntryTotal = 0;
    const coveredParticipants = [];
    for (const p of participants) {
        const fee = eventData.category_fees?.[p.class_name] || eventData.entry_fee || 0;
        if (runningEntryTotal + fee <= entryFeePortion + 5) {
            runningEntryTotal += fee;
            coveredParticipants.push(p);
        }
    }
    console.log("Covered Participants count:", coveredParticipants.length);

    const divisor = coveredParticipants.length;
    const splitEntryAmount = divisor > 0 ? (entryFeePortion / divisor) : 0;
    console.log("Final Split Amount per division:", splitEntryAmount);
}

simulateSync();
