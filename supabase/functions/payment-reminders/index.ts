import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CalendarRow = {
  id: number;
  event_name: string;
  registration_closes_at: string | null;
  slug: string | null;
  entry_fee: number | null;
  start_date: string | null;
  end_date: string | null;
  is_manual: boolean | null;
  allow_payments: boolean | null;
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
    console.error('Error fetching send-email function:', err);
    return false;
  }
}

function isEventStillOpen(cal: CalendarRow | null | undefined, now: Date): boolean {
  if (!cal) return false;
  const compareDate = cal.end_date || cal.start_date;
  if (!compareDate) return true;
  const eventEnd = new Date(compareDate);
  if (Number.isNaN(eventEnd.getTime())) return false;
  eventEnd.setHours(23, 59, 59, 999);
  return now <= eventEnd;
}

function isManualEventRegistration(reg: {
  division_id?: string | null;
  pay_token?: string | null;
  calendar?: CalendarRow | null;
}): boolean {
  const cal = reg.calendar;
  if (!cal?.is_manual) return false;
  if (cal.allow_payments === false) return false;
  // Manual checkout flow always creates division_id + pay_token rows.
  if (!reg.division_id || !reg.pay_token) return false;
  return true;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Safety kill switch — must be explicitly enabled in Supabase secrets.
  if (Deno.env.get('PAYMENT_REMINDERS_ENABLED') !== 'true') {
    console.warn('Payment reminders are disabled (PAYMENT_REMINDERS_ENABLED != true). No emails sent.');
    return new Response(
      JSON.stringify({
        success: true,
        disabled: true,
        message: 'Payment reminders are disabled. Set PAYMENT_REMINDERS_ENABLED=true after deploying the manual-only fix.',
        generalSent: 0,
        deadlineSent: 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const now = new Date();

    // ONLY manual events with payments enabled — never Rankedin / legacy imports.
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
          start_date,
          end_date,
          is_manual,
          allow_payments
        )
      `)
      .eq('payment_status', 'pending')
      .eq('status', 'registered')
      .eq('calendar.is_manual', true)
      .eq('calendar.allow_payments', true)
      .not('division_id', 'is', null)
      .not('pay_token', 'is', null);

    if (fetchRegError) {
      throw new Error(`Failed to fetch pending registrations: ${fetchRegError.message}`);
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No eligible manual-event pending registrations found.',
          generalSent: 0,
          deadlineSent: 0,
          skipped: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    const divisionIds = registrations.map((r) => r.division_id).filter(Boolean);
    const divisionFees: Record<string, number> = {};

    if (divisionIds.length > 0) {
      const { data: divisionsData } = await supabaseAdmin
        .from('tournament_divisions')
        .select('id, entry_fee')
        .in('id', divisionIds);

      for (const d of divisionsData || []) {
        divisionFees[d.id] = Number(d.entry_fee || 0);
      }
    }

    let generalSent = 0;
    let deadlineSent = 0;
    let skipped = 0;

    for (const reg of registrations) {
      const cal = reg.calendar as CalendarRow | null;

      if (!reg.email) {
        skipped++;
        continue;
      }

      if (!isManualEventRegistration(reg)) {
        console.info(`SKIP non-manual registration id=${reg.id} event=${cal?.id}`);
        skipped++;
        continue;
      }

      if (!isEventStillOpen(cal, now)) {
        console.info(`SKIP past event id=${cal?.id} name="${cal?.event_name}" reg=${reg.id}`);
        skipped++;
        continue;
      }

      const fee = reg.division_id ? (divisionFees[reg.division_id] ?? 0) : Number(cal?.entry_fee || 0);
      if (fee <= 0) {
        console.info(`SKIP zero-fee registration id=${reg.id} event=${cal?.id}`);
        skipped++;
        continue;
      }

      const createdAt = new Date(reg.created_at);
      const closesAt = cal?.registration_closes_at ? new Date(cal.registration_closes_at) : null;
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      let shouldSendGeneral = false;
      let shouldSendDeadline = false;

      if (closesAt && !reg.close_reminder_sent_at) {
        const hoursToClose = (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursToClose > 0 && hoursToClose <= 24) {
          shouldSendDeadline = true;
        }
      }

      if (!shouldSendDeadline && hoursSinceCreation >= 24 && !reg.reminder_sent_at) {
        if (!closesAt || now < closesAt) {
          shouldSendGeneral = true;
        }
      }

      if (!shouldSendGeneral && !shouldSendDeadline) {
        skipped++;
        continue;
      }

      const amountString = `R ${Number(fee).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
      const eventUrl = `https://4mpadel.co.za/calendar/${cal?.slug || cal?.id}`;
      const payUrl = `${eventUrl}?pay_token=${reg.pay_token}`;
      const template = shouldSendDeadline ? 'payment_reminder_deadline' : 'payment_reminder_general';

      console.info(
        `SEND [${template}] to=${reg.email} event="${cal?.event_name}" id=${cal?.id} amount=${amountString}`,
      );

      const success = await sendEmailViaEdge({
        to: reg.email,
        template,
        variables: {
          eventId: cal?.id,
          eventName: cal?.event_name || 'Tournament',
          playerName: reg.full_name,
          division: reg.division,
          partnerName: reg.partner_name || 'TBD',
          amountDue: amountString,
          payUrl,
          eventUrl,
        },
      });

      if (success) {
        const updateField = shouldSendDeadline ? 'close_reminder_sent_at' : 'reminder_sent_at';
        const { error: updateError } = await supabaseAdmin
          .from('event_registrations')
          .update({ [updateField]: now.toISOString() })
          .eq('id', reg.id);

        if (updateError) {
          console.error(`Failed to update registration id=${reg.id}:`, updateError.message);
        } else if (shouldSendDeadline) {
          deadlineSent++;
        } else {
          generalSent++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Manual-event reminders processed.',
        generalSent,
        deadlineSent,
        skipped,
        scanned: registrations.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('Edge Function Error:', (error as Error).message);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
