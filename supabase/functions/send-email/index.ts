import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Unified Brand Wrapper for premium emails
function wrapBrandTemplate(contentHtml: string, titleText: string, actionUrl?: string, actionLabel?: string) {
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
                  <td style="background: linear-gradient(135deg, #111827, #0B0F19); padding: 40px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.03);">
                    <a href="https://4mpadel.co.za" target="_blank" style="text-decoration: none; display: inline-block;">
                      <img src="https://4mpadel.co.za/favicon.png" alt="4M Padel Logo" style="height: 48px; width: auto; display: block; margin: 0 auto; border: 0;" />
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

// Generate a premium event information panel/card
function generateEventCardHtml(
  eventInfo: any,
  vars: {
    division?: string;
    partnerName?: string;
    amount?: string;
    amountDue?: string;
    paid?: boolean;
    payUrl?: string;
    statusOverride?: string;
  }
) {
  if (!eventInfo) return '';

  const venueString = [eventInfo.venue, eventInfo.city].filter(Boolean).join(', ');
  const mapLink = eventInfo.address 
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventInfo.address + ' ' + (eventInfo.venue || ''))}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueString)}`;

  // Determine payment status badge
  let statusBadge = '';
  const isWithdrawn = vars.statusOverride?.toLowerCase() === 'withdrawn';
  const isPaid = vars.paid === true || (vars.amount && !vars.amountDue && !vars.payUrl);
  
  if (isWithdrawn) {
    statusBadge = `<span style="background-color: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #FCA5A5; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px; border-radius: 20px; display: inline-block;">Withdrawn</span>`;
  } else if (isPaid) {
    statusBadge = `<span style="background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #34D399; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px; border-radius: 20px; display: inline-block;">Paid ✅</span>`;
  } else {
    statusBadge = `<span style="background-color: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); color: #FBBF24; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px; border-radius: 20px; display: inline-block;">Payment Pending ⚠️</span>`;
  }

  const costLabel = isPaid ? 'Amount Paid:' : 'Amount Due:';
  const costValue = isPaid ? (vars.amount || 'R 0.00') : (vars.amountDue || vars.amount || 'R 0.00');

  return `
    <div style="background: linear-gradient(135deg, #1F2937, #111827); border: 1px solid rgba(154, 233, 0, 0.15); border-radius: 20px; padding: 28px; margin-top: 24px; margin-bottom: 28px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);">
      <h3 style="font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: #FFFFFF; margin-top: 0; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; display: inline-block;">
        <span style="color: #9AE900; margin-right: 8px;">🏆</span> ${eventInfo.event_name}
      </h3>
      
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-family: 'Outfit', sans-serif; font-size: 13.5px; color: #94A3B8; border-collapse: collapse;">
        <!-- Dates -->
        ${eventInfo.event_dates ? `
        <tr>
          <td width="30" valign="top" style="padding: 10px 0; font-size: 18px;">📅</td>
          <td valign="top" style="padding: 10px 0; color: #CBD5E1;">
            <strong style="color: #FFFFFF;">Event Dates:</strong><br/>
            <span style="font-size: 13px; color: #94A3B8;">${eventInfo.event_dates} ${eventInfo.start_time ? `| Starts at ${eventInfo.start_time}` : ''}</span>
          </td>
        </tr>
        ` : ''}
        
        <!-- Venue -->
        ${venueString ? `
        <tr>
          <td width="30" valign="top" style="padding: 10px 0; font-size: 18px;">📍</td>
          <td valign="top" style="padding: 10px 0; color: #CBD5E1;">
            <strong style="color: #FFFFFF;">Venue:</strong><br/>
            <span style="font-size: 13px; color: #94A3B8;">${venueString}</span><br/>
            ${eventInfo.address ? `<a href="${mapLink}" target="_blank" style="color: #9AE900; text-decoration: none; font-size: 12px; font-weight: 700; display: inline-block; margin-top: 4px;">🗺️ View Location Map</a>` : ''}
          </td>
        </tr>
        ` : ''}
        
        <!-- Division -->
        ${vars.division ? `
        <tr>
          <td width="30" valign="top" style="padding: 10px 0; font-size: 18px;">🎾</td>
          <td valign="top" style="padding: 10px 0; color: #CBD5E1;">
            <strong style="color: #FFFFFF;">Division:</strong><br/>
            <span style="font-size: 13px; color: #94A3B8;">${vars.division}</span>
          </td>
        </tr>
        ` : ''}
        
        <!-- Partner -->
        ${vars.partnerName ? `
        <tr>
          <td width="30" valign="top" style="padding: 10px 0; font-size: 18px;">👥</td>
          <td valign="top" style="padding: 10px 0; color: #CBD5E1;">
            <strong style="color: #FFFFFF;">Partner:</strong><br/>
            <span style="font-size: 13px; color: #94A3B8;">${vars.partnerName}</span>
          </td>
        </tr>
        ` : ''}
        
        <!-- Status / Cost -->
        <tr>
          <td width="30" valign="top" style="padding: 10px 0; font-size: 18px;">💵</td>
          <td valign="top" style="padding: 10px 0; color: #CBD5E1;">
            <strong style="color: #FFFFFF;">${costLabel}</strong><br/>
            <span style="color: ${isPaid ? '#9AE900' : '#F59E0B'}; font-weight: 800; font-size: 15px;">${costValue}</span>
            <div style="margin-top: 6px;">${statusBadge}</div>
          </td>
        </tr>

        <!-- Organizer -->
        ${eventInfo.organizer_name ? `
        <tr>
          <td width="30" valign="top" style="padding: 12px 0 0 0; font-size: 18px; border-top: 1px solid rgba(255,255,255,0.05);">📞</td>
          <td valign="top" style="padding: 12px 0 0 0; color: #CBD5E1; border-top: 1px solid rgba(255,255,255,0.05);">
            <strong style="color: #FFFFFF;">Need help? Contact host:</strong><br/>
            <span style="font-size: 12.5px; color: #94A3B8;">
              ${eventInfo.organizer_name}
              ${eventInfo.organizer_email ? `<br/>✉️ <a href="mailto:${eventInfo.organizer_email}" style="color: #9AE900; text-decoration: none;">${eventInfo.organizer_email}</a>` : ''}
              ${eventInfo.organizer_phone ? `<br/>📞 ${eventInfo.organizer_phone}` : ''}
            </span>
          </td>
        </tr>
        ` : ''}
      </table>
    </div>
  `;
}

// Generate premium HTML layouts based on template parameters
async function generateEmailBody(
  supabaseAdmin: any,
  template: string,
  vars: any
): Promise<{ subject: string; html: string }> {
  let subject = '';
  let contentHtml = '';
  let actionUrl = '';
  let actionLabel = '';

  // 1. Fetch calendar event details if eventId is provided to enrich variables
  let eventInfo: any = null;
  const eventId = vars.eventId || vars.event_id;
  if (eventId) {
    try {
      const { data } = await supabaseAdmin
        .from('calendar')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();
      if (data) {
        eventInfo = data;
        vars.eventName = vars.eventName || eventInfo.event_name;
        vars.eventDates = vars.eventDates || eventInfo.event_dates;
        vars.venue = vars.venue || eventInfo.venue;
        vars.city = vars.city || eventInfo.city;
        vars.address = vars.address || eventInfo.address;
        vars.organizerName = vars.organizerName || eventInfo.organizer_name;
        vars.organizerEmail = vars.organizerEmail || eventInfo.organizer_email;
        vars.organizerPhone = vars.organizerPhone || eventInfo.organizer_phone;
        vars.rulesRegs = vars.rulesRegs || eventInfo.rules_regs;
        vars.eventUrl = vars.eventUrl || `https://4mpadel.co.za/calendar/${eventInfo.slug || eventInfo.id}`;
      }
    } catch (err) {
      console.error('Database Event Query Error:', err.message);
    }
  }

  const eventCardHtml = eventInfo ? generateEventCardHtml(eventInfo, vars) : '';

  switch (template) {
    case 'broadcast':
      subject = vars.subject || 'Important Update from 4M Padel';
      contentHtml = `
        <h2 style="font-size: 22px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Important Announcement</h2>
        <div style="font-size: 14.5px; line-height: 1.7; color: #E2E8F0; white-space: pre-wrap; font-family: 'Outfit', sans-serif;">${vars.message || ''}</div>
      `;
      if (vars.actionUrl) actionUrl = vars.actionUrl;
      if (vars.actionLabel) actionLabel = vars.actionLabel;
      break;

    case 'welcome':
      subject = 'Welcome to 4M Padel South Africa! 🎾';
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Welcome to the Court, ${vars.name || 'Player'}! 🏆</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px; font-family: 'Outfit', sans-serif;">
          Your official SAPA-linked player profile is active and ready. With 4M Padel, you can easily discover sanctioned tournaments, register with partners, and track your rolling ranking points live.
        </p>
        <div style="background-color: #1F2937; border-left: 4px solid #9AE900; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h3 style="font-size: 13px; font-weight: 900; text-transform: uppercase; color: #9AE900; margin-top: 0; margin-bottom: 12px; letter-spacing: 1px;">⚡ Getting Started</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 13.5px; color: #E2E8F0; line-height: 1.8;">
            <li style="margin-bottom: 8px;"><strong style="color: #FFFFFF;">SAPA License:</strong> Verify your membership license in your profile to play in sanctioned events.</li>
            <li style="margin-bottom: 8px;"><strong style="color: #FFFFFF;">Find Tournaments:</strong> Browse the active calendar to register for upcoming tiers.</li>
            <li style="margin-bottom: 0;"><strong style="color: #FFFFFF;">Track Rankings:</strong> View your live rolling points as soon as matches are uploaded!</li>
          </ul>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #64748B; margin-bottom: 0;">
          To play in sanctioned tier events and earn official ranking points, make sure to verify your SAPA membership licence directly inside your profile.
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/profile';
      actionLabel = 'View My Profile';
      break;

    case 'event_entry':
      subject = `Registration Confirmed: ${vars.eventName || 'Tournament'}! 🏆`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Your Spot is Reserved!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, your registration and payment for <strong style="color: #FFFFFF;">${vars.eventName || 'Tournament'}</strong> has been confirmed!
        </p>
        ${eventCardHtml}
        <p style="font-size: 13.5px; line-height: 1.6; color: #64748B; margin-top: 24px; margin-bottom: 0;">
          Organisers will publish draws and schedules shortly. You will receive an immediate notification as soon as the bracket is live.
        </p>
      `;
      actionUrl = vars.eventUrl || `https://4mpadel.co.za/calendar`;
      actionLabel = 'View Event Details';
      break;

    case 'org_applied':
      subject = 'Organisation Application Received - 4M Padel 🏢';
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Application Under Review</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Thank you for applying to register <strong style="color: #FFFFFF;">${vars.orgName}</strong> as an approved tournament host on 4M Padel.
        </p>
        <div style="background: linear-gradient(135deg, #1F2937, #111827); border: 1px solid rgba(154, 233, 0, 0.15); border-radius: 16px; padding: 24px; margin-bottom: 24px; text-align: left;">
          <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #F59E0B; letter-spacing: 1.5px; margin-bottom: 8px;">Status: Pending Review</div>
          <p style="font-size: 13.5px; line-height: 1.6; color: #E2E8F0; margin: 0;">
            Our administration panel (SAPA Federation) is currently reviewing your venue capacity and credentials. This review typically takes 24–48 hours.
          </p>
        </div>
        <p style="font-size: 13.5px; line-height: 1.6; color: #64748B; margin-bottom: 0;">
          You will receive an email notification as soon as your host account has been approved.
        </p>
      `;
      break;

    case 'admin_org_applied':
      subject = `⚠️ Action Required: New Organisation Pending Review!`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #F59E0B; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">New Organisation Application</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          A new host has applied to register an organisation. Review their credentials to approve or reject their portal access.
        </p>
        <div style="background: linear-gradient(135deg, #1F2937, #111827); border: 1px solid rgba(255,255,255,0.05); padding: 24px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #9AE900; margin-top: 0; margin-bottom: 16px; letter-spacing: 1.5px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">Application Summary</h3>
          <table width="100%" style="font-size: 13.5px; color: #E2E8F0; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Club Name:</td>
              <td align="right" style="font-weight: bold; color: #FFFFFF;">${vars.orgName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Applicant Name:</td>
              <td align="right" style="font-weight: bold; color: #FFFFFF;">${vars.creatorName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Contact Email:</td>
              <td align="right" style="font-weight: bold; color: #9AE900;">${vars.contactEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Contact Phone:</td>
              <td align="right" style="font-weight: bold; color: #FFFFFF;">${vars.contactPhone || 'N/A'}</td>
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
        <h2 style="font-size: 24px; font-weight: 800; color: #9AE900; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Welcome to the Host Network!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          We are thrilled to inform you that your application for <strong style="color: #FFFFFF;">${vars.orgName}</strong> has been <strong style="color: #9AE900;">APPROVED</strong> by the SAPA Federation!
        </p>
        <p style="font-size: 14.5px; line-height: 1.7; color: #E2E8F0; margin-bottom: 24px;">
          Your **Organisation Dashboard** is now unlocked. You can access it directly by logging into your player profile. You can now immediately create sanctioned tournaments, schedule match timelines, and manage live scorecards!
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Open Host Dashboard';
      break;

    case 'org_rejected':
      subject = 'Update on your Organisation Application';
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #EF4444; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Application Feedback</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Thank you for applying to register <strong style="color: #FFFFFF;">${vars.orgName}</strong>. Unfortunately, our administration team has declined your application at this time.
        </p>
        <div style="background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); padding: 24px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #EF4444; margin-top: 0; margin-bottom: 10px; letter-spacing: 1px;">Reviewer Notes</h3>
          <p style="font-size: 13.5px; line-height: 1.6; color: #FCA5A5; margin: 0;">
            ${vars.notes || 'Please verify your contact details and club venue credentials before resubmitting.'}
          </p>
        </div>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 0;">
          If you have resolved the items listed above, you can re-apply directly from your profile dashboard.
        </p>
      `;
      actionUrl = 'https://4mpadel.co.za/profile';
      actionLabel = 'Re-apply Now';
      break;

    case 'event_pending_sanction':
      subject = `🏆 Sanction Requested: ${vars.eventName || 'New Event'}`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Sanctioning Review Required</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          The approved host club <strong style="color: #FFFFFF;">${vars.orgName}</strong> has created a new tournament and requested official sanctioning status:
        </p>
        ${eventCardHtml}
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Review Tournament';
      break;

    case 'event_sanctioned':
      subject = `Tournament Sanctioned & Live: ${vars.eventName}! 🏆`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #9AE900; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Your Event is Live!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Great news! The SAPA Federation has officially <strong style="color: #9AE900;">SANCTIONED</strong> your event: <strong style="color: #FFFFFF;">${vars.eventName}</strong>.
        </p>
        <p style="font-size: 14.5px; line-height: 1.7; color: #E2E8F0; margin-bottom: 24px;">
          Your tournament is now live on the public Calendar and is fully open to accept player registrations and Paystack payments. Open your dashboard to monitor registered entries or configure seeds!
        </p>
        ${eventCardHtml}
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Manage Event';
      break;

    case 'event_rejected':
      subject = `Sanction Update: ${vars.eventName}`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #EF4444; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Sanction Status Update</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Our administration team has reviewed your tournament request for <strong style="color: #FFFFFF;">${vars.eventName}</strong> and declined sanctioning status at this time.
        </p>
        <div style="background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); padding: 24px; border-radius: 16px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #EF4444; margin-top: 0; margin-bottom: 10px; letter-spacing: 1px;">Reviewer Notes</h3>
          <p style="font-size: 13.5px; line-height: 1.6; color: #FCA5A5; margin: 0;">
            ${vars.notes || 'Please adjust the schedule times or venue maps to prevent overlaps with other regional Gold tournaments.'}
          </p>
        </div>
        ${eventCardHtml}
      `;
      actionUrl = 'https://4mpadel.co.za/admin';
      actionLabel = 'Edit Event Details';
      break;

    case 'draws_ready':
      subject = `Draws Published: ${vars.eventName}! 🎾`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Draw Bracket Published!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, the tournament draws and brackets for <strong style="color: #FFFFFF;">${vars.eventName}</strong> are now live!
        </p>
        <div style="background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); padding: 24px; border-radius: 16px; margin-bottom: 28px; font-family: 'Outfit', sans-serif;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #9AE900; margin-top: 0; margin-bottom: 16px; letter-spacing: 1px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">🎾 First Match Details</h3>
          <table width="100%" style="font-size: 13.5px; color: #E2E8F0; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Opponent:</td>
              <td align="right" style="font-weight: bold; color: #FFFFFF;">${vars.opponentName || 'TBD'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Scheduled Time:</td>
              <td align="right" style="font-weight: bold; color: #FFFFFF;">${vars.scheduledTime || 'TBD'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Court Assigned:</td>
              <td align="right" style="font-weight: 900; color: #9AE900;">${vars.court || 'TBD'}</td>
            </tr>
          </table>
        </div>
        ${eventCardHtml}
      `;
      actionUrl = vars.eventUrl || 'https://4mpadel.co.za/calendar';
      actionLabel = 'View Live Bracket';
      break;

    case 'event_registration':
      subject = `You're Registered: ${vars.eventName || 'Tournament'}! 🎾`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Registration Received!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, we have recorded your registration for <strong style="color: #FFFFFF;">${vars.eventName}</strong>.
          ${!vars.paid && vars.amountDue && vars.amountDue !== 'R 0.00' ? `<br/>There is an outstanding entry fee balance of <strong style="color:#F59E0B;">${vars.amountDue}</strong>. You can settle it anytime from your dashboard.` : ''}
        </p>
        ${eventCardHtml}
      `;
      actionUrl = vars.payUrl || vars.eventUrl || 'https://4mpadel.co.za/calendar';
      actionLabel = !vars.paid && vars.amountDue && vars.amountDue !== 'R 0.00' ? 'Pay Entry Fee' : 'View Event Details';
      break;

    case 'payment_confirmation':
      subject = `Payment Confirmed: ${vars.eventName || 'Tournament'} ✅`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #9AE900; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Payment Received!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, we've received your payment. Your registration is now fully confirmed. Thank you!
        </p>
        ${eventCardHtml}
        ${vars.lineItems ? `
        <div style="background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 24px; border-radius: 16px; margin-bottom: 24px; font-family: 'Outfit', sans-serif;">
          <h3 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #9AE900; margin-top: 0; margin-bottom: 16px; letter-spacing: 1px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">🧾 Transaction Receipt</h3>
          <div style="font-size: 13.5px; color: #CBD5E1; white-space: pre-wrap; line-height: 1.6;">${vars.lineItems}</div>
          <table width="100%" style="font-size: 13.5px; color: #E2E8F0; border-collapse: collapse; margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);">
            <tr>
              <td style="padding: 12px 0 0; color: #64748B; font-weight: 600;">Total Paid:</td>
              <td align="right" style="padding: 12px 0 0; color: #9AE900; font-weight: 900; font-size: 16px;">${vars.amount || 'R 0.00'}</td>
            </tr>
            ${vars.reference ? `
            <tr>
              <td style="padding: 6px 0 0; color: #64748B;">Reference:</td>
              <td align="right" style="font-weight: 600; font-size: 11px; color: #94A3B8; font-family: monospace;">${vars.reference}</td>
            </tr>` : ''}
          </table>
        </div>
        ` : ''}
      `;
      actionUrl = vars.eventUrl || 'https://4mpadel.co.za/calendar';
      actionLabel = 'View Event Details';
      break;

    case 'partner_entry_paid':
      subject = vars.pendingPayment
        ? `You're entered: ${vars.eventName || 'Tournament'} 🎾`
        : `Entry paid: ${vars.eventName || 'Tournament'} ✅`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">${vars.pendingPayment ? "You've Been Entered!" : 'Your Entry is Confirmed!'}</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, <strong style="color: #FFFFFF;">${vars.payerName || 'Your partner'}</strong> has registered you for <strong style="color: #FFFFFF;">${vars.eventName}</strong>
          ${vars.pendingPayment
            ? ' and will cover your entry fee. We will confirm your slot as soon as their transaction completes.'
            : ' and has paid your entry fee. Your spot in the division is fully secured.'}
        </p>
        ${eventCardHtml}
      `;
      actionUrl = vars.eventUrl || 'https://4mpadel.co.za/calendar';
      actionLabel = 'View Event Details';
      break;

    case 'entry_withdrawn':
      const isPartnerRole = vars.recipientRole === 'partner';
      subject = isPartnerRole
        ? `${vars.withdrawnPlayerName || 'Your partner'} withdrew from ${vars.eventName || 'Tournament'}`
        : `Withdrawal confirmed: ${vars.eventName || 'Tournament'}`;
      contentHtml = isPartnerRole ? `
        <h2 style="font-size: 24px; font-weight: 800; color: #EF4444; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Partner Withdrawal</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, <strong style="color: #FFFFFF;">${vars.withdrawnPlayerName || 'Your partner'}</strong> has withdrawn from <strong style="color: #FFFFFF;">${vars.eventName}</strong> in the <strong style="color: #FFFFFF;">${vars.division || 'Open'}</strong> division.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #64748B; margin-bottom: 24px;">
          Your paired entry for this division has also been withdrawn. You can register again with a different partner or division if slots are available.
        </p>
        ${generateEventCardHtml(eventInfo, { ...vars, statusOverride: 'withdrawn' })}
      ` : `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Withdrawal Confirmed</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, you have successfully withdrawn from <strong style="color: #FFFFFF;">${vars.eventName}</strong> in the <strong style="color: #FFFFFF;">${vars.division || 'Open'}</strong> division.
          ${vars.partnerName ? `<br/>Your partner <strong style="color: #FFFFFF;">${vars.partnerName}</strong> has been notified and their paired entry was withdrawn.` : ''}
        </p>
        ${generateEventCardHtml(eventInfo, { ...vars, statusOverride: 'withdrawn' })}
      `;
      actionUrl = vars.eventUrl || 'https://4mpadel.co.za/calendar';
      actionLabel = 'View Event Calendar';
      break;

    case 'partner_invite':
      subject = `${vars.inviterName || 'Your partner'} registered you for ${vars.eventName || 'a tournament'}! 🎾`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">You've Been Invited!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, <strong style="color: #FFFFFF;">${vars.inviterName || 'Your partner'}</strong> has registered you as their partner for <strong style="color: #FFFFFF;">${vars.eventName}</strong> in the <strong style="color: #FFFFFF;">${vars.division || 'Open'}</strong> division.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #E2E8F0; margin-bottom: 24px;">
          To secure your team's spot in the draw, please complete your entry fee payment using the link below.
        </p>
        ${eventCardHtml}
      `;
      actionUrl = vars.payUrl || 'https://4mpadel.co.za/calendar';
      actionLabel = 'Pay My Entry Fee';
      break;

    case 'payment_reminder_general':
      subject = `Payment Reminder: ${vars.eventName || 'Tournament'} 🎾`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Complete Your Entry Payment</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, this is a friendly reminder that we have not received payment for your registration in <strong style="color: #FFFFFF;">${vars.eventName || 'Tournament'}</strong>.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #E2E8F0; margin-bottom: 24px;">
          Please secure your spot in the bracket by clicking the button below to pay your entry fee.
        </p>
        ${eventCardHtml}
      `;
      actionUrl = vars.payUrl || 'https://4mpadel.co.za/calendar';
      actionLabel = 'Pay Entry Fee';
      break;

    case 'payment_reminder_deadline':
      subject = `⚠️ URGENT: Registration Closes Soon for ${vars.eventName || 'Tournament'}!`;
      contentHtml = `
        <h2 style="font-size: 24px; font-weight: 800; color: #EF4444; margin-top: 0; margin-bottom: 16px; font-family: 'Outfit', sans-serif;">Action Required: Deadline Closing!</h2>
        <p style="font-size: 14.5px; line-height: 1.7; color: #94A3B8; margin-bottom: 24px;">
          Hi ${vars.playerName || 'Player'}, registration for <strong style="color: #FFFFFF;">${vars.eventName || 'Tournament'}</strong> is closing soon!
        </p>
        <div style="background-color: rgba(239, 68, 68, 0.08); border-left: 4px solid #EF4444; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="font-size: 13.5px; line-height: 1.6; color: #FCA5A5; margin: 0; font-weight: 600;">
            ⚠️ Unpaid registrations will not be seeded or included in the final tournament draw brackets. To avoid being removed, please complete your payment immediately.
          </p>
        </div>
        ${eventCardHtml}
      `;
      actionUrl = vars.payUrl || 'https://4mpadel.co.za/calendar';
      actionLabel = 'Pay Entry Fee Now';
      break;

    default:
      subject = vars.subject || 'Notification from 4M Padel';
      contentHtml = `<p style="font-size: 14.5px; line-height: 1.7; color: #E2E8F0; font-family: 'Outfit', sans-serif;">${vars.message || ''}</p>`;
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

    const { to, template, variables, bcc } = await req.json();

    if (!to && !bcc) {
      throw new Error('Missing recipient email (to or bcc)');
    }
    if (!template) {
      throw new Error('Missing email template identifier');
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Compile beautiful HTML body and subject (asynchronous for db lookup)
    const { subject, html } = await generateEmailBody(supabaseAdmin, template, variables || {});

    // Check if verified sender domain exists, otherwise fallback to custom domain
    const verifiedSender = Deno.env.get('RESEND_VERIFIED_SENDER') || 'notifications.4mpadel.co.za';
    const fromAddress = verifiedSender === 'onboarding@resend.dev' 
      ? '"4M Padel SA" <onboarding@resend.dev>' 
      : verifiedSender.includes('@')
        ? `"4M Padel SA" <${verifiedSender}>`
        : `"4M Padel SA" <noreply@${verifiedSender}>`;

    let finalTo = to ? (Array.isArray(to) ? to : [to]) : undefined;
    let finalBcc = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined;
    
    let finalHtml = html;

    // Sandbox redirect logic: if using onboarding domain, redirect non-owner emails to brad@dotsandcoms.co.za
    const sandboxOwner = 'brad@dotsandcoms.co.za';
    if (verifiedSender === 'onboarding@resend.dev') {
      const allRecipients = [...(finalTo || []), ...(finalBcc || [])];
      const needsRedirect = allRecipients.some(email => email.toLowerCase() !== sandboxOwner.toLowerCase());
      if (needsRedirect) {
        const originalRecipients = allRecipients.join(', ');
        console.warn(`[SANDBOX REDIRECT] Redirecting test email from [${originalRecipients}] to owner [${sandboxOwner}] due to Resend sandbox limits.`);
        finalTo = [sandboxOwner];
        finalBcc = undefined; // clear bcc when redirecting to owner
        
        // Inject a premium glassmorphic sandbox warning banner at the top of the content
        const sandboxBanner = `
          <div style="background-color: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); padding: 20px; border-radius: 16px; margin-bottom: 24px; font-family: 'Outfit', 'Inter', Helvetica, Arial, sans-serif; text-align: left;">
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

    console.info(`Dispatching Resend email template [${template}] to TO: ${finalTo?.join(', ') || 'none'} | BCC: ${finalBcc?.length || 0} recipients`);

    const payload: any = {
        from: fromAddress,
        subject: subject,
        html: finalHtml,
    };
    if (finalTo) payload.to = finalTo;
    if (finalBcc) {
        payload.bcc = finalBcc;
        if (!payload.to) {
            payload.to = [fromAddress]; // Mail it to ourselves, bcc everyone else
        }
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
