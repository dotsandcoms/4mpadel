import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmailViaEdge(payload: {
  to: string;
  template: string;
  variables: Record<string, unknown>;
}): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    const res = await fetch(`${url}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Failed to trigger send-email edge function: ${text}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Error fetching send-email function:`, err);
    return false;
  }
}

serve(async (req: Request) => {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();

    // 1. Fetch pending registrations that are active ('registered') and unpaid ('pending')
    // We join the calendar event details to evaluate deadlines
    const { data: registrations, error: fetchRegError } = await supabaseAdmin
      .from('event_registrations')
      .select(`
        id,
        created_at,
        full_name,
        email,
        division,
        partner_name,
        pay_token,
        reminder_sent_at,
        close_reminder_sent_at,
        division_id,
        calendar!inner (
          id,
          event_name,
          registration_closes_at,
          slug,
          entry_fee,
          start_date
        )
      `)
      .eq('payment_status', 'pending')
      .eq('status', 'registered');

    if (fetchRegError) {
      throw new Error(`Failed to fetch pending registrations: ${fetchRegError.message}`);
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending registrations found.', generalSent: 0, deadlineSent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 2. Fetch division fees for any division_ids found in registrations to determine exact amount due
    const divisionIds = registrations
      .map(r => r.division_id)
      .filter(Boolean);
    const divisionFees: Record<string, number> = {};

    if (divisionIds.length > 0) {
      const { data: divisionsData, error: fetchDivError } = await supabaseAdmin
        .from('tournament_divisions')
        .select('id, entry_fee')
        .in('id', divisionIds);

      if (!fetchDivError && divisionsData) {
        divisionsData.forEach(d => {
          divisionFees[d.id] = Number(d.entry_fee || 0);
        });
      }
    }

    let generalSent = 0;
    let deadlineSent = 0;

    // 3. Process registrations and check thresholds
    for (const reg of registrations) {
      if (!reg.email) continue;

      // Skip past events (events starting today or already started)
      if (reg.calendar?.start_date) {
        const todayStr = now.toISOString().split('T')[0];
        if (todayStr >= reg.calendar.start_date) {
          continue;
        }
      }

      const createdAt = new Date(reg.created_at);
      const closesAt = reg.calendar?.registration_closes_at ? new Date(reg.calendar.registration_closes_at) : null;
      
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      
      let shouldSendGeneral = false;
      let shouldSendDeadline = false;

      // Rule A: Deadline Reminder
      // If the event closes within the next 24 hours, registration is unpaid, and close_reminder_sent_at is null
      if (closesAt && !reg.close_reminder_sent_at) {
        const hoursToClose = (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursToClose > 0 && hoursToClose <= 24) {
          shouldSendDeadline = true;
        }
      }

      // Rule B: General Reminder
      // If the registration is at least 24 hours old, reminder_sent_at is null, and the registration closing hasn't already passed
      if (!shouldSendDeadline && hoursSinceCreation >= 24 && !reg.reminder_sent_at) {
        if (!closesAt || now < closesAt) {
          shouldSendGeneral = true;
        }
      }

      // Skip if neither condition matches
      if (!shouldSendGeneral && !shouldSendDeadline) {
        continue;
      }

      // Resolve the fee amount
      const fee = reg.division_id ? (divisionFees[reg.division_id] ?? 0) : Number(reg.calendar?.entry_fee || 0);
      const amountString = `R ${Number(fee || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

      // Resolve payment URLs
      const eventUrl = `https://4mpadel.co.za/calendar/${reg.calendar?.slug || reg.calendar?.id}`;
      const payUrl = reg.pay_token ? `${eventUrl}?pay_token=${reg.pay_token}` : eventUrl;

      const template = shouldSendDeadline ? 'payment_reminder_deadline' : 'payment_reminder_general';

      const emailPayload = {
        to: reg.email,
        template,
        variables: {
          eventId: reg.calendar.id,
          playerName: reg.full_name,
          division: reg.division,
          partnerName: reg.partner_name || 'TBD',
          amountDue: amountString,
          payUrl,
          eventUrl,
        },
      };

      console.info(`Triggering [${template}] reminder to: ${reg.email} | Event ID: ${reg.calendar.id} | Amount: ${amountString}`);
      
      const success = await sendEmailViaEdge(emailPayload);
      if (success) {
        // Update database log timestamp
        const updateField = shouldSendDeadline ? 'close_reminder_sent_at' : 'reminder_sent_at';
        const { error: updateError } = await supabaseAdmin
          .from('event_registrations')
          .update({ [updateField]: now.toISOString() })
          .eq('id', reg.id);

        if (updateError) {
          console.error(`Failed to update registration status in DB for id: ${reg.id}`, updateError.message);
        } else {
          if (shouldSendDeadline) deadlineSent++;
          else generalSent++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Reminders processed successfully.', generalSent, deadlineSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Edge Function Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
