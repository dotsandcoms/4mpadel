const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function welcomePayload(email: string, name: string, sender: string) {
  const features = [
    ['Find your next tournament', 'Discover local events and register yourself and your partner from the app.'],
    ['Keep payments in one place', 'Pay for tournament entries and track your entry status and outstanding balances.'],
    ['Follow local heroes and global stars', 'Build one follow list with local 4M players and international pros. Explore player profiles and rankings.'],
    ['Stay close to the action', 'Keep up with local events and international tours, see upcoming action and add events to your calendar.'],
  ];
  const from = sender.includes('@') ? sender : `noreply@${sender}`;
  const greeting = `Welcome to 4M Padel, ${name.trim().split(/\s+/)[0] || 'Player'}!`;
  return {
    from: `4M Padel SA <${from}>`, to: [email], subject: 'Your 4M Padel profile is ready 🎾',
    text: `${greeting}\n\nYour player profile is ready. Here’s what you can do in the app:\n\n${features.map(([title, body]) => `${title}\n${body}`).join('\n\n')}\n\nOpen the 4M Padel app to get started.\nhttps://4mpadel.com\n\nSee you on court,\nThe 4M Padel team`,
    html: `<!doctype html><html><body style="margin:0;background:#F5F6F3;font-family:Arial,sans-serif;color:#16251F"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:580px;background:#FFFFFF;border-radius:20px" cellspacing="0" cellpadding="0"><tr><td style="padding:32px"><p style="color:#2449D8;font-weight:800;letter-spacing:2px">4M PADEL</p><h1 style="font-size:28px;line-height:1.2">${escapeHtml(greeting)}</h1><p style="line-height:1.6;color:#52625A">Your player profile is ready. Your next match, your favourite players and your padel community are all in one place.</p>${features.map(([title, body]) => `<div style="padding:18px 0;border-bottom:1px solid #E5EAE2"><h2 style="font-size:18px;margin:0 0 8px;color:#2449D8">${title}</h2><p style="font-size:15px;line-height:1.6;margin:0;color:#52625A">${body}</p></div>`).join('')}<p style="font-weight:bold;margin-top:28px">Open the 4M Padel app to get started.</p><p style="line-height:1.6">See you on court,<br>The 4M Padel team</p><a href="https://4mpadel.com" style="color:#2449D8">Visit 4M Padel</a></td></tr></table></td></tr></table></body></html>`,
  };
}
