import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Setup Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SAPA_ORG_ID = '11331';
const API_BASE = 'https://api.rankedin.com/v1';

// Helper to format dates matching the frontend logic
const formatEventDates = (start, end) => {
    if (!start) return '';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;

    const tzOffsetStart = startDate.getTimezoneOffset() * 60000;
    const correctedStart = new Date(startDate.getTime() + tzOffsetStart);

    const startDay = correctedStart.getDate();
    const startMonth = correctedStart.toLocaleString('default', { month: 'long' });
    const startYear = correctedStart.getFullYear();

    if (!endDate || start === end) {
        return `${startDay} ${startMonth} ${startYear}`;
    }

    const tzOffsetEnd = endDate.getTimezoneOffset() * 60000;
    const correctedEnd = new Date(endDate.getTime() + tzOffsetEnd);

    const endDay = correctedEnd.getDate();
    const endMonth = correctedEnd.toLocaleString('default', { month: 'long' });
    const endYear = correctedEnd.getFullYear();

    if (startMonth === endMonth && startYear === endYear) {
        return `${startDay} - ${endDay} ${startMonth}`;
    } else if (startYear === endYear) {
        return `${startDay} ${startMonth.substring(0, 3)} - ${endDay} ${endMonth.substring(0, 3)}`;
    } else {
        return `${startDay} ${startMonth.substring(0, 3)} ${startYear} - ${endDay} ${endMonth.substring(0, 3)} ${endYear}`;
    }
};

const extractEventDetails = async (page, eventUrl) => {
    console.log(`Navigating to ${eventUrl}...`);
    try {
        await page.goto(eventUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        await new Promise(r => setTimeout(r, 5000)); // wait for client-side render (increased for reliability)

        const pageData = await page.evaluate(() => {
            const text = document.body.innerText;

            // 1. Target the specific event banner image
            const bannerImg = document.querySelector('.event-banner img');
            const posterUrl = bannerImg ? bannerImg.src : null;

            // Scrape sponsor logos - try multiple selectors as they can vary
            let sponsorLogos = [];

            // Priority 1: .logos container
            const logoElements = document.querySelectorAll('.logos img');
            if (logoElements.length > 0) {
                sponsorLogos = Array.from(logoElements).map(img => img.src);
            }

            // Priority 2: Fallback heuristic if .logos is missing but we see upload images
            if (sponsorLogos.length === 0) {
                const uploadImgs = Array.from(document.querySelectorAll('img[src*="upload/tournament/"]'));
                // Filter out the banner if we found it
                sponsorLogos = uploadImgs
                    .map(img => img.src)
                    .filter(src => src !== posterUrl);
            }

            // 2. Extract registration count
            // Look for patterns like "37 registered players" or "37 registered teams"
            let registeredCount = 0;
            const regExp = /(\d+)\s+registered\s+(players|teams|participants)/i;
            const match = text.match(regExp);
            if (match) {
                registeredCount = parseInt(match[1], 10);
            }

            return {
                text,
                imageUrl: posterUrl,
                registeredCount: registeredCount,
                sponsorLogos: sponsorLogos
            };
        });

        const text = pageData.text;

        // Parse Text with Regex
        let venue = '';
        let address = '';
        const locMatch = text.match(/Location\s+([^\n]+)\n([^\n]+)/);
        if (locMatch) {
            venue = locMatch[1].trim();
            address = locMatch[2].trim();
        }

        let description = '';
        const regMatch = text.match(/Regulations\s*([\s\S]*?)(?:Show more|Admin|Contact admin|Advertisement)/i);
        if (regMatch) {
            description = regMatch[1].trim();
        }

        return {
            venue,
            address,
            description,
            image_url: pageData.imageUrl,
            registered_players: pageData.registeredCount,
            rankedin_url: eventUrl,
            sponsor_logos: pageData.sponsorLogos || []
        };

    } catch (e) {
        console.error(`Failed to extract details for ${eventUrl}:`, e.message);
        return null;
    }
};

const determineStatus = (eventName) => {
    const nameStr = eventName.toLowerCase();
    if (nameStr.includes('major')) return 'Major';
    if (nameStr.includes('super gold') || nameStr.includes('s gold')) return 'S Gold';
    if (nameStr.includes('gold')) return 'Gold';
    if (nameStr.includes('silver')) return 'Silver';
    if (nameStr.includes('fip')) return 'FIP event';
    if (nameStr.includes('key')) return 'Key Event';
    return 'Gold'; // default
};

const run = async () => {
    console.log('Fetching Rankedin Events...');
    try {
        // Fetch Upcoming and Finished events
        const [upcomingRes, finishedRes] = await Promise.all([
            fetch(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=false&Language=en&skip=0&take=100`),
            fetch(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=true&Language=en&skip=0&take=100`)
        ]);

        const upcomingData = await upcomingRes.json();
        const finishedData = await finishedRes.json();

        const allEvents = [...(upcomingData.payload || []), ...(finishedData.payload || [])];
        console.log(`Found ${allEvents.length} events total.`);

        if (allEvents.length === 0) return;

        // Get existing events to avoid recreating them blindly if we don't have to,
        // though we will use an upsert approach matching on event_name or slug.
        const { data: existingEvents, error: dbError } = await supabase.from('calendar').select('id, event_name, slug');
        if (dbError) throw dbError;

        const existingMap = new Map();
        existingEvents.forEach(e => existingMap.set(e.event_name.toLowerCase(), e));

        console.log('Launching Puppeteer...');
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

        for (const event of allEvents) {
            console.log(`\nProcessing: ${event.eventName}`);

            const joinUrlFull = event.joinUrl ? `https://www.rankedin.com${event.joinUrl}` : `https://www.rankedin.com${event.eventUrl}`;

            const page = await browser.newPage();
            const details = await extractEventDetails(page, joinUrlFull);
            await page.close();

            if (!details) {
                console.log(`Skipping ${event.eventName} due to extraction failure.`);
                continue;
            }

            const slug = event.eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const startDateStr = event.startDate ? event.startDate.substring(0, 10) : null;
            const endDateStr = event.endDate ? event.endDate.substring(0, 10) : null;
            const startTimeStr = event.startDate ? event.startDate.substring(11, 16) : null;
            const endTimeStr = event.endDate ? event.endDate.substring(11, 16) : null;

            const payload = {
                event_name: event.eventName,
                slug: slug,
                city: event.city || '',
                venue: details.venue || event.club || '',
                address: details.address || '',
                sapa_status: determineStatus(event.eventName),
                description: details.description || '',
                start_date: startDateStr,
                end_date: endDateStr,
                start_time: startTimeStr,
                end_time: endTimeStr,
                event_dates: formatEventDates(startDateStr, endDateStr),
                organizer_name: 'SAPA',
                image_url: details.image_url || '',
                registered_players: details.registered_players || 0,
                rankedin_url: details.rankedin_url || '',
                sponsor_logos: details.sponsor_logos || []
            };

            const existing = existingMap.get(event.eventName.toLowerCase());

            if (existing) {
                console.log(`Updating existing event (ID: ${existing.id})`);
                const { error } = await supabase.from('calendar').update(payload).eq('id', existing.id);
                if (error) console.error(`Error updating ${event.eventName}:`, error.message);
                else console.log(`✓ Updated successfully`);
            } else {
                console.log(`Creating new event`);
                const { error } = await supabase.from('calendar').insert([payload]);
                if (error) console.error(`Error creating ${event.eventName}:`, error.message);
                else console.log(`✓ Created successfully`);
            }
        }

        await browser.close();
        console.log('\nFinished syncing all events.');

    } catch (e) {
        console.error('Migration failed:', e);
    }
};

run();
