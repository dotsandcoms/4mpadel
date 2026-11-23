// Shared pure renderer for the admin preview and guarded send-email adapter.
// No sender, credentials or permission writes.
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function buildAccessEmail({ name, modules, superAdmin, eventNames, financeEventNames }) {
  const subject = 'Your 4M Padel admin access has been updated';
  const loginUrl = 'https://4mpadel.co.za/admin';
  const greeting = `Hi ${name || 'there'},`;
  const scope = superAdmin ? 'Account role: Super admin.' : `Direct modules: ${modules.length ? modules.join(', ') : 'No direct modules assigned.'}`;
  const assignments = superAdmin ? [] : [
    ...(eventNames.length ? [`Event Manager assignments: ${eventNames.join('; ')}.`] : []),
    ...(financeEventNames.length ? [`Finance event assignments: ${financeEventNames.join('; ')}.`] : []),
  ];
  const instructions = [
    'Open the admin sign-in page and use your existing 4M Padel account.',
    'If you need to reset your password, open Sign in on the 4M Padel website and use the password recovery option.',
    'If more than one workspace is available, use the “Working in” menu to choose the organisation or club you want to manage.',
  ];
  const note = 'This summary covers your direct access settings. Membership access and event restrictions still apply. If anything looks incorrect, contact the administrator who updated your access.';
  const text = [greeting, 'Your admin access settings have been updated.', scope, ...assignments, 'How to sign in', ...instructions.map((item, index) => `${index + 1}. ${item}`), loginUrl, note, '4M Padel'].join('\n\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f2;color:#191e18;font-family:Arial,sans-serif;line-height:1.6"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fbfcf9;border:1px solid #dce0d8;border-radius:12px"><tr><td style="padding:24px 28px;background:#191e18;color:#d1ed49;border-radius:12px 12px 0 0;font-size:20px;font-weight:bold">4M PADEL</td></tr><tr><td style="padding:28px"><p style="color:#687066;margin-top:0;font-size:12px;letter-spacing:1px">ACCOUNT ACCESS</p><h1 style="font-size:26px;line-height:1.2">Your admin access is ready</h1><p>${escapeHtml(greeting)}</p><p>Your admin access settings have been updated.</p><div style="padding:16px;background:#eef0eb;border-radius:8px"><strong>${escapeHtml(scope)}</strong>${assignments.map(item => `<p>${escapeHtml(item)}</p>`).join('')}</div><h2 style="font-size:18px;margin-top:26px">How to sign in</h2><ol style="padding-left:22px">${instructions.map(item => `<li style="margin-bottom:10px">${escapeHtml(item)}</li>`).join('')}</ol><p style="margin:26px 0"><a href="${loginUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#d1ed49;color:#191e18;font-weight:bold;padding:12px 22px;border-radius:7px;text-decoration:none">Open 4M Padel admin</a></p><p style="font-size:13px;color:#687066">${escapeHtml(note)}</p><p style="font-size:12px;color:#687066">Never share your password. 4M Padel will not ask you to send it by email.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html, loginUrl };
}
