export type SupportAlertJob = { id: string; leaseId: string; kind: 'new' | 'escalated'; requestId: string; reference: string; event: string | null; topic: string; payload: Record<string, unknown> | null };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function supportSender(value: string) {
  const sender = value.trim();
  if (sender === 'onboarding@resend.dev' || !/^(?:[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(sender)) throw new Error('A verified email sender is required');
  return `"4M Padel Support" <${sender.includes('@') ? sender : `noreply@${sender}`}>`;
}
export function supportAlertPayload(job: SupportAlertJob, sender: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.requestId)) throw new Error('Invalid ticket reference');
  const topic = ({ entry: 'Tournament or entry', payment: 'Payment or refund', profile: 'Profile, rankings or licence', problem: 'App problem', other: 'Other enquiry' } as Record<string, string>)[job.topic] || 'Help request';
  const event = job.event?.replace(/\s+/g, ' ').slice(0, 240) || 'No event linked';
  const reference = job.reference.replace(/[^A-Za-z0-9-]/g, '').slice(0, 30);
  const link = `https://4mpadel.co.za/admin?tab=event-mgmt&section=help&ticket=${job.requestId}`;
  const heading = job.kind === 'escalated' ? 'A help request needs 4M support' : 'New request for 4M support';
  return {
    from: supportSender(sender), to: ['info@4mpadel.co.za'],
    subject: `${heading} · ${reference}`,
    text: `${heading}\n\nTicket: ${reference}\nEvent: ${event}\nHelp type: ${topic}\n\nOpen the request: ${link}\n\nSign in and verify your authenticator to read the private conversation.`,
    html: `<div style="background:#f5f6f3;padding:32px;font-family:Arial,sans-serif;color:#16251f"><div style="max-width:600px;margin:auto;background:white;padding:32px;border-radius:16px"><p style="font-weight:bold">4M PADEL · SUPPORT</p><h1 style="font-size:24px;line-height:1.3">${heading}</h1><p style="font-family:monospace">${escape(reference)}</p><p><strong>Event</strong><br>${escape(event)}</p><p><strong>Help type</strong><br>${escape(topic)}</p><p style="margin-top:28px"><a style="display:inline-block;background:#72508e;color:white;padding:14px 20px;text-decoration:none;border-radius:8px" href="${escape(link)}">Open help request</a></p><p style="font-size:13px;color:#52625a;line-height:1.5">Sign in and verify your authenticator to read the private conversation.</p></div></div>`,
  };
}
