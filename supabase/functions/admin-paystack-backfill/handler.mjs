const referencePattern = /^[A-Za-z0-9._=-]{1,100}$/;
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const idPattern = /^[1-9]\d{0,18}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const currency = 'ZAR';

const response = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
    },
});

const parseMetadata = value => {
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return {}; }
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};
const integerId = value => {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
    const string = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
    return idPattern.test(string) && BigInt(string) <= 9223372036854775807n ? string : null;
};
const normalEmail = value => {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return text.length <= 254 && emailPattern.test(text) ? text : null;
};
const optionalUuid = value => value == null || (typeof value === 'string' && uuidPattern.test(value));

function eventCovers(metadata, eventId) {
    if (!eventId || !Array.isArray(metadata.covers) || !metadata.covers.length || metadata.covers.length > 24) return null;
    const covers = [];
    for (const cover of metadata.covers) {
        const email = normalEmail(cover?.email);
        const coveredEvent = cover?.event_id == null ? eventId : integerId(cover.event_id);
        if (!email || !coveredEvent || coveredEvent !== eventId) return null;
        if (cover.type === 'entry') {
            if (typeof cover.division !== 'string' || !cover.division.trim() || cover.division.length > 180
                || !optionalUuid(cover.division_id) || !optionalUuid(cover.registration_id)) return null;
            covers.push({ type:'entry', email, event_id:eventId, division:cover.division,
                division_id:cover.division_id?.toLowerCase() ?? null, registration_id:cover.registration_id?.toLowerCase() ?? null });
        } else if (cover.type === 'license' && ['full','temporary'].includes(cover.license)) {
            const year = cover.license_year == null ? null : Number(cover.license_year);
            if (year != null && (!Number.isInteger(year) || year < 2000 || year > 2100)) return null;
            covers.push({ type:'license', email, event_id:eventId, license:cover.license, license_year:year });
        } else return null;
    }
    return covers;
}

export function verifiedBackfillCharge(reference, transaction, now = Date.now()) {
    const providerId = integerId(transaction?.id);
    const amountMinor = transaction?.amount;
    const paidAt = typeof transaction?.paid_at === 'string' ? Date.parse(transaction.paid_at) : NaN;
    const payer = normalEmail(transaction?.customer?.email);
    const metadata = parseMetadata(transaction?.metadata);
    if (!providerId || transaction?.reference !== reference || transaction?.status !== 'success'
        || transaction?.domain !== 'live' || transaction?.currency !== currency || metadata.is_test === true || !Number.isSafeInteger(amountMinor)
        || amountMinor < 1 || amountMinor > 9999999999 || !Number.isFinite(paidAt) || paidAt > now + 300000 || !payer) return null;
    const eventId = integerId(metadata.event_id);
    const covers = metadata.source === 'manual_event' ? eventCovers(metadata, eventId) : null;
    return { provider_id:providerId, gateway_reference:reference, amount_minor:amountMinor,
        payer_email:payer, paid_at:new Date(paidAt).toISOString(), source:covers ? 'manual_event' : null,
        event_id:covers ? eventId : null, covers };
}

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
async function reviewToken(actorId, plan) {
    const input = new TextEncoder().encode(JSON.stringify(canonical([actorId,plan])));
    const digest = await crypto.subtle.digest('SHA-256', input);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeReview(plan, token) {
    return { state:'review', token, reference:plan.reference, kind:plan.kind, amountMinor:plan.amount_minor,
        payer:plan.payer_email, paidAt:plan.paid_at, eventId:plan.event_id || null,
        entries:plan.registration_ids?.length || 0, licences:plan.licence_items?.length || 0,
        licenceType:plan.licence_type || null, licenceYear:plan.licence_year || null };
}

export function createBackfillHandler({ authorize, verify, hasRefunds, recover, now = Date.now }) {
    return async request => {
        if (request.method === 'OPTIONS') return response(200,{});
        if (request.method !== 'POST') return response(405,{error:'Use POST to review or record a receipt.'});
        const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
        if (!token) return response(401,{error:'Sign in to review a receipt.'});
        if (Number(request.headers.get('content-length')) > 4096) return response(400,{error:'Invalid receipt request.'});
        try {
            const actor = await authorize(token);
            if (!actor?.id) return response(403,{error:'Verified platform Finance access is required.'});
            const raw = await request.text();
            if (raw.length > 4096) return response(400,{error:'Invalid receipt request.'});
            let input;
            try { input = JSON.parse(raw); } catch { return response(400,{error:'Invalid receipt request.'}); }
            const { action, reference, scopeId, token: expected } = input ?? {};
            if (scopeId !== 'all' || !['review','record'].includes(action)
                || typeof reference !== 'string' || !referencePattern.test(reference)) return response(400,{error:'Choose a live Paystack receipt in the platform workspace.'});
            const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
            if (action === 'record' && (typeof expected !== 'string' || !/^[\da-f]{64}$/.test(expected) || !reason || reason.length > 500)) {
                return response(400,{error:'Review the verified receipt and enter a reason first.'});
            }
            const transaction = await verify(reference);
            if (!transaction) return response(404,{state:'held',error:'Paystack did not return this receipt.'});
            const charge = verifiedBackfillCharge(reference,transaction,now());
            if (!charge) return response(422,{state:'held',error:'This receipt could not be verified as a successful live ZAR payment.'});
            if (await hasRefunds(charge.provider_id)) {
                return response(200,{state:'held',message:'Paystack reports a refund for this receipt. Review the refund before recording.'});
            }
            const review = await recover(actor.id,charge);
            if (review.state !== 'review') return response(200,review);
            const fingerprint = await reviewToken(actor.id,review.plan);
            if (action === 'review') return response(200,safeReview(review.plan,fingerprint));
            if (expected !== fingerprint) return response(409,{state:'changed',error:'Receipt evidence changed. Review again.'});
            const recorded = await recover(actor.id,charge,review.plan,reason);
            return response(recorded.state === 'changed' ? 409 : 200,recorded);
        } catch {
            return response(503,{error:'Receipt verification or recording could not be confirmed. Refresh and review the receipt before retrying.'});
        }
    };
}
