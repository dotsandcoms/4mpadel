import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...cors,
    'Content-Type': 'application/json'
  }
});
const money = (n: number) => Math.round(n * 100) / 100;
async function checked(query: any): Promise<any> {
  const {
    data,
    error
  } = await query;
  if (error) throw new Error(error.message || 'Licence checkout could not be saved. Please try again.');
  return data;
}
Deno.serve(async req => {
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/native-license-checkout/return')) {
    const params = new URL(req.url).searchParams;
    return new Response(null, {
      status: 302,
      headers: {
        Location: params.get('channel') === 'web' ? /^[1-9]\d*$/.test(params.get('event_id') || '') ? `https://4mpadel.co.za/calendar/${params.get('event_id')}?license_payment=1` : 'https://4mpadel.co.za/profile?license_payment=1' : 'fourmpadel://license',
        'Cache-Control': 'no-store'
      }
    });
  }
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: cors
  });
  if (req.method !== 'POST') return json({
    error: 'Method not allowed'
  }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') || ''
        }
      }
    });
    const {
      data: {
        user
      },
      error
    } = await client.auth.getUser();
    if (error || !user?.email) return json({
      error: 'Sign in again to manage your licence.'
    }, 401);
    const input = await req.json();
    if (!['quote', 'checkout', 'verify'].includes(input.action)) throw new Error('Choose a valid licence action.');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let profile = await checked(admin.from('players').select('id,name,email,contact_number').ilike('email', user.email.replace(/[\\%_]/g, '\\$&')).maybeSingle());
    const purchaserId = profile?.id;
    if (input.beneficiaryPlayerId != null && input.action !== 'verify') {
      if (!Number.isSafeInteger(input.beneficiaryPlayerId) || input.beneficiaryPlayerId < 1) throw new Error('Choose a valid player.');
      profile = await checked(admin.from('players').select('id,name,email,contact_number').eq('id', input.beneficiaryPlayerId).maybeSingle());
      if (!profile) return json({ error: 'This player profile could not be found.', code: 'PROFILE_INCOMPLETE', missingFields: ['Player profile'], profileUrl: '/profile?edit=true' }, 400);
    }
    if (!profile && input.action !== 'verify') return json({ error: 'Complete your player profile before purchasing a licence.', code: 'PROFILE_INCOMPLETE', missingFields: ['Player profile registration'], profileUrl: '/profile?edit=true' }, 400);
    if (profile && input.action !== 'verify') {
      const missingFields = [['name', 'Full name'], ['email', 'Email address'], ['contact_number', 'Mobile number']].filter(([field]) => !String(profile[field] || '').trim()).map(([,label]) => label);
      if (missingFields.length) return json({ error: 'Add the missing information to the player profile before purchasing a licence.', code: 'PROFILE_INCOMPLETE', missingFields, profileUrl: '/profile?edit=true' }, 400);
    }
    const profileDetails = profile ? await client.rpc('get_player_licenses', { p_player_id: profile.id }) : { data: null };
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    async function gateway(path: string, body?: unknown) {
      if (!secret?.startsWith('sk_live_')) throw new Error('Licence payments are currently unavailable.');
      const response = await fetch(`https://api.paystack.co/transaction/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        ...(body ? {
          body: JSON.stringify(body)
        } : {}),
        signal: AbortSignal.timeout(20000)
      });
      const result = await response.json();
      if (!response.ok || !result.status) throw new Error('The payment provider could not complete this request. Check payment status before trying again.');
      return result.data;
    }
    if (input.action === 'verify') {
      if (typeof input.reference !== 'string' || !/^LIC-[a-f0-9-]+$/.test(input.reference)) throw new Error('Invalid payment reference.');
      const saved = await checked(admin.from('native_license_checkouts').select('*').eq('reference', input.reference).eq('user_id', user.id).maybeSingle());
      if (!saved) throw new Error('No licence checkout was found for your account.');
      const payment = await gateway(`verify/${encodeURIComponent(saved.reference)}`);
      if (payment.status !== 'success') return json({
        paid: false
      });
      const meta = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata;
      if (payment.reference !== saved.reference || payment.domain !== 'live' || payment.currency !== 'ZAR' || payment.amount !== Math.round(Number(saved.amount) * 100) || payment.customer?.email?.toLowerCase() !== user.email.toLowerCase() || meta?.native_user_id !== user.id || meta?.license_type !== saved.license_type || !payment.id || meta?.license_year != null && meta.license_year !== saved.license_year || meta?.event_id != null && Number(meta.event_id) !== Number(saved.event_id)) {
        throw new Error('Payment details do not match this licence. Please contact support.');
      }
      // The database's verified-payment trigger finalizes all payment paths atomically.
      await checked(admin.from('payments').upsert({
        player_id: saved.player_id,
        event_id: saved.event_id,
        amount: Number(saved.amount),
        currency: 'ZAR',
        status: 'success',
        payment_type: saved.license_type === 'temporary' ? 'temp_license' : 'membership',
        payment_method: 'paystack',
        reference: String(payment.id),
        is_test: false,
        metadata: {
          source: 'web_license_modal',
          license_type: saved.license_type,
          license_year: saved.license_year,
          client_reference: saved.reference,
          paystack_ref: String(payment.id),
          event_id: saved.event_id
        }
      }, {
        onConflict: 'reference'
      }));
      const entitlement = saved.license_type === 'temporary' ? await checked(admin.from('temporary_licenses').select('id,revoked_at').eq('player_id', saved.player_id).eq('event_id', saved.event_id).is('revoked_at', null).limit(1).maybeSingle()) : await checked(admin.from('annual_licenses').select('id,revoked_at').eq('player_id', saved.player_id).eq('season_year', saved.license_year).maybeSingle());
      if (!entitlement || entitlement.revoked_at) throw new Error('Payment received. Your licence needs an administrator review; please contact support.');
      return json({
        paid: true,
        licenseYear: saved.license_year,
        licenseType: saved.license_type
      });
    }
    const type = input.licenseType === 'temporary' ? 'temporary' : 'full';
    if (type === 'full' && (!Number.isInteger(input.licenseYear) || input.licenseYear < 2026)) throw new Error('Update the app or refresh the website to choose a licence year before purchasing.');
    const config = await checked(admin.from('commerce_config').select('*').eq('id', 'default').maybeSingle());
    if (!config) throw new Error('Licence pricing is unavailable.');
    let annualQuote: any = null;
    let season: any = null,
      event: any = null,
      active = false,
      coveredByFull = false;
    if (type === 'full') {
      season = await checked(admin.from('license_seasons').select('*').eq('year', input.licenseYear).maybeSingle());
      if (!season) throw new Error('That licence year is unavailable.');
      annualQuote = await checked(admin.rpc('full_license_quote', { p_player_id: profile.id, p_year: input.licenseYear }));
      if (!annualQuote) throw new Error('Licence pricing is unavailable.');
      active = !!(await checked(admin.from('annual_licenses').select('id').eq('player_id', profile.id).eq('season_year', season.year).maybeSingle()));
    } else {
      event = await checked(admin.from('calendar').select('id,event_name,start_date,end_date,allow_temporary_license').eq('id', input.eventId).maybeSingle());
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Johannesburg'
      }).format(new Date());
      if (!event || event.allow_temporary_license === false || String(event.end_date || event.start_date).slice(0, 10) < today) throw new Error('Temporary licences are unavailable for this event.');
      active = !!(await checked(admin.from('temporary_licenses').select('id').eq('player_id', profile.id).eq('event_id', event.id).limit(1).maybeSingle()));
      const eligibility = await checked(admin.rpc('player_license_eligibility', {
        p_player_id: profile.id,
        p_event_id: event.id
      }));
      coveredByFull = eligibility?.full === true;
      active = active || coveredByFull;
    }
    const base = Number(type === 'full' ? annualQuote.price : config.temp_license_price),
      percent = Number(config.license_fee_percent);
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Licence pricing is unavailable.');
    const fee = money(base * percent / 100);
    const quote = {
      base,
      fee,
      total: money(base + fee),
      feeLabel: config.fee_label || 'Service fee',
      enabled: type === 'full' ? season.sales_open && season.year >= Number(new Intl.DateTimeFormat('en', {
        year: 'numeric',
        timeZone: 'Africa/Johannesburg'
      }).format(new Date())) : config.temp_license_enabled === true,
      active,
      isRenewal: type === 'full' && annualQuote.renewal_eligible === true,
      startsOn: annualQuote?.starts_on || null,
      endsOn: annualQuote?.ends_on || null,
      coveredByFull,
      licenseType: type,
      licenseYear: season?.year || null,
      eventId: event?.id || null,
      eventName: event?.event_name || null,
      licenseNumber: profileDetails.data?.license_number || null,
      beneficiaryName: profile.name,
      forAnotherPlayer: profile.id !== purchaserId
    };
    if (input.action === 'quote') return json({
      quote
    });
    if (active) throw new Error('You already hold this licence. Contact support if it has been revoked.');
    if (!quote.enabled) throw new Error('Sales are currently closed for this licence.');
    if (input.agreed !== true || input.acceptedTotal !== quote.total) throw new Error('Review the current licence price before paying.');
    if (typeof input.attemptId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.attemptId)) throw new Error('Invalid checkout attempt.');
    const reference = `LIC-${user.id}-${input.attemptId}`;
    const channel = input.channel === 'web' ? 'web' : 'native';
    await checked(admin.from('native_license_checkouts').upsert({
      reference,
      user_id: user.id,
      player_id: profile.id,
      amount: quote.total,
      pricing: quote,
      license_year: quote.licenseYear,
      license_type: type,
      event_id: quote.eventId,
      channel
    }, {
      onConflict: 'reference',
      ignoreDuplicates: true
    }));
    const saved = await checked(admin.from('native_license_checkouts').select('*').eq('reference', reference).eq('user_id', user.id).single());
    if (saved.player_id !== profile.id || Number(saved.amount) !== quote.total || saved.license_year !== quote.licenseYear || saved.license_type !== type || saved.event_id !== quote.eventId || saved.channel !== channel) throw new Error('This payment attempt is for a different quote. Check its status before starting another.');
    if (saved.authorization_url) return json({
      reference,
      authorizationUrl: saved.authorization_url
    });
    const returnEvent = Number.isSafeInteger(input.returnEventId) && input.returnEventId > 0 ? `&event_id=${input.returnEventId}` : '';
    const payment = await gateway('initialize', {
      email: user.email.toLowerCase(),
      amount: Math.round(quote.total * 100),
      currency: 'ZAR',
      reference,
      callback_url: `${url}/functions/v1/native-license-checkout/return?channel=${channel}${returnEvent}`,
      metadata: {
        source: 'web_license_modal',
        native_user_id: user.id,
        license_type: type,
        license_year: quote.licenseYear,
        event_id: quote.eventId,
        pricing: quote
      }
    });
    const checkoutUrl = new URL(payment.authorization_url);
    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paystack.com') throw new Error('The payment provider returned an unexpected address.');
    await checked(admin.from('native_license_checkouts').update({
      authorization_url: checkoutUrl.href
    }).eq('reference', reference));
    return json({
      reference,
      authorizationUrl: checkoutUrl.href
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Licence checkout is unavailable.'
    }, 400);
  }
});
