const email = value => String(value || '').trim().toLowerCase();

export function isAvailableSolo(row, registrations) {
  return Boolean(row?.email?.trim()) && row.status !== 'withdrawn'
    && !row.partner_name?.trim() && !row.partner_email?.trim()
    && !registrations.some(other => String(other.id) !== String(row.id)
      && String(other.event_id) === String(row.event_id) && other.division === row.division
      && other.status !== 'withdrawn' && email(other.partner_email) === email(row.email));
}

export function eligibleEventPartners(solo, registrations) {
  if (!solo || !isAvailableSolo(solo, registrations)) return [];
  return registrations.filter(row => String(row.id) !== String(solo.id)
    && String(row.event_id) === String(solo.event_id) && row.division === solo.division
    && email(row.email) !== email(solo.email) && isAvailableSolo(row, registrations));
}

// Same reciprocal links and notification templates as ManualEventRegistrations.
// This deliberately changes no payment amounts, statuses, or divisions.
export async function pairEventEntries({ client, event, solo, partner, registrations, sendEmail }) {
  if (String(solo?.event_id) !== String(event.id)
    || !eligibleEventPartners(solo, registrations).some(row => String(row.id) === String(partner?.id))) {
    throw new Error('Both entries must still be available solos in the same event and division.');
  }
  const results = await Promise.all([[solo, partner], [partner, solo]].map(([row, other]) =>
    client.from('event_registrations').update({
      partner_name: other.full_name,
      partner_email: other.email,
      partner_payment_status: other.payment_status === 'paid' ? 'paid' : 'pending',
    }).eq('event_id', event.id).eq('id', row.id).select('id'),
  ));
  for (const result of results) {
    if (result.error) throw result.error;
    if (result.data?.length !== 1) throw new Error('A registration could not be updated. Refresh and review both entries.');
  }
  const warnings = [];
  await Promise.all([[solo, partner], [partner, solo]].map(async ([row, other]) => {
    try {
      const result = await sendEmail(row.email, 'partner_assigned', {
        eventId: event.id, playerName: row.full_name, partnerName: other.full_name,
        eventName: event.event_name, division: solo.division,
      });
      if (result?.success === false) throw new Error('Email not delivered');
    } catch { warnings.push(`Paired successfully, but the notification to ${row.email} was not confirmed.`); }
  }));
  return { warnings };
}

export async function inviteEventPartner({ client, event, solo, profile, division, registrations, sendEmail }) {
  if (!solo || String(solo.event_id) !== String(event.id) || !isAvailableSolo(solo, registrations)
    || !profile?.email?.trim() || email(profile.email) === email(solo.email)
    || !division || division.name !== solo.division || String(division.event_id) !== String(event.id)
    || registrations.some(row => row.status !== 'withdrawn' && row.division === solo.division
      && (email(row.email) === email(profile.email) || email(row.partner_email) === email(profile.email)))) {
    throw new Error('Choose a player who is not already entered or paired in this division.');
  }
  const { data: inserted, error } = await client.from('event_registrations').insert({
    event_id: event.id, email: profile.email, full_name: profile.name,
    division: solo.division, division_id: division.id, payment_status: 'pending', status: 'registered',
    registered_by: solo.email, partner_name: solo.full_name, partner_email: solo.email,
    // Unlike the old hard-coded 'paid', reflect the inviter's real status.
    partner_payment_status: solo.payment_status === 'paid' ? 'paid' : 'pending',
  }).select('id, pay_token').maybeSingle();
  if (error) throw error;
  if (!inserted?.id) throw new Error('The partner registration was not confirmed.');
  const update = await client.from('event_registrations').update({
    partner_name: profile.name, partner_email: profile.email, partner_payment_status: 'pending',
  }).eq('event_id', event.id).eq('id', solo.id).select('id');
  if (update.error) throw update.error;
  if (update.data?.length !== 1) throw new Error('The solo entry link was not confirmed.');
  const eventUrl = `https://4mpadel.co.za/calendar/${event.slug || event.id}`;
  const warnings = [];
  try {
    const result = await sendEmail(profile.email, 'partner_invite', {
      eventId: event.id, playerName: profile.name, inviterName: solo.full_name,
      eventName: event.event_name, division: solo.division, eventDates: event.event_dates || '',
      amountDue: `R ${Number(division.entry_fee || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`,
      payUrl: inserted.pay_token ? `${eventUrl}?pay_token=${inserted.pay_token}` : eventUrl,
    });
    if (result?.success === false) throw new Error('Email not delivered');
  } catch { warnings.push(`Partner added, but the invitation to ${profile.email} was not confirmed.`); }
  return { warnings };
}
