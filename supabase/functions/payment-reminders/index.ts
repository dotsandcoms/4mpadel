import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HOURS_1D = 24;
const HOURS_3D = 72;
const HOURS_7D = 168;

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
  is_weekly?: boolean | null;
};

type ReminderStage = '7d' | '3d' | '1d';

type ReminderDecision = {
  stage: ReminderStage;
  updateField: 'reminder_7d_sent_at' | 'reminder_3d_sent_at' | 'reminder_1d_sent_at';
  template: 'payment_reminder_general' | 'payment_reminder_deadline';
  daysLeft: number;
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
  if (!reg.pay_token) return false;
  // Weekly Open entries use division_id = null
  if (!reg.division_id && !cal.is_weekly) return false;
  return true;
}

/**
 * Pick at most one reminder stage per registration per run.
 * Prefer the most urgent overdue stage that has not been sent yet.
 * Windows (hours until registration_closes_at):
 *   1d: 0 < h <= 24
 *   3d: 24 < h <= 72
 *   7d: 72 < h <= 168
 */
function pickReminderStage(reg: {
  reminder_7d_sent_at?: string | null;
  reminder_3d_sent_at?: string | null;
  reminder_1d_sent_at?: string | null;
}, closesAt: Date, now: Date): ReminderDecision | null {
  const hoursToClose = (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursToClose <= 0) return null;

  if (hoursToClose <= HOURS_1D && !reg.reminder_1d_sent_at) {
    return {
      stage: '1d',
      updateField: 'reminder_1d_sent_at',
      template: 'payment_reminder_deadline',
      daysLeft: 1,
    };
  }

  if (hoursToClose <= HOURS_3D && hoursToClose > HOURS_1D && !reg.reminder_3d_sent_at) {
    return {
      stage: '3d',
      updateField: 'reminder_3d_sent_at',
      template: 'payment_reminder_general',
      daysLeft: 3,
    };
  }

  if (hoursToClose <= HOURS_7D && hoursToClose > HOURS_3D && !reg.reminder_7d_sent_at) {
    return {
      stage: '7d',
      updateField: 'reminder_7d_sent_at',
      template: 'payment_reminder_general',
      daysLeft: 7,
    };
  }

  return null;
}

function formatCloseLabel(closesAt: Date): string {
  try {
    return closesAt.toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return closesAt.toISOString();
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Optional dry-run: ?dry_run=true or body { dryRun: true } — no emails, no DB writes.
  let dryRun = false;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('dry_run') === 'true') dryRun = true;
    if (req.method !== 'GET') {
      const body = await req.clone().json().catch(() => null);
      if (body?.dryRun === true) dryRun = true;
    }
  } catch {
    // ignore parse errors
  }

  // Safety kill switch — must be explicitly enabled in Supabase secrets.
  // Dry-run is allowed even when disabled so we can preview recipients safely.
  const enabled = Deno.env.get('PAYMENT_REMINDERS_ENABLED') === 'true';
  if (!enabled && !dryRun) {
    console.warn('Payment reminders are disabled (PAYMENT_REMINDERS_ENABLED != true). No emails sent.');
    return new Response(
      JSON.stringify({
        success: true,
        disabled: true,
        message: 'Payment reminders are disabled. Set PAYMENT_REMINDERS_ENABLED=true after verifying dry-run results.',
        sent7d: 0,
        sent3d: 0,
        sent1d: 0,
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
        reminder_7d_sent_at,
        reminder_3d_sent_at,
        reminder_1d_sent_at,
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
          allow_payments,
          is_weekly
        )
      `)
      .eq('payment_status', 'pending')
      .eq('status', 'registered')
      .eq('calendar.is_manual', true)
      .eq('calendar.allow_payments', true)
      .not('pay_token', 'is', null)
      .not('calendar.registration_closes_at', 'is', null);

    if (fetchRegError) {
      throw new Error(`Failed to fetch pending registrations: ${fetchRegError.message}`);
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun,
          message: 'No eligible manual-event pending registrations found.',
          sent7d: 0,
          sent3d: 0,
          sent1d: 0,
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

    let sent7d = 0;
    let sent3d = 0;
    let sent1d = 0;
    let skipped = 0;
    const planned: Array<Record<string, unknown>> = [];

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

      const closesAt = cal?.registration_closes_at ? new Date(cal.registration_closes_at) : null;
      if (!closesAt || Number.isNaN(closesAt.getTime())) {
        skipped++;
        continue;
      }

      // Registration already closed — no reminders.
      if (now >= closesAt) {
        skipped++;
        continue;
      }

      const decision = pickReminderStage(reg, closesAt, now);
      if (!decision) {
        skipped++;
        continue;
      }

      const amountString = `R ${Number(fee).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
      const eventUrl = `https://4mpadel.co.za/calendar/${cal?.slug || cal?.id}`;
      const payUrl = `${eventUrl}?pay_token=${reg.pay_token}`;
      const closesLabel = formatCloseLabel(closesAt);

      const planRow = {
        stage: decision.stage,
        to: reg.email,
        player: reg.full_name,
        event: cal?.event_name,
        eventId: cal?.id,
        amount: amountString,
        closesAt: closesLabel,
        daysLeft: decision.daysLeft,
      };
      planned.push(planRow);

      console.info(
        `${dryRun ? 'DRY-RUN' : 'SEND'} [${decision.stage}] to=${reg.email} event="${cal?.event_name}" id=${cal?.id} amount=${amountString}`,
      );

      if (dryRun) {
        if (decision.stage === '7d') sent7d++;
        else if (decision.stage === '3d') sent3d++;
        else sent1d++;
        continue;
      }

      const success = await sendEmailViaEdge({
        to: reg.email,
        template: decision.template,
        variables: {
          eventId: cal?.id,
          eventName: cal?.event_name || 'Tournament',
          playerName: reg.full_name,
          division: reg.division,
          partnerName: reg.partner_name || 'TBD',
          amountDue: amountString,
          payUrl,
          eventUrl,
          daysLeft: decision.daysLeft,
          registrationClosesAt: closesLabel,
          reminderStage: decision.stage,
        },
      });

      if (success) {
        const { error: updateError } = await supabaseAdmin
          .from('event_registrations')
          .update({ [decision.updateField]: now.toISOString() })
          .eq('id', reg.id);

        if (updateError) {
          console.error(`Failed to update registration id=${reg.id}:`, updateError.message);
        } else if (decision.stage === '7d') {
          sent7d++;
        } else if (decision.stage === '3d') {
          sent3d++;
        } else {
          sent1d++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        enabled,
        message: dryRun
          ? 'Dry-run complete — no emails sent, no timestamps written.'
          : 'Manual-event close-date reminders processed.',
        sent7d,
        sent3d,
        sent1d,
        skipped,
        scanned: registrations.length,
        planned: dryRun ? planned : undefined,
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
