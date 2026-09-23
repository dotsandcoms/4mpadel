// Native adapter for website ManualEventRegistration.jsx. Paystack confirmation
// remains owned by the existing confirm-manual-payment and webhook functions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const norm = (value: unknown) => String(value || '').trim().toLowerCase();
const fail = (message: string) => { throw new Error(message); };
const checked = async (query: any) => { const { data, error } = await query; if (error) throw error; return data; };
const feeFor = (event: any, division: any) => event.early_bird_ends_at && new Date(event.early_bird_ends_at).getTime() > Date.now()
  && event.early_bird_fee != null && event.early_bird_fee !== '' && Number(event.early_bird_fee) >= 0
  ? Number(event.early_bird_fee) : Number(division.entry_fee ?? event.entry_fee ?? 0);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const auth = req.headers.get('Authorization') || '';
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user?.email) return json({ error: 'Sign in again to register.' }, 401);
    const email = norm(user.email);
    const input = await req.json();
    // Same super-admin identities as website useAdminPermissions.js. Never let
    // arbitrary players turn test gateway payments into real paid entries.
    const testAdmins = ['bradein@dotsandcoms.co.za', 'brad@dotsandcoms.co.za', 'admin@4mpadel.co.za', 'markstillerman@gmail.com'];
    if (input.isTest === true && !testAdmins.includes(email)) fail('Test checkout is available to platform administrators only.');
    const payOnly = input.mode === 'pay';
    const selections = Array.isArray(input.selections) ? input.selections : [];
    if (selections.length > 30 || new Set(selections.map((s: any) => s.divisionId)).size !== selections.length) fail('Choose each division once.');
    const selectionFor = (id: any) => selections.find((s: any) => s.divisionId === id);

    const eventId = Number(input.eventId);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) fail('Choose a valid event.');
    const event = await checked(client.from('calendar').select('*').eq('id', eventId).maybeSingle());
    if (!event || event.is_visible === false || ![null, undefined, 'approved'].includes(event.sanction_status)) fail('This event is not available.');
    if (!event.is_manual) fail('This event uses RankedIn registration. Please register with the event organiser.');
    if (event.event_status === 'cancelled') fail('This event has been cancelled.');
    if (event.registration_opens_at && new Date(event.registration_opens_at).getTime() > Date.now()) fail('Registration has not opened yet.');
    if (event.registration_closes_at && new Date(event.registration_closes_at).getTime() < Date.now()) fail('Registration has closed.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());
    if (String(event.end_date || event.start_date || '9999').slice(0, 10) < today) fail('This event has finished.');
    if (!payOnly && event.registration_access === 'code') {
      if (!input.accessGrantId || !await checked(client.rpc('event_access_grant_valid', { p_event_id: eventId, p_grant_id: input.accessGrantId }))) fail('Enter the event access code before registering.');
    }
    const profile = await checked(client.from('players').select('id, name, email, contact_number, license_type, paid_registration, temporary_licenses(event_id,event_date)')
      .ilike('email', email).maybeSingle());
    if (!profile?.name || !profile.contact_number) fail('Add your name and phone number to your profile before registering.');
    const mine = await checked(client.from('event_registrations').select('*').eq('event_id', eventId).ilike('email', email).neq('status', 'withdrawn'));
    const createdPartners = payOnly ? await checked(client.from('event_registrations').select('*').eq('event_id', eventId).ilike('registered_by', email).neq('email', email).neq('status', 'withdrawn')) : [];
    const linkedPartner = (r: any) => createdPartners.find((p: any) => norm(p.email) !== email && p.status !== 'withdrawn' && p.division_id === r.division_id && (!r.partner_email || norm(p.email) === norm(r.partner_email)));
    const unpaid = (status: unknown) => ['pending', 'failed'].includes(norm(status));
    const payPartner = (r: any) => (selectionFor(r.division_id)?.payForPartner ?? input.payForPartner) === true || ((selectionFor(r.division_id)?.payForPartner ?? input.payForPartner) == null && !!linkedPartner(r) && unpaid(linkedPartner(r).payment_status));
    const payable = mine.filter((r: any) => norm(r.email) === email && r.status !== 'withdrawn' && (unpaid(r.payment_status) || (payPartner(r) && unpaid(linkedPartner(r)?.payment_status || r.partner_payment_status))));
    if (payOnly && !payable.length) fail('No outstanding entry payment found. Return to the event to refresh your entries.');
    const divisionIds = payOnly ? payable.map((r: any) => r.division_id) : selections.length ? selections.map((s: any) => s.divisionId) : input.divisionIds;
    const divisions = event.is_weekly ? [{ id: null, name: 'Open', entry_fee: event.entry_fee, license_required: false }]
      : await checked(client.from('tournament_divisions').select('*').eq('event_id', eventId).eq('is_active', true).in('id', Array.isArray(divisionIds) ? divisionIds : []));
    if (!divisions.length || (!event.is_weekly && divisions.length !== new Set(divisionIds).size)) fail('Choose valid active divisions.');
    for (const d of divisions) if (d.entries_close_at && new Date(d.entries_close_at).getTime() < Date.now()) fail(`${d.name}: entries have closed.`);
    const hasLicence = (profile.license_type === 'full' && profile.paid_registration)
      || profile.temporary_licenses?.some((l: any) => Number(l.event_id) === eventId || String(l.event_date || '').slice(0, 10) >= String(event.end_date || event.start_date || today).slice(0, 10));
    const commerce = await checked(client.from('commerce_config').select('*').eq('id', 'default').maybeSingle());
    if (!commerce) fail('Pricing is unavailable. Please try again.');
    const licenceCovers: any[] = [], licenceItems: any[] = [];
    const requireLicence = (personEmail: string, name: string, active: boolean, choice: string | undefined) => {
      if (active || licenceCovers.some(c => c.email === personEmail)) return;
      if (!['full', 'temporary'].includes(choice || '')) fail(`Select a SAPA licence for ${name} before entering this division.`);
      const full = choice === 'full';
      if (full ? commerce.full_license_enabled !== true : commerce.temp_license_enabled !== true || event.allow_temporary_license === false) fail('That SAPA licence is not available for this event.');
      const price = Number(full ? commerce.full_license_price : commerce.temp_license_price);
      if (!Number.isFinite(price) || price < 0) fail('Licence pricing is unavailable.');
      const amount = money(price + money(price * Math.min(100, Math.max(0, Number(commerce.license_fee_percent) || 0)) / 100));
      licenceCovers.push({ type: 'license', email: personEmail, license: choice });
      licenceItems.push({ label: `${full ? 'Annual' : 'Temporary'} SAPA license — ${name}`, amount });
    };
    if (divisions.some((d: any) => d.license_required)) requireLicence(email, profile.name, !!hasLicence, input.licenseChoice);
    const matching = await checked(client.rpc('get_event_registrations_for_matching', { p_event_id: eventId }));
    const active = (matching || []).filter((r: any) => r.status !== 'withdrawn');
    const sizes = ['Youth XS', 'Youth S', 'Youth M', 'Youth L', 'Youth XL', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
    if (!payOnly && event.collect_tshirt_size && !sizes.includes(input.tshirtSize)) fail('Select your T-shirt size.');
    const method = event.payment_method || (event.allow_payments === false ? 'free' : 'platform');
    if (!['platform', 'free', 'eft', 'external'].includes(method)) fail('Contact the organiser to confirm the payment method.');
    const rows: any[] = [], covers: any[] = [], soloLinks: any[] = [], lineItems: any[] = [];
    const sponsorDetails = (value: any, existing: any = {}) => {
      const fields: Record<string, unknown> = { ...(existing.tshirt_logo_url !== undefined ? { tshirt_logo_url: existing.tshirt_logo_url } : {}), ...(existing.tshirt_sponsor_name !== undefined ? { tshirt_sponsor_name: existing.tshirt_sponsor_name } : {}) };
      if (!event.collect_tshirt_size) return fields;
      if (event.allow_tshirt_sponsor_name && value.tshirtSponsorName !== undefined) {
        if (typeof value.tshirtSponsorName !== 'string' || value.tshirtSponsorName.length > 80) fail('Sponsor names must be 80 characters or fewer.');
        fields.tshirt_sponsor_name = value.tshirtSponsorName.trim() || null;
      }
      if (event.allow_tshirt_logo_upload && value.tshirtLogoUrl !== undefined) {
        const logo = value.tshirtLogoUrl;
        if (typeof logo !== 'string') fail('Choose a valid sponsor logo.');
        if (logo && logo !== existing.tshirt_logo_url) {
          const prefix = `${url}/storage/v1/object/public/profile-pics/tshirt-logos/${eventId}/`;
          if (!logo.startsWith(prefix) || !/^[a-zA-Z0-9@._%-]+$/.test(logo.slice(prefix.length))) fail('Upload a logo for this event before continuing.');
        }
        fields.tshirt_logo_url = logo || null;
      }
      return fields;
    };
    const updateSponsor = (existing: any, value: any) => {
      const details = sponsorDetails(value, existing);
      if (!Object.keys(details).some(key => details[key] !== (existing[key] || null))) return;
      // Payment-only edits retain the original identity, pairing and payment state.
      rows.push({ ...existing, ...details });
    };

    const divisionFees: Record<string, number> = {};
    let base = 0;
    const partnerNames: string[] = [];
    const reviewEntries: any[] = [];
    for (const d of divisions) {
      const selection = selectionFor(d.id);
      const partnerEmail = payOnly ? '' : norm(selection?.partnerEmail ?? input.partnerEmail);
      const payForPartner = selection?.payForPartner ?? input.payForPartner;
      if (partnerEmail === email) fail('Choose a partner other than yourself.');
      let partner: any = null;
      if (partnerEmail) {
        const partners = await checked(client.rpc('find_registration_partner', { p_email: partnerEmail, p_event_id: eventId }));
        partner = (partners || []).find((p: any) => norm(p.email) === partnerEmail);
        if (!partner) fail('Search and select a registered partner.');
        partnerNames.push(partner.name);
        if (!payOnly && event.collect_tshirt_size && !sizes.includes(selection?.tshirtSize || input.partnerTshirtSize)) fail(`Select a T-shirt size for ${partner.name}.`);
      }
      const fee = feeFor(event, d);
      if (!Number.isFinite(fee) || fee < 0) fail('This division does not have a valid entry fee.');
      divisionFees[d.name] = fee;
      const selfReg = mine.find((r: any) => r.division === d.name);
      if (payOnly) {
        if (!selfReg || !payable.some((r: any) => r.id === selfReg.id)) fail('Your entry changed. Refresh payment review.');
        updateSponsor(selfReg, input);
        const sponsorPartner = linkedPartner(selfReg);
        if (sponsorPartner) updateSponsor(sponsorPartner, selection || { tshirtLogoUrl: input.partnerTshirtLogoUrl, tshirtSponsorName: input.partnerTshirtSponsorName });
        if (unpaid(selfReg.payment_status) && fee > 0) {
          base += fee; covers.push({ type: 'entry', email, division: d.name, event_id: eventId });
          lineItems.push({ label: `${d.name} — ${selfReg.full_name || profile.name}`, amount: fee });
        }
        const restoredPartner = linkedPartner(selfReg);
        if (payPartner(selfReg) && (selfReg.partner_email || restoredPartner)) {
          const otherEmail = norm(selfReg.partner_email || restoredPartner.email);
          const other = restoredPartner || active.find((r: any) => r.division === d.name && norm(r.email) === otherEmail);
          if (!other) fail(`${d.name}: your partner must have an existing entry before you can pay for them.`);
          if (unpaid(other.payment_status) && fee > 0) {
            const partners = await checked(client.rpc('find_registration_partner', { p_email: otherEmail, p_event_id: eventId }));
            const partnerProfile = partners?.find((p: any) => norm(p.email) === otherEmail);
            if (d.license_required) requireLicence(otherEmail, partnerProfile?.name || other.full_name, !!((partnerProfile?.license_type === 'full' && partnerProfile.paid_registration) || partnerProfile?.has_temp_license_for_event), selection?.licenseChoice);
            base += fee; covers.push({ type: 'entry', email: otherEmail, division: d.name, event_id: eventId });
            lineItems.push({ label: `${d.name} — ${other.full_name || selfReg.partner_name}`, amount: fee });
          }
        }
        // Sponsor edits are persisted by the shared finalizer only after payment.
        // An unchanged payment-only retry still has no registration rows to write.
        continue;
      }
      if (selfReg?.partner_email && norm(selfReg.partner_email) !== partnerEmail) {
        const oldPartner = active.find((r: any) => r.division === d.name && norm(r.email) === norm(selfReg.partner_email));
        if (selfReg.payment_status === 'paid' || oldPartner?.payment_status === 'paid') fail(`${d.name}: a paid pairing must be changed through Manage registration.`);
        if (oldPartner && norm(oldPartner.partner_email) === email) soloLinks.push({ id: oldPartner.id, email: oldPartner.email, division: d.name, partner_name: null, partner_email: null, partner_payment_status: null });
      }
      const partnerReg = partner ? active.find((r: any) => r.division === d.name && norm(r.email) === partnerEmail) : null;
      if (partnerReg?.partner_email && norm(partnerReg.partner_email) !== email) fail(`${partner.name} already has a partner in ${d.name}.`);
      const paidSelf = selfReg?.payment_status === 'paid';
      const paidPartner = partnerReg?.payment_status === 'paid';
      if (partner && payForPartner && !paidPartner && d.license_required) requireLicence(partnerEmail, partner.name, !!((partner.license_type === 'full' && partner.paid_registration) || partner.has_temp_license_for_event), selection?.licenseChoice);
      const entryRow = (person: any, other: any, existing: any, paid: boolean) => ({
        event_id: eventId, division_id: d.id, division: d.name, full_name: person.name,
        email: norm(person.email), phone: person.contact_number || null, partner_name: other?.name || null,
        partner_email: other ? norm(other.email) : null, payment_status: paid || fee === 0 ? 'paid' : 'pending',
        partner_payment_status: other ? 'pending' : null, payment_method: fee === 0 ? 'free' : method,
        status: 'registered', registered_by: existing?.registered_by || email,
        tshirt_size: norm(person.email) === email ? input.tshirtSize || existing?.tshirt_size || null : selection?.tshirtSize || input.partnerTshirtSize || existing?.tshirt_size || null,
        ...sponsorDetails(norm(person.email) === email ? input : selection || { tshirtLogoUrl: input.partnerTshirtLogoUrl, tshirtSponsorName: input.partnerTshirtSponsorName }, existing || {}),
        ...(input.accessGrantId ? { access_grant_id: input.accessGrantId } : {}),
      });
      rows.push(entryRow({ ...profile, email }, partner, selfReg, paidSelf));
      if (!paidSelf && fee > 0) {
        base += fee; covers.push({ type: 'entry', email, division: d.name, event_id: eventId });
        lineItems.push({ label: `${d.name} — ${profile.name}`, amount: fee });
      }
      reviewEntries.push({ id: selfReg?.id || d.id, divisionId: d.id, partnerEmail: partner?.email || null, division: d.name, playerName: profile.name, partnerName: partner?.name || null, paymentStatus: selfReg?.payment_status || 'pending', partnerPaymentStatus: partnerReg?.payment_status || null, playerCount: Number(!paidSelf) + Number(!!partner && payForPartner && !paidPartner), unitFee: fee, amount: money(fee * (Number(!paidSelf) + Number(!!partner && payForPartner && !paidPartner))) });
      if (partner) {
        if (partnerReg) soloLinks.push({ id: partnerReg.id, email: partnerEmail, division: d.name,
          partner_name: profile.name, partner_email: email, partner_payment_status: paidSelf ? 'paid' : 'pending' });
        else rows.push(entryRow(partner, { ...profile, email }, null, paidPartner));
        if (payForPartner && !paidPartner && fee > 0) {
          base += fee; covers.push({ type: 'entry', email: partnerEmail, division: d.name, event_id: eventId });
          lineItems.push({ label: `${d.name} — ${partner.name}`, amount: fee });
        }
      }
    }
    if (event.is_weekly && Number(event.max_teams_capacity) > 0 && !mine.length) {
      const count = active.filter((r: any) => !r.registered_by || norm(r.registered_by) === norm(r.email)).length;
      if (count >= Number(event.max_teams_capacity)) fail('This date is full. Choose another event.');
    }
    if (!payOnly && event.is_quick_event && Number(event.max_players) > 0) {
      const emails = new Set(active.map((r: any) => norm(r.email)));
      rows.forEach(r => emails.add(r.email));
      if (emails.size > Number(event.max_players)) fail('This event is full.');
    }
    if (payOnly && !covers.length) fail('No outstanding entry fees found. Return to the event to refresh your entries.');
    covers.push(...licenceCovers);
    const percent = Math.min(100, Math.max(0, Number(commerce.event_fee_percent) || 0));
    const fee = money(base * percent / 100);
    const licenseTotal = money(licenceItems.reduce((sum, item) => sum + item.amount, 0));
    const total = money(base + fee + licenseTotal);
    lineItems.push(...licenceItems);
    if (fee) lineItems.push({ label: commerce.fee_label || 'Management fee', amount: fee });
    const quote = { licenseTotal, licenseItems: licenceItems, total, base: money(base), fee, feeLabel: commerce.fee_label || 'Management fee', lineItems,
      eventName: event.event_name, profileName: profile.name, partnerName: [...new Set(partnerNames)].join(', ') || null, method,
      mode: payOnly ? 'pay' : 'register', entries: payOnly ? payable.map((r: any) => ({ id: r.id, divisionId: r.division_id, partnerEmail: r.partner_email || linkedPartner(r)?.email || null, canCustomizePartner: !!linkedPartner(r), tshirtLogoUrl: r.tshirt_logo_url, tshirtSponsorName: r.tshirt_sponsor_name, partnerTshirtLogoUrl: linkedPartner(r)?.tshirt_logo_url, partnerTshirtSponsorName: linkedPartner(r)?.tshirt_sponsor_name, division: r.division, playerName: r.full_name, partnerName: r.partner_name || linkedPartner(r)?.full_name || null, paymentStatus: r.payment_status, partnerPaymentStatus: linkedPartner(r)?.payment_status || r.partner_payment_status, amount: money(covers.filter((c: any) => c.type === 'entry' && c.division === r.division).length * divisionFees[r.division]), playerCount: covers.filter((c: any) => c.type === 'entry' && c.division === r.division).length, unitFee: divisionFees[r.division] })) : reviewEntries,
      divisionNames: divisions.map((d: any) => d.name), isTest: input.isTest === true };
    if (input.action === 'quote') return json({ quote });
    if (input.action !== 'checkout') fail('Choose a valid registration action.');
    if (input.agreed !== true) fail('Accept the event rules and registration obligations.');
    if (money(input.acceptedTotal) !== total) return json({ error: 'The price changed. Review the updated total before continuing.', quote }, 409);
    if (!/^[a-f0-9-]{36}$/i.test(input.attemptId || '')) fail('Start a new checkout attempt.');
    if (method === 'free' && total > 0) fail('The organiser must correct this event’s free-entry pricing before registration.');
    if (licenceCovers.length && method !== 'platform') fail('SAPA licences require online payment. Purchase your licence before using the organiser’s payment method.');
    if (payOnly && method !== 'platform') {
      if (rows.length) await checked(client.from('event_registrations').upsert(rows, { onConflict: 'event_id,email,division' }).select('id'));
      return json({ registered: true, paymentPending: total > 0, quote });
    }
    if (method !== 'platform' || total === 0) {
      // Use the authenticated client so the website's existing registration RLS applies.
      for (const link of soloLinks) await checked(client.from('event_registrations').update({ partner_name: link.partner_name, partner_email: link.partner_email }).eq('id', link.id));
      await checked(client.from('event_registrations').upsert(rows, { onConflict: 'event_id,email,division' }).select('id'));
      return json({ registered: true, paymentPending: total > 0, quote });
    }
    const secret = Deno.env.get(input.isTest === true ? 'PAYSTACK_SECRET_KEY_TEST' : 'PAYSTACK_SECRET_KEY');
    if (!secret) fail('Checkout is not configured for this payment mode. Contact the organiser.');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const reference = `MOBILE-${user.id.slice(0, 8)}-${input.attemptId}`;
    const eventUrl = `https://4mpadel.co.za/calendar/${event.slug || eventId}`;
    const metadata = { source: 'manual_event', is_test: input.isTest === true, event_id: eventId,
      event_name: event.event_name, is_weekly: !!event.is_weekly, series_id: event.series_id || null,
      registrant_email: email, registrant_name: profile.name, covers, line_items: lineItems,
      event_url: eventUrl, registration_rows: rows, solo_link_updates: soloLinks,
      division_names: quote.divisionNames.join(', '), primary_partner_name: [...new Set(partnerNames)].join(', ') || 'TBD',
      event_dates: event.event_dates || '', event_venue: [event.venue, event.city].filter(Boolean).join(', '),
      division_entry_fees: divisionFees, commerce, reference };
    const existing = await checked(admin.from('payments').select('status, amount, metadata, is_test').eq('reference', reference).maybeSingle());
    if (existing) {
      if (existing.amount !== total || existing.is_test !== (input.isTest === true)
        || JSON.stringify(existing.metadata?.registration_rows) !== JSON.stringify(rows)
        || JSON.stringify(existing.metadata?.covers) !== JSON.stringify(covers)) fail('This checkout attempt has changed. Start again.');
      if (existing.status === 'success') return json({ registered: true, quote });
      if (existing.metadata?.native_authorization_url) return json({ authorizationUrl: existing.metadata.native_authorization_url, reference, quote });
    } else await checked(admin.from('payments').insert({ player_id: profile.id, event_id: eventId, amount: total,
      currency: 'ZAR', status: 'processing', payment_type: 'event_entry_fee', payment_method: 'paystack',
      reference, is_test: input.isTest === true, metadata }));
    const gateway = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: Math.round(total * 100), currency: 'ZAR', reference,
        callback_url: `${eventUrl}?pay_ref=${encodeURIComponent(reference)}`, metadata,
        channels: ['card', 'eft', 'bank_transfer', 'apple_pay'] }) });
    const result = await gateway.json();
    if (!gateway.ok || !result.status || !result.data?.authorization_url) fail('Could not start checkout. Please try again.');
    await checked(admin.from('payments').update({ metadata: { ...metadata, native_authorization_url: result.data.authorization_url } }).eq('reference', reference));
    return json({ authorizationUrl: result.data.authorization_url, reference, quote });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Registration could not be completed.' }, 400);
  }
});
