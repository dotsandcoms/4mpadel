// Existing admin-add semantics, shared by both interfaces.
export async function addProvisionalEntries({ client, event, division, players, registrations, adminEmail, note = '', sendEmail, logEventActivity }) {
  if (!adminEmail || !division?.id || !division.name || !event?.id) throw new Error('A signed-in administrator, event and division are required.');
  if (![1, 2].includes(players?.length)) throw new Error('Select one player or a full team.');
  const emails = players.map(player => String(player.email || '').trim());
  if (emails.some(email => !email) || new Set(emails.map(email => email.toLowerCase())).size !== players.length) throw new Error('Choose different players with email addresses.');
  for (const email of emails) {
    if (registrations.some(row => String(row.status).toLowerCase() !== 'withdrawn' && row.division === division.name && String(row.email || '').trim().toLowerCase() === email.toLowerCase())) throw new Error(`${email} is already entered in ${division.name}.`);
  }
  const rows = players.map((player, index) => ({
    event_id: event.id, email: emails[index], full_name: player.name,
    division: division.name, division_id: division.id, payment_status: 'pending',
    payment_method: null, status: 'registered', registered_by: adminEmail,
    ...(players.length === 2 ? { partner_name: players[1-index].name, partner_email: emails[1-index], partner_payment_status: 'pending' } : {}),
  }));
  const { data, error } = await client.from('event_registrations').insert(rows).select('id,email');
  if (error) throw error;
  if (data?.length !== rows.length) throw new Error('Could not verify the saved entries. Refresh before retrying.');
  // Once inserted, notification failures are warnings, not failed registrations.
  const warnings = [];
  for (const [index, player] of players.entries()) {
    const email = emails[index];
    try {
      const result = await sendEmail(email, 'event_registration', {
        eventId: event.id, playerName: player.name, eventName: event.event_name,
        division: division.name, partnerName: players.length === 2 ? players[1-index].name : 'TBD',
        eventDates: event.event_dates || (event.start_date ? new Date(event.start_date).toLocaleDateString(undefined, {weekday:'short',year:'numeric',month:'short',day:'numeric'}) : ''),
        venue: [event.venue,event.city].filter(Boolean).join(', '), paid: false,
        amountDue: new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(Number(division.entry_fee || 0)),
        eventUrl: `https://4mpadel.co.za/calendar/${event.slug || event.id}`,
      });
      if (result?.success === false) warnings.push(`Confirmation email could not be sent to ${email}.`);
    } catch { warnings.push(`Confirmation email could not be sent to ${email}.`); }
    try {
      const result = await logEventActivity({eventId:event.id,action:'admin.added_player',category:'ADMIN',summary:`Added ${player.name} provisionally (${division.name}) — payment pending`,details:{registration_id:data.find(row=>row.email?.toLowerCase()===email.toLowerCase())?.id,player_name:player.name,player_email:email,division:division.name,note:note.trim() || null,payment_status:'pending',added_by:adminEmail}});
      if (result === null) warnings.push(`Activity note could not be recorded for ${player.name}.`);
    } catch { warnings.push(`Activity note could not be recorded for ${player.name}.`); }
  }
  return { registrations: data, warnings };
}
