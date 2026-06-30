import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseMetadata, resolvePaystackFetchSecrets, type PaystackFetchMode } from './paystack.ts';

/**
 * reconcile-payments — automated safety net for the `payments` ledger.
 *
 * Why this exists
 * ---------------
 * Standalone web license / membership purchases (LicensePaymentModal) only ever
 * get a `payments` ledger row from ONE place: the paystack-webhook's
 * finalizeWebLicensePayment, which runs only when it recognises the charge as a
 * license (metadata.source === 'web_license_modal'). The browser flow writes no
 * ledger row of its own — it just calls the mark_player_paid RPC.
 *
 * That single dependency breaks in the real world:
 *   - Apple Pay / mobile: the charge can reach the webhook WITHOUT the custom
 *     metadata the client set, so the source discriminator misses and the
 *     webhook skips → no ledger row.
 *   - the webhook can be momentarily undeployed, error, or be throttled by
 *     Paystack delivery retries.
 *
 * When that happens the only recovery today is an admin manually clicking
 * "backfill" in FinanceManager. This function automates exactly that recovery:
 * it pulls recent SUCCESSFUL Paystack transactions and, for any license /
 * membership charge that has no ledger row, writes one idempotently — keyed on
 * the Paystack transaction id, the same key the webhook and the manual backfill
 * use, so it can never duplicate an existing row.
 *
 * It is deliberately scoped to license / membership charges (the proven gap).
 * Event-entry payments already have their own client-side safety net
 * (confirm-manual-payment) plus the webhook, so this function leaves them alone
 * and only reports them if asked.
 *
 * Auth: the Supabase gateway already requires a valid project JWT to reach this
 * function at all. As an extra guard the handler accepts only the project's
 * service-role or anon key as the Bearer token — which the dashboard cron
 * (and the supabase-js client) attach automatically, so there is nothing extra
 * to configure: no secret, no custom header.
 */

const FULL_LICENSE_RANDS = 450;
const TEMP_LICENSE_RANDS = 120;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Read the `role` claim from the Bearer JWT WITHOUT verifying its signature —
 * the Supabase gateway has already verified it before this code runs, so here we
 * only decode the payload to distinguish service_role (server/cron) from anon.
 */
function bearerRole(req: Request): string | null {
    const m = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const parts = m[1].split('.');
    if (parts.length !== 3) return null;
    try {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        b64 += '='.repeat((4 - (b64.length % 4)) % 4);
        const payload = JSON.parse(atob(b64));
        return typeof payload.role === 'string' ? payload.role : null;
    } catch {
        return null;
    }
}

interface RawTxn {
    id: number | string;
    reference?: string;
    amount?: number;
    status?: string;
    domain?: string;
    created_at?: string;
    customer?: { email?: string };
    metadata?: unknown;
}

/** Page through Paystack's transaction list for a single secret, success only. */
async function fetchSuccessfulTransactions(
    secretKey: string,
    fromIso: string,
    isTest: boolean,
    maxPages = 10,
): Promise<RawTxn[]> {
    const out: RawTxn[] = [];
    let page = 1;
    while (page <= maxPages) {
        const url =
            `https://api.paystack.co/transaction?perPage=100&page=${page}&status=success` +
            `&from=${encodeURIComponent(fromIso)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Paystack list error (${isTest ? 'test' : 'live'}, p${page}): ${body}`);
        }
        const json = await res.json();
        const rows: RawTxn[] = json?.data || [];
        for (const t of rows) {
            if (String(t.status).toLowerCase() === 'success') out.push(t);
        }
        if (rows.length < 100) break;
        page++;
    }
    return out;
}

/**
 * Does a ledger row already exist for this Paystack transaction id?
 * Covers every reference shape the webhook / admin backfill can produce for a
 * license row: `<id>`, `LIC-<id>`, and rows carrying metadata.paystack_ref.
 */
async function licenseRowExists(admin: SupabaseClient, id: string): Promise<boolean> {
    const direct = await admin
        .from('payments')
        .select('id')
        .in('reference', [id, `LIC-${id}`])
        .limit(1);
    if (direct.data && direct.data.length > 0) return true;

    const byMeta = await admin
        .from('payments')
        .select('id')
        .filter('metadata->>paystack_ref', 'eq', id)
        .limit(1);
    if (byMeta.data && byMeta.data.length > 0) return true;

    return false;
}

/**
 * Write the missing membership / license ledger row + apply the license to the
 * profile. Mirrors paystack-webhook → finalizeWebLicensePayment exactly, so the
 * two converge on an identical row (upsert on `reference`). Fully idempotent.
 */
async function reconcileLicense(
    admin: SupabaseClient,
    trx: RawTxn,
    meta: Record<string, unknown>,
    isTestSecret: boolean,
): Promise<{ reference: string; licenseType: 'full' | 'temporary'; playerFound: boolean }> {
    const id = String(trx.id);
    const clientRef = String(trx.reference || '');
    const reference = id || clientRef;

    const amountRands = Number(trx.amount || 0) / 100;
    const email = String(meta.email || trx.customer?.email || '').toLowerCase();

    // Prefer explicit metadata; fall back to amount when Apple Pay stripped it.
    const isFull = meta.license_type
        ? meta.license_type !== 'temporary'
        : amountRands >= FULL_LICENSE_RANDS;

    const eventId = (meta.event_id as unknown) ?? null;
    const eventName = (meta.event_name as string) || null;
    const isTest = isTestSecret || String(trx.domain || '').toLowerCase() === 'test' || meta.is_test === true;

    let player: { id: string } | null = null;
    if (email) {
        const { data } = await admin.from('players').select('id').ilike('email', email).maybeSingle();
        player = data ?? null;
    }

    // 1) Ledger row — idempotent on `reference` (the Paystack transaction id).
    const { error: payErr } = await admin
        .from('payments')
        .upsert({
            player_id: player?.id ?? null,
            event_id: isFull ? null : eventId,
            amount: amountRands,
            currency: 'ZAR',
            status: 'success',
            payment_type: isFull ? 'membership' : 'temp_license',
            payment_method: 'paystack',
            reference,
            is_test: isTest,
            metadata: {
                source: 'web_license_modal',
                reconciled_by: 'reconcile-payments',
                license_type: isFull ? 'full' : 'temporary',
                client_reference: clientRef,
                paystack_ref: id,
                event_id: eventId,
                event_name: eventName,
            },
        }, { onConflict: 'reference' });
    if (payErr) throw payErr;

    // 2) Apply the license to the profile (same effect as mark_player_paid).
    //    Matters most for Apple Pay, where onSuccess may never have fired.
    if (player) {
        await admin
            .from('players')
            .update({ license_type: isFull ? 'full' : 'temporary', paid_registration: true })
            .eq('id', player.id);

        // 3) Temporary license record — only if we know the event and it's missing.
        if (!isFull && eventId) {
            const { data: existingLic } = await admin
                .from('temporary_licenses')
                .select('id')
                .eq('player_id', player.id)
                .eq('event_id', eventId)
                .maybeSingle();
            if (!existingLic) {
                const { data: ev } = await admin
                    .from('calendar')
                    .select('event_name, end_date, start_date')
                    .eq('id', eventId)
                    .maybeSingle();
                await admin.from('temporary_licenses').insert([{
                    player_id: player.id,
                    event_id: eventId,
                    event_name: ev?.event_name || eventName || 'Calendar Event',
                    event_date: ev?.end_date || ev?.start_date || null,
                }]);
            }
        }
    }

    return { reference, licenseType: isFull ? 'full' : 'temporary', playerFound: !!player };
}

/** A charge is a license/membership purchase we should reconcile. */
function looksLikeLicense(meta: Record<string, unknown>, amountRands: number): boolean {
    if (meta.source === 'manual_event') return false;          // never touch event charges
    if (meta.source === 'web_license_modal') return true;       // explicit
    // Apple Pay / metadata-stripped charge: fall back to the known license fees,
    // but only when there is no competing source claim.
    if (!meta.source && (amountRands === FULL_LICENSE_RANDS || amountRands === TEMP_LICENSE_RANDS)) {
        return true;
    }
    return false;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // --- auth -------------------------------------------------------------
    // The Supabase gateway has already cryptographically verified the JWT before
    // the request reaches here (verify_jwt). We only need to confirm it's the
    // service-role token — i.e. an internal/server caller (the cron) — not an
    // anon visitor. We read the role claim rather than byte-matching a raw key,
    // so it's immune to key rotation/format differences.
    if (bearerRole(req) !== 'service_role') {
        return new Response(JSON.stringify({ error: 'Unauthorized: service_role required' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // --- params -----------------------------------------------------------
    let hours = 48;
    let mode: PaystackFetchMode = 'both';
    let dryRun = false;
    try {
        const url = new URL(req.url);
        if (url.searchParams.get('hours')) hours = Number(url.searchParams.get('hours'));
        const m = (url.searchParams.get('mode') || '').toLowerCase();
        if (m === 'live' || m === 'test' || m === 'both') mode = m;
        if (url.searchParams.get('dryRun') === 'true') dryRun = true;
        if (req.headers.get('content-type')?.includes('application/json')) {
            const body = await req.json().catch(() => ({}));
            if (body.hours != null) hours = Number(body.hours);
            if (body.mode) mode = body.mode;
            if (body.dryRun === true) dryRun = true;
        }
    } catch {
        // ignore malformed params; defaults apply
    }
    if (!Number.isFinite(hours) || hours <= 0) hours = 48;
    const fromIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { secrets, configError } = resolvePaystackFetchSecrets(mode);
    if (secrets.length === 0) {
        return new Response(JSON.stringify({ error: configError || 'Paystack secrets not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const summary = {
        window_hours: hours,
        from: fromIso,
        dryRun,
        scanned: 0,
        license_charges: 0,
        already_present: 0,
        reconciled: 0,
        errors: 0,
        reconciledDetails: [] as Array<Record<string, unknown>>,
        errorDetails: [] as Array<Record<string, unknown>>,
    };

    try {
        for (const { key, mode: secretMode } of secrets) {
            const isTest = secretMode === 'test';
            const txns = await fetchSuccessfulTransactions(key, fromIso, isTest);
            for (const trx of txns) {
                summary.scanned++;
                const meta = parseMetadata(trx.metadata);
                const amountRands = Number(trx.amount || 0) / 100;
                if (!looksLikeLicense(meta, amountRands)) continue;
                summary.license_charges++;

                const id = String(trx.id);
                try {
                    if (await licenseRowExists(admin, id)) {
                        summary.already_present++;
                        continue;
                    }
                    if (dryRun) {
                        summary.reconciled++;
                        summary.reconciledDetails.push({
                            id, amountRands, email: trx.customer?.email, wouldWrite: true,
                        });
                        continue;
                    }
                    const result = await reconcileLicense(admin, trx, meta, isTest);
                    summary.reconciled++;
                    summary.reconciledDetails.push({ id, amountRands, ...result });
                    console.log(`reconcile-payments: wrote missing ${result.licenseType} ledger row for trx ${id}`);
                } catch (err) {
                    summary.errors++;
                    summary.errorDetails.push({ id, error: (err as Error).message });
                    console.error(`reconcile-payments: failed on trx ${id}:`, err);
                }
            }
        }

        return new Response(JSON.stringify({ ok: true, ...summary }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('reconcile-payments fatal:', error);
        return new Response(JSON.stringify({ ok: false, error: (error as Error).message, ...summary }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
