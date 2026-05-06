// scripts/sync-rankedin.js
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase environment variables! Cannot run sync.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: {
        transport: WebSocket,
    },
});

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

async function syncRankedin() {
    console.log('Starting automated RankedIn Sync...');

    try {
        const API_BASE = 'https://api.rankedin.com/v1';
        const SAPA_ORG_ID = '11331';

        // 1. Fetch from database first to check for matches
        const { data: events, error: dbError } = await supabase.from('calendar').select('*');
        if (dbError) throw dbError;

        console.log(`Found ${events.length} existing events in database.`);

        // 2. Fetch from Rankedin (Both finished and upcoming)
        console.log('Fetching from RankedIn API...');
        const [finishedRes, upcomingRes] = await Promise.all([
            fetch(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=true&Language=en&skip=0&take=100`),
            fetch(`${API_BASE}/Organization/GetOrganisationEventsAsync?organisationId=${SAPA_ORG_ID}&IsFinished=false&Language=en&skip=0&take=100`)
        ]);

        if (!finishedRes.ok || !upcomingRes.ok) {
            throw new Error(`RankedIn API failed! Finished: ${finishedRes.status}, Upcoming: ${upcomingRes.status}`);
        }

        const finishedData = await finishedRes.json();
        const upcomingData = await upcomingRes.json();

        const allRankedinEvents = [
            ...(finishedData.payload || []),
            ...(upcomingData.payload || [])
        ];

        if (allRankedinEvents.length === 0) {
            console.log('No events found from RankedIn.');
            return;
        }

        console.log(`Fetched ${allRankedinEvents.length} total events from RankedIn. Processing...`);

        // 3. Process events
        let addedCount = 0;
        let updatedCount = 0;

        for (const re of allRankedinEvents) {
            // Determine ID based on different possible RankedIn API response casing
            const rankedinIdStr = (re.eventId || re.Id || re.id)?.toString();
            if (!rankedinIdStr) continue;

            const evName = re.eventName || re.name || re.Name || '';
            const evLink = re.eventUrl || re.link || re.Link || '';
            const sDate = re.startDate || re.StartDate || '';
            const eDate = re.endDate || re.EndDate || sDate;
            const isLeague = re.type === 2;
            const evState = re.eventState || re.EventState || re.state || re.State;
            const isCancelled = evState === 2;

            if (!evName) continue; // Skip truly blank events

            // Build rankedin URL
            let fullUrl = '';
            const baseUrlPath = isLeague ? 'clubleague' : 'tournament';

            if (evLink) {
                fullUrl = evLink.startsWith('http') ? evLink : `https://www.rankedin.com${evLink.startsWith('/') ? '' : '/'}${evLink}`;
            } else if (re.slug || re.Slug) {
                fullUrl = `https://www.rankedin.com/en/${baseUrlPath}/${rankedinIdStr}/${re.slug || re.Slug}`;
            } else {
                // Guess URL fallback
                const guessedSlug = evName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                fullUrl = `https://www.rankedin.com/en/${baseUrlPath}/${rankedinIdStr}/${guessedSlug}`;
            }

            // --- FETCH RICH DETAILS ---
            let richDetails = {};
            try {
                const infoUrl = isLeague
                    ? `${API_BASE}/ClubLeague/GetClubleagueInfoAsync?id=${rankedinIdStr}&language=en`
                    : `${API_BASE}/tournament/GetInfoAsync?id=${rankedinIdStr}&language=en`;
                const regUrl = isLeague
                    ? `${API_BASE}/ClubLeague/GetRegulationsAsync?id=${rankedinIdStr}`
                    : `${API_BASE}/tournament/GetRegulationsAsync?id=${rankedinIdStr}`;

                const [infoRes, regRes] = await Promise.all([
                    fetch(infoUrl),
                    fetch(regUrl)
                ]);

                if (infoRes.ok) {
                    const infoData = await infoRes.json();
                    try {
                        let regText = regRes.ok ? await regRes.text() : '';
                        if (regText.startsWith('"')) regText = JSON.parse(regText);
                        richDetails.description = regText;
                    } catch (e) {
                        richDetails.description = '';
                    }

                    // Handle different key naming in different API types
                    const sidebar = infoData.TournamentSidebarModel || infoData.ClubleagueSidebarModel || infoData;
                    richDetails.address = sidebar.Address || sidebar.address || '';
                    richDetails.registered_players = sidebar.TotalUniquePersonsInTournament || sidebar.PlayersCount || 0;
                    richDetails.venue = sidebar.LocationName || sidebar.locationName || '';
                    richDetails.organizer_name = sidebar.ClubName || sidebar.clubName || 'SAPA';

                    // Extract images
                    const logosModel = infoData.EventLogosModel || infoData.ClubleagueLogosModel || infoData.Logos || infoData;
                    const logos = logosModel?.LogoUrls || logosModel?.logoUrls || [];
                    richDetails.sponsor_logos = logos;
                    richDetails.image_url = logosModel?.PosterUrl || logosModel?.posterUrl || (logos.length > 0 ? logos[0] : '');
                }
            } catch (e) {
                console.error(`Failed to fetch rich details for ${rankedinIdStr}:`, e);
            }

            // --- MATCHING LOGIC (Prioritize rankedin_id) ---
            const matchById = events.find(e => {
                if (e.rankedin_id && e.rankedin_id.toString() === rankedinIdStr) return true;
                // Fallback to URL matching if id column is missing/empty but URL exists
                return e.rankedin_url && e.rankedin_url.includes(`/${rankedinIdStr}/`);
            });

            // Enhanced matching logic for names that might be slightly different
            const normalizeStr = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
            const reNameNorm = normalizeStr(evName);

            const matchByName = !matchById && events.find(e => {
                if (!e.event_name) return false;
                const eNameNorm = normalizeStr(e.event_name);
                // Match if names are identical after removing spaces/punctuation
                if (eNameNorm === reNameNorm) return true;
                // Match if both contain "warren" and "pro" (specific catch for the KCC event)
                if (eNameNorm.includes('warren') && eNameNorm.includes('pro') && reNameNorm.includes('warren') && reNameNorm.includes('pro')) return true;
                // Match if the slug matches the guessed slug
                if (e.slug && e.slug === (re.slug || re.Slug)) return true;
                return false;
            });

            const existingEvent = matchById || matchByName;

            // Dates
            const formattedDates = formatEventDates(sDate, eDate);

            // Inferred status based on name
            const nLower = evName.toLowerCase();
            let inferredStatus = 'None';
            if (nLower.includes('fip')) inferredStatus = 'FIP event';
            else if (nLower.includes('super gold') || nLower.includes('s gold') || nLower.includes('sgold')) inferredStatus = 'Super Gold';
            else if (nLower.includes('major')) inferredStatus = 'Major';
            else if (nLower.includes('gold')) inferredStatus = 'Gold';
            else if (nLower.includes('bronze')) inferredStatus = 'Bronze';
            else if (nLower.includes('key')) inferredStatus = 'Key Event';

            if (existingEvent) {
                // Update missing or outdated fields safely
                let updates = {};
                let needsUpdate = false;

                // Always ensure rankedin_id is stored
                if (!existingEvent.rankedin_id || existingEvent.rankedin_id.toString() !== rankedinIdStr) {
                    updates.rankedin_id = rankedinIdStr;
                    needsUpdate = true;
                }

                if (!existingEvent.rankedin_url || (existingEvent.rankedin_url !== fullUrl && !existingEvent.rankedin_url.includes(rankedinIdStr))) {
                    updates.rankedin_url = fullUrl;
                    needsUpdate = true;
                }
                const newSDate = sDate ? sDate.substring(0, 10) : null;
                const newEDate = eDate ? eDate.substring(0, 10) : newSDate;

                if (newSDate && existingEvent.start_date !== newSDate) {
                    updates.start_date = newSDate;
                    needsUpdate = true;
                }
                if (newEDate && existingEvent.end_date !== newEDate) {
                    updates.end_date = newEDate;
                    needsUpdate = true;
                }
                if (existingEvent.event_dates !== formattedDates && formattedDates !== '') {
                    updates.event_dates = formattedDates;
                    needsUpdate = true;
                }

                // Update rich details
                if (richDetails.description && (existingEvent.description !== richDetails.description)) {
                    updates.description = richDetails.description;
                    needsUpdate = true;
                }
                if (richDetails.image_url && existingEvent.image_url !== richDetails.image_url) {
                    updates.image_url = richDetails.image_url;
                    needsUpdate = true;
                }
                if (richDetails.registered_players !== undefined && (existingEvent.registered_players !== richDetails.registered_players)) {
                    updates.registered_players = richDetails.registered_players;
                    needsUpdate = true;
                }
                if (richDetails.address !== undefined && existingEvent.address !== richDetails.address) {
                    updates.address = richDetails.address;
                    needsUpdate = true;
                }
                if (richDetails.venue !== undefined && existingEvent.venue !== richDetails.venue) {
                    updates.venue = richDetails.venue;
                    needsUpdate = true;
                }
                if (re.city !== undefined && existingEvent.city !== (re.city || '').trim()) {
                    updates.city = (re.city || '').trim();
                    needsUpdate = true;
                }
                if (richDetails.organizer_name && existingEvent.organizer_name !== richDetails.organizer_name) {
                    updates.organizer_name = richDetails.organizer_name;
                    needsUpdate = true;
                }
                if (richDetails.sponsor_logos && richDetails.sponsor_logos.length > 0) {
                    updates.sponsor_logos = richDetails.sponsor_logos;
                    needsUpdate = true;
                }

                // Update name if changed on RankedIn
                if (existingEvent.event_name !== evName) {
                    updates.event_name = evName;
                    needsUpdate = true;
                }
                
                // SMART UPDATES for manual fields:
                if (isLeague && !existingEvent.is_league) {
                    updates.is_league = true;
                    needsUpdate = true;
                }
                
                // Only update sapa_status if it's currently None, null, or empty
                if ((!existingEvent.sapa_status || existingEvent.sapa_status === 'None' || existingEvent.sapa_status === '') && inferredStatus !== 'None') {
                    updates.sapa_status = inferredStatus;
                    needsUpdate = true;
                }

                // Handle cancellation state
                if (isCancelled && existingEvent.is_visible !== false) {
                    updates.is_visible = false;
                    needsUpdate = true;
                } else if (!isCancelled && existingEvent.is_visible === false) {
                    // Re-enable if no longer cancelled
                    updates.is_visible = true;
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    const { error } = await supabase.from('calendar').update(updates).eq('id', existingEvent.id);
                    if (error) {
                        console.error(`Error updating event ${existingEvent.id}:`, error);
                    } else {
                        updatedCount++;
                    }
                }
            } else {
                // Insert new
                const slugVal = nLower.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

                const { error } = await supabase.from('calendar').insert([{
                    event_name: evName,
                    slug: slugVal,
                    event_dates: formattedDates,
                    start_date: sDate ? sDate.substring(0, 10) : null,
                    end_date: eDate ? eDate.substring(0, 10) : null,
                    sapa_status: inferredStatus,
                    organizer_name: richDetails.organizer_name || 'SAPA',
                    rankedin_id: rankedinIdStr,
                    rankedin_url: fullUrl,
                    city: (re.city || '').trim(),
                    venue: richDetails.venue || re.club || '',
                    description: richDetails.description || '',
                    image_url: richDetails.image_url || '',
                    registered_players: richDetails.registered_players || 0,
                    address: richDetails.address || '',
                    sponsor_logos: richDetails.sponsor_logos || [],
                    is_league: isLeague,
                    featured_live: false,
                    live_youtube_url: '',
                    youtube_playlist_url: '',
                    is_visible: !isCancelled
                }]);

                if (error) {
                    console.error(`Error inserting event ${evName}:`, error);
                } else {
                    addedCount++;
                }
            }
        }

        console.log(`Sync complete! Added: ${addedCount}, Updated: ${updatedCount}`);

    } catch (error) {
        console.error('Fatal sync error:', error);
        process.exit(1);
    }
}

syncRankedin();
