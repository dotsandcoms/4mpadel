// Pure decision-email renderer. Exact existing send-email club copy/brand markup.
// Intentionally duplicated for now: index.ts remains untouched; consolidate later.
// No database, environment, provider or network calls.
const SITE_URL = 'https://4mpadel.co.za';
const EMAIL_LOGO_URL = SITE_URL + '/images/4m-padel-event-management-logo.png';
const EMAIL_CLUBS_LOGO_URL = SITE_URL + '/images/4m-padel-clubs-logo.png';
const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
function wrapBrandTemplate(contentHtml, titleText, actionUrl, actionLabel, options) {
  const logoUrl = options?.logoUrl || EMAIL_LOGO_URL;
  const logoAlt = options?.logoAlt || '4M Padel Event Management';
  const buttonHtml = actionUrl && actionLabel ? `
    <div style="margin-top: 32px; margin-bottom: 20px; text-align: center;">
      <a href="${actionUrl}" target="_blank" style="background-color: #9AE900; color: #000000; font-family: 'Outfit', 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 2.5px; text-decoration: none; padding: 18px 36px; border-radius: 14px; display: inline-block; box-shadow: 0 8px 25px rgba(154,233,0,0.25); border: 1px solid #B4F53C; transition: all 0.3s ease;">
        ${actionLabel}
      </a>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${titleText}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
      </head>
      <body style="margin: 0; padding: 0; background-color: #0B0F19; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E2E8F0; -webkit-font-smoothing: antialiased;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0B0F19; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #111827; border: 1px solid rgba(154,233,0,0.12); border-top: 5px solid #9AE900; border-radius: 24px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75);">
                <!-- Header Banner -->
                <tr>
                  <td style="background: linear-gradient(135deg, #111827, #0B0F19); padding: 32px 40px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.03);">
                    <a href="${SITE_URL}" target="_blank" style="text-decoration: none; display: inline-block;">
                      <img src="${logoUrl}" alt="${logoAlt}" width="280" style="max-width: 280px; width: 100%; height: auto; display: block; margin: 0 auto; border: 0;" />
                    </a>
                  </td>
                </tr>
                <!-- Content Body -->
                <tr>
                  <td style="padding: 40px; font-family: 'Outfit', 'Inter', Helvetica, Arial, sans-serif;">
                    ${contentHtml}
                    ${buttonHtml}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #0B0F19; padding: 30px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.03); font-family: 'Outfit', 'Inter', sans-serif;">
                    <p style="font-size: 11px; color: #64748B; margin: 0; line-height: 1.6; letter-spacing: 0.5px;">
                      This email was sent by 4M Padel on behalf of SAPA (South African Padel Association).
                    </p>
                    <p style="font-size: 11px; color: #475569; margin-top: 8px; margin-bottom: 0; font-weight: 500;">
                      &copy; ${new Date().getFullYear()} 4M Padel SA. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}


export function renderClubDecisionEmail(template, variables = {}) {
  if (!["club_approved","club_rejected","club_claim_approved","club_claim_rejected"].includes(template)) throw new Error('Unsupported club decision template');
  const raw = { clubName: variables?.clubName, notes: variables?.notes };
  for (const value of Object.values(raw)) if (value != null && typeof value !== 'string') throw new Error('Email variables must be text');
  const vars = { clubName: escapeHtml(raw.clubName), notes: escapeHtml(raw.notes) };
  let subject = '', contentHtml = '', actionUrl = '', actionLabel = '';
  switch (template) {
    case 'club_approved':
      subject = 'Congratulations! Your Club is Approved! 🎉';
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #9AE900; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Welcome to the Club Network!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          We are thrilled to inform you that <strong style="color: #FFFFFF;">${vars.clubName}</strong> has been <strong style="color: #9AE900;">APPROVED</strong> and is now live on 4M Padel!
        </p>
        <p style="font-size: 14.5px; line-height: 1.7; color: #E2E8F0; margin-bottom: 24px;">
          Your <strong style="color: #FFFFFF;">Club Dashboard</strong> is now unlocked. Sign in with your club contact email to complete your public club page — courts, opening hours, gallery, sponsors and contacts.
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/admin?tab=clubs';
      actionLabel = 'Open Club Dashboard';
      break;

    case 'club_rejected':
      subject = 'Update on your Club Application';
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #EF4444; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Application Feedback</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Thank you for applying to register <strong style="color: #FFFFFF;">${vars.clubName}</strong>. Unfortunately, our administration team has declined your application at this time.
        </p>
        <div style="background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); padding: 24px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #EF4444; margin-top: 0; margin-bottom: 10px; letter-spacing: 1px;">Reviewer Notes</h3>
          <p style="font-size: 13.5px; line-height: 1.6; color: #FCA5A5; margin: 0;">
            ${vars.notes || 'Please verify your contact details and club venue credentials before resubmitting.'}
          </p>
        </div>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 0;">
          If you have resolved the items listed above, you can re-apply from the clubs page.
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/clubs';
      actionLabel = 'Re-apply Now';
      break;

    case 'club_claim_approved':
      subject = `Club claim approved: ${vars.clubName || 'Club'} 🎉`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #9AE900; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Club Claim Approved</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Great news — your club claim for <strong style="color: #FFFFFF;">${vars.clubName}</strong> has been <strong style="color: #9AE900;">APPROVED</strong>.
        </p>
        <p style="font-size: 14.5px; line-height: 1.7; color: #E2E8F0; margin-bottom: 0;">
          Your <strong style="color: #FFFFFF;">Club Dashboard</strong> is now unlocked. Sign in with this email to manage the club page.
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/admin?tab=clubs';
      actionLabel = 'Open Club Dashboard';
      break;

    case 'club_claim_rejected':
      subject = `Update on your club claim: ${vars.clubName || 'Club'}`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #EF4444; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Club Claim Not Approved</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Thanks for requesting access to <strong style="color: #FFFFFF;">${vars.clubName}</strong>. Unfortunately this club claim was not approved at this time.
        </p>
        <div style="background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); padding: 24px; border-radius: 16px; margin-bottom: 0;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #EF4444; margin-top: 0; margin-bottom: 10px; letter-spacing: 1px;">Reviewer Notes</h3>
          <p style="font-size: 13.5px; line-height: 1.6; color: #FCA5A5; margin: 0;">
            ${vars.notes || 'Please contact 4M Padel if you believe this was in error.'}
          </p>
        </div>
      `;
      actionUrl = 'https://4mpadel.co.za/clubs';
      actionLabel = 'Browse Clubs';
      break;

  }
  // Subjects are plain text; HTML title and body values are escaped separately.
  if (template === 'club_claim_approved') subject = 'Club claim approved: ' + (raw.clubName || 'Club') + ' 🎉';
  if (template === 'club_claim_rejected') subject = 'Update on your club claim: ' + (raw.clubName || 'Club');
  return { subject, html: wrapBrandTemplate(contentHtml, escapeHtml(subject), actionUrl, actionLabel, { logoUrl: EMAIL_CLUBS_LOGO_URL, logoAlt: '4M Padel Clubs' }) };
}

