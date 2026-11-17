/** No entry confirmation is queued or delivered before a confirmed payment. */
export async function registrationEmailAllowed(db: any, template: string, variables: any, to: string | string[]) {
  if (!['event_registration', 'payment_confirmation', 'partner_entry_paid', 'partner_invite'].includes(template)) return true;
  if (variables?.paid === false || variables?.pendingPayment === true) return false;
  const recipients = (Array.isArray(to) ? to : [to]).map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (!recipients.length) return false;
  if (!(Number(variables?.eventId) > 0)) {
    if (template !== 'payment_confirmation' || typeof variables?.reference !== 'string') return false;
    const { data: payment, error } = await db.from('payments').select('player_id,metadata')
      .eq('reference', variables.reference).eq('status', 'success').maybeSingle();
    if (error) throw error;
    if (!payment) return false;
    const payer = payment.metadata?.registrant_email || payment.metadata?.email;
    const profile = payer ? null : await db.from('players').select('email').eq('id', payment.player_id).maybeSingle();
    if (profile?.error) throw profile.error;
    return recipients.every(email => email === String(payer || profile?.data?.email || '').toLowerCase());
  }
  const field = template === 'partner_invite' ? 'partner_email' : 'email';
  const { data, error } = await db.from('event_registrations').select('email,partner_email,division')
    .eq('event_id', Number(variables.eventId)).neq('status', 'withdrawn')
    .in('payment_status', ['paid', 'comped', 'complimentary', 'waived']).in(field, recipients);
  if (error) throw error;
  return recipients.every(recipient => {
    const entries = (data || []).filter((entry: any) => String(entry[field] || '').toLowerCase() === recipient);
    if (!entries.length) return false;
    const requested = String(variables?.division || '').trim();
    if (!requested) return true;
    const names: string[] = [...new Set<string>(entries.map((entry: any) => String(entry.division || '').trim()).filter(Boolean))];
    const failed = new Set<string>();
    const covered = (rest: string): boolean => {
      if (!rest) return true;
      if (failed.has(rest)) return false;
      for (const name of names) if (rest === name || rest.startsWith(name + ', ') && covered(rest.slice(name.length + 2))) return true;
      failed.add(rest); return false;
    };
    return covered(requested);
  });
}
