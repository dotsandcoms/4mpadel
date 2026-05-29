import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Unified Brand Wrapper for premium emails
function wrapBrandTemplate(contentHtml: string, titleText: string, actionUrl?: string, actionLabel?: string) {
  const buttonHtml = actionUrl && actionLabel ? `
    <div style="margin-top: 30px; margin-bottom: 20px; text-align: center;">
      <a href="${actionUrl}" target="_blank" style="background-color: #9AE900; color: #000000; font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; text-decoration: none; padding: 16px 32px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 15px rgba(154,233,0,0.3); transition: all 0.3s ease;">
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
      </head>
      <body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E2E8F0;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #020617; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #0F172A; border: 1px solid rgba(255,255,255,0.05); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                <!-- Header Banner -->
                <tr>
                  <td style="background: linear-gradient(135deg, #0F172A, #020617); padding: 40px 40px 20px 40px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #FFFFFF; font-style: italic; text-transform: uppercase; font-family: 'Impact', 'Arial Black', sans-serif;">
                      4M <span style="color: #9AE900;">PADEL</span>
                    </div>
                    <div style="font-size: 8px; font-weight: 900; letter-spacing: 4px; color: #94A3B8; text-transform: uppercase; margin-top: 4px; font-family: 'Inter', sans-serif;">
                      South Africa
                    </div>
                  </td>
                </tr>
                <!-- Content Body -->
                <tr>
                  <td style="padding: 40px; font-family: 'Inter', Helvetica, Arial, sans-serif;">
                    ${contentHtml}
                    ${buttonHtml}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background-color: #020617; padding: 30px 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); font-family: 'Inter', sans-serif;">
                    <p style="font-size: 11px; color: #64748B; margin: 0; line-height: 1.6;">
                      This email was sent by 4M Padel on behalf of SAPA (South African Padel Association).
                    </p>
                    <p style="font-size: 11px; color: #475569; margin-top: 8px; margin-bottom: 0;">
                      &copy; 2026 4M Padel SA. All rights reserved.
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

// Generate premium HTML layouts based on template parameters
function generateEmailBody(template: string, vars: any): { subject: string; html: string } {
  let subject = '';
  let contentHtml = '';
  let actionUrl = '';
  let actionLabel = '';

  switch (template) {
    case 'welcome':
      subject = 'Welcome to 4M Padel South Africa! 🎾';
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">Welcome to the Court, ${vars.name || 'Player'}!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          Your official SAPA-linked player profile is active and ready. With 4M Padel, you can easily discover sanctioned tournaments, register with partners, and track your rolling rolling ranking points live.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          To play in sanctioned tier events and earn official ranking points, make sure to verify your SAPA membership licence directly inside your profile.
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/profile';
      actionLabel = 'View My Profile';
      break;

    case 'event_entry':
      subject = `Registration Confirmed: ${vars.eventName || 'Tournament'}! 🏆`;
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">Your Spot is Reserved!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, your registration and payment for **${vars.eventName}** has been confirmed!
        </p>
        <div style="background-color: #020617; border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #9AE900; margin-top: 0; margin-bottom: 12px; letter-spacing: 1px;">Entry Details</h3>
          <table width="100%" style="font-size: 13px; color: #E2E8F0; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Division:</td>
              <td align="right" style="font-weight: bold;">${vars.division || 'Open'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Partner:</td>
              <td align="right" style="font-weight: bold;">${vars.partnerName || 'TBD'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Amount Paid:</td>
              <td align="right" style="color: #9AE900; font-weight: 900;">${vars.amount || 'R 0.00'}</td>
            </tr>
          </table>
        </div>
        <p style="font-size: 13px; line-height: 1.6; color: #64748B;">
          Organisers will publish draws and schedules shortly. You will receive an immediate notification as soon as the bracket is live.
        </p>
      `;
      actionUrl = `https://4mpadel.co.za/calendar`;
      actionLabel = 'View Event Details';
      break;

    case 'org_applied':
      subject = 'Organisation Application Received - 4M Padel 🏢';
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">Application Received</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          Thank you for applying to register **${vars.orgName}** as an approved tournament host on 4M Padel.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          Our administration panel (SAPA Federation) is currently reviewing your details, venue capacity, and credentials. This review typically takes 24–48 hours.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 0;">
          You will receive an email as soon as your account has been approved, which will unlock your Organisation Dashboard.
        </p>
      `;
      break;

    case 'admin_org_applied':
      subject = `⚠️ Action Required: New Organisation Pending Review!`;
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">New Organisation Application</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 24px;">
          A new host has applied to register an organisation on the platform. Review their credentials to approve or reject.
        </p>
        <div style="background-color: #020617; border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #9AE900; margin-top: 0; margin-bottom: 12px; letter-spacing: 1px;">Application Summary</h3>
          <table width="100%" style="font-size: 13px; color: #E2E8F0; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Club Name:</td>
              <td align="right" style="font-weight: bold;">${vars.orgName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Applicant Name:</td>
              <td align="right" style="font-weight: bold;">${vars.creatorName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Contact Email:</td>
              <td align="right" style="font-weight: bold;">${vars.contactEmail}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Contact Phone:</td>
              <td align="right" style="font-weight: bold;">${vars.contactPhone || 'N/A'}</td>
            </tr>
          </table>
        </div>
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Open Admin Panel';
      break;

    case 'org_approved':
      subject = 'Congratulations! Your Organisation is Approved! 🎉';
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">Welcome as a Sanctioned Host!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          We are thrilled to inform you that your application for **${vars.orgName}** has been **APPROVED** by the SAPA Federation!
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          Your **Organisation Dashboard** is now unlocked. You can access it directly by logging into your player profile.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 0;">
          You can now immediately create sanctioned tournaments, set up division entries, schedule match timelines, and manage live scorecards!
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Open Organisation Portal';
      break;

    case 'org_rejected':
      subject = 'Update on your Organisation Application';
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">Application Feedback</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          Thank you for applying to register **${vars.orgName}**. Unfortunately, our administration team has declined your application at this time.
        </p>
        <div style="background-color: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 20px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #EF4444; margin-top: 0; margin-bottom: 8px;">Reviewer Notes</h3>
          <p style="font-size: 13px; line-height: 1.5; color: #FCA5A5; margin: 0;">
            ${vars.notes || 'Please verify your contact details and club venue credentials before resubmitting.'}
          </p>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 0;">
          If you have resolved the items listed above, you can re-apply directly from your profile.
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/profile';
      actionLabel = 'Re-apply Now';
      break;

    case 'event_pending_sanction':
      subject = `🏆 Sanction Requested: ${vars.eventName || 'New Event'}`;
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">New Event Pending Sanction</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 24px;">
          The approved club **${vars.orgName}** has created a new tournament and requested official sanctioning status:
        </p>
        <div style="background-color: #020617; border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #9AE900; margin-top: 0; margin-bottom: 12px; letter-spacing: 1px;">Tournament Info</h3>
          <table width="100%" style="font-size: 13px; color: #E2E8F0; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Event Name:</td>
              <td align="right" style="font-weight: bold;">${vars.eventName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Date:</td>
              <td align="right" style="font-weight: bold;">${vars.date || 'TBD'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Venue:</td>
              <td align="right" style="font-weight: bold;">${vars.venue || 'TBD'}</td>
            </tr>
          </table>
        </div>
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Review Tournament';
      break;

    case 'event_sanctioned':
      subject = `Tournament Sanctioned & Live: ${vars.eventName}! 🏆`;
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">Your Event is Live!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          Great news! The SAPA Federation has officially **SANCTIONED** your event: **${vars.eventName}**.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          Your tournament is now live on the public Calendar and is fully open to accept player registrations and Paystack payments.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 0;">
          Open your dashboard to monitor registered entries or configure seeds!
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Manage Event';
      break;

    case 'event_rejected':
      subject = `Sanction Update: ${vars.eventName}`;
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">Event Sanction Feedback</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 16px;">
          Our administration team has reviewed your tournament request for **${vars.eventName}** and declined sanctioning status at this time.
        </p>
        <div style="background-color: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 20px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #EF4444; margin-top: 0; margin-bottom: 8px;">Reviewer Notes</h3>
          <p style="font-size: 13px; line-height: 1.5; color: #FCA5A5; margin: 0;">
            ${vars.notes || 'Please adjust the schedule times or venue maps to prevent overlaps with other regional Gold tournaments.'}
          </p>
        </div>
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Edit Event Details';
      break;

    case 'draws_ready':
      subject = `Draws Published: ${vars.eventName}! 🎾`;
      contentHtml = `
        <h2 style="font-size: 20px; font-weight: bold; color: #FFFFFF; margin-top: 0; margin-bottom: 16px;">Your Draw Bracket is Live!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, the tournament draws for **${vars.eventName}** have been published!
        </p>
        <div style="background-color: #020617; border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #9AE900; margin-top: 0; margin-bottom: 12px; letter-spacing: 1px;">First Match Details</h3>
          <table width="100%" style="font-size: 13px; color: #E2E8F0; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Opponent:</td>
              <td align="right" style="font-weight: bold;">${vars.opponentName || 'TBD'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Scheduled Time:</td>
              <td align="right" style="font-weight: bold;">${vars.scheduledTime || 'TBD'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748B;">Court:</td>
              <td align="right" style="font-weight: bold; color: #9AE900;">${vars.court || 'TBD'}</td>
            </tr>
          </table>
        </div>
      `;
      actionUrl = 'https://4mpadel.co.za/calendar';
      actionLabel = 'View Live Bracket';
      break;

    default:
      subject = vars.subject || 'Notification from 4M Padel';
      contentHtml = `<p style="font-size: 14px; line-height: 1.6; color: #E2E8F0;">${vars.message || ''}</p>`;
  }

  const html = wrapBrandTemplate(contentHtml, subject, actionUrl, actionLabel);
  return { subject, html };
}

serve(async (req: Request) => {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured in Edge Function secrets');
    }

    const { to, template, variables } = await req.json();

    if (!to) {
      throw new Error('Missing recipient email (to)');
    }
    if (!template) {
      throw new Error('Missing email template identifier');
    }

    // Compile beautiful HTML body and subject
    const { subject, html } = generateEmailBody(template, variables || {});

    // Check if verified sender domain exists, otherwise fallback to custom domain
    const verifiedSender = Deno.env.get('RESEND_VERIFIED_SENDER') || 'notifications.4mpadel.co.za';
    const fromAddress = verifiedSender === 'onboarding@resend.dev' 
      ? '"4M Padel SA" <onboarding@resend.dev>' 
      : verifiedSender.includes('@')
        ? `"4M Padel SA" <${verifiedSender}>`
        : `"4M Padel SA" <noreply@${verifiedSender}>`;

    let finalTo = Array.isArray(to) ? to : [to];
    let finalHtml = html;

    // Sandbox redirect logic: if using onboarding domain, redirect non-owner emails to brad@dotsandcoms.co.za
    const sandboxOwner = 'brad@dotsandcoms.co.za';
    if (verifiedSender === 'onboarding@resend.dev') {
      const needsRedirect = finalTo.some(email => email.toLowerCase() !== sandboxOwner.toLowerCase());
      if (needsRedirect) {
        const originalRecipients = finalTo.join(', ');
        console.warn(`[SANDBOX REDIRECT] Redirecting test email from [${originalRecipients}] to owner [${sandboxOwner}] due to Resend sandbox limits.`);
        finalTo = [sandboxOwner];
        
        // Inject a premium glassmorphic sandbox warning banner at the top of the content
        const sandboxBanner = `
          <div style="background-color: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); padding: 20px; border-radius: 16px; margin-bottom: 24px; font-family: 'Inter', Helvetica, Arial, sans-serif; text-align: left;">
            <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #F59E0B; letter-spacing: 1.5px; margin-bottom: 6px;">⚠️ Sandbox Environment Redirect</div>
            <div style="font-size: 13px; color: #94A3B8; line-height: 1.6; margin: 0;">
              This transactional email was originally destined for <strong style="color: #FFFFFF;">${originalRecipients}</strong>. 
              Since you are using a Resend sandbox account, it has been automatically redirected to your verified email (<span style="color: #9AE900; font-weight: bold;">${sandboxOwner}</span>) so you can safely test the workflow and visual templates.
            </div>
          </div>
        `;
        
        // Inject banner right before the compiled email content body
        finalHtml = html.replace('<!-- Content Body -->', `<!-- Content Body -->\n${sandboxBanner}`);
      }
    }

    console.info(`Dispatching Resend email template [${template}] to ${finalTo.join(', ')}`);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: finalTo,
        subject: subject,
        html: finalHtml,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API dispatch failed: ${errorText}`);
    }

    const responseData = await response.json();

    return new Response(
      JSON.stringify({ success: true, messageId: responseData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Edge Function Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
