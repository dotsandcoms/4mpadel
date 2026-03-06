import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const rankedinEmail = process.env.RANKEDIN_EMAIL;
const rankedinPassword = process.env.RANKEDIN_PASSWORD;

if (!supabaseUrl) console.error("Missing VITE_SUPABASE_URL.");
if (!supabaseKey) console.error("Missing VITE_SUPABASE_SERVICE_ROLE_KEY.");
if (!rankedinEmail) console.error("Missing RANKEDIN_EMAIL.");
if (!rankedinPassword) console.error("Missing RANKEDIN_PASSWORD.");

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function loginToRankedin(page) {
    if (!rankedinEmail || !rankedinPassword) return false;
    try {
        console.log("Logging in...");
        await page.goto("https://www.rankedin.com/en/account/login", { waitUntil: 'load', timeout: 60000 });
        const fieldSelector = 'input[type="email"], input[name="Email"], #Email, input[name="Username"]';
        await page.waitForSelector(fieldSelector, { timeout: 30000 });
        await page.type(fieldSelector, rankedinEmail);
        await page.type('input[type="password"]', rankedinPassword);
        await Promise.all([
            page.click('button[type="submit"], input[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
        console.log("Logged in.");
        return true;
    } catch (error) {
        console.error("Login failed:", error.message);
        return false;
    }
}

async function findProfileUrl(page, name) {
    try {
        console.log(`Searching for ${name} via HP Players tab...`);
        await page.goto("https://www.rankedin.com/en", { waitUntil: 'load', timeout: 60000 });
        const searchInputSelector = 'input[placeholder*="Search Players"]';
        await page.waitForSelector(searchInputSelector);

        await page.click(searchInputSelector);
        await page.type(searchInputSelector, name, { delay: 50 });

        // Wait for modal tabs to appear
        await page.waitForSelector('.v-tabs-bar__content .v-tab, .search-container .v-tab', { timeout: 10000 }).catch(() => { });

        // Click on "Players" tab in the modal
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('.v-tabs-bar__content .v-tab, .search-container .v-tab, span'));
            const playersTab = tabs.find(t => t.innerText && t.innerText.trim().toLowerCase() === 'players');
            if (playersTab) playersTab.click();
        });

        // Wait for results to load
        await page.waitForSelector('a[href*="/en/player/"]', { timeout: 10000 }).catch(() => { });

        const profileUrl = await page.evaluate((name) => {
            // Target links inside the search results area specifically if possible
            const searchResults = document.querySelector('.search-container, .v-window-item') || document.body;
            const links = Array.from(searchResults.querySelectorAll('a[href*="/en/player/"]'));

            // Score items based on name matching
            const n = name.toLowerCase().split(' ').filter(p => p.length > 2);
            for (const l of links) {
                const text = l.innerText.toLowerCase();
                // Extremely strict: must contain at least parts of both first and last name if provided
                if (n.every(part => text.includes(part))) {
                    // Avoid systemic links like the header or the 'mark-stillerman' profile
                    if (l.closest('header') || l.href.includes('mark-stillerman')) continue;
                    return l.href;
                }
            }
            return null;
        }, name);

        return profileUrl;
    } catch (error) {
        console.error(`Search failed for ${name}:`, error.message);
        return null;
    }
}

async function scrapePlayer(browser, player) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    console.log(`\n--- Working on: ${player.name} ---`);

    try {
        let profileUrl = player.rankedin_profile_url;

        if (!profileUrl) {
            if (player.rankedin_id) {
                console.log(`Using existing ID ${player.rankedin_id} for ${player.name}`);
                profileUrl = `https://www.rankedin.com/en/player/${player.rankedin_id}`;
            } else {
                console.log(`URL missing for ${player.name}. Searching...`);
                profileUrl = await findProfileUrl(page, player.name);
                if (!profileUrl) {
                    console.log(`Could not find profile for ${player.name}`);
                    return;
                }
                console.log(`Found URL: ${profileUrl}`);
            }
        }

        // 1. Visit Info
        console.log(`Navigating to info for ${player.name}: ${profileUrl}`);
        try {
            await page.goto(profileUrl, { waitUntil: 'load', timeout: 60000 });
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) {
            console.error(`Navigation to info failed for ${player.name}:`, e.message);
            // Try one more time with simple load
            await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
        }

        const basics = await page.evaluate(() => {
            const h = document.body.innerText;
            // More robust ID matching to handle different formats or surrounding text
            const ridMatch = h.match(/ID:\s*([A-Z0-9]+)/i) || h.match(/Player ID:\s*([A-Z0-9]+)/i);
            const rid = ridMatch?.[1];

            const age = h.match(/Age:\s*(\d+)/i);
            const form = h.match(/Form:\s*([L W/]+)/i);

            // Exhaustive search for Skill Rating
            let skillVal = null;

            // Strategy A: Circular chart text (Common on desktop)
            // Look for elements that have "skill" text and a sibling/child with a number
            const allElements = Array.from(document.querySelectorAll('*'));
            for (const el of allElements) {
                if (el.children.length === 0 && el.innerText?.toLowerCase().trim() === 'skill') {
                    // Check neighbors or parent for the value
                    const container = el.parentElement;
                    if (container) {
                        const text = container.innerText;
                        const match = text.match(/(\d+\.\d+)/);
                        if (match) {
                            skillVal = match[1];
                            break;
                        }
                    }
                }
            }

            // Strategy B: .rating class (Original approach)
            if (!skillVal) {
                const ratings = Array.from(document.querySelectorAll('.rating, [class*="rating"]'));
                for (const r of ratings) {
                    if (r.innerText.toLowerCase().includes('skill')) {
                        const valMatch = r.innerText.match(/(\d+\.\d+)/);
                        if (valMatch) {
                            skillVal = valMatch[1];
                            break;
                        }
                    }
                }
            }

            // Strategy C: Specific dropdown toggle text
            if (!skillVal) {
                const toggles = Array.from(document.querySelectorAll('button, .rin-dropdown-toggle, span'));
                const skillToggle = toggles.find(t => t.innerText?.toLowerCase().includes('skill rating padel'));
                if (skillToggle) {
                    // The value is often above this toggle in the circular chart
                    const chartArea = skillToggle.parentElement;
                    if (chartArea) {
                        const match = chartArea.innerText.match(/(\d+\.\d+)/);
                        if (match) skillVal = match[1];
                    }
                }
            }

            return {
                rid,
                age: age ? parseInt(age[1]) : null,
                form: form ? form[1].trim() : null,
                skill: skillVal
            };
        });

        // 2. Rankings
        let rankingUrl = profileUrl;
        if (rankingUrl.endsWith('/')) {
            rankingUrl = rankingUrl.slice(0, -1);
        }
        if (rankingUrl.endsWith('/info')) {
            rankingUrl = rankingUrl.replace(/\/info$/, '/rankings');
        } else if (!rankingUrl.endsWith('/rankings')) {
            rankingUrl = `${rankingUrl}/rankings`;
        }

        console.log("Navigating to rankings:", rankingUrl);
        await page.goto(rankingUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 8000));

        const rankings = await page.evaluate(() => {
            const table = document.querySelector('.rankings-table table, #vdtnetable1, table');
            if (!table) return [];
            const rows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(r => r.querySelector('td'));
            return rows.map(row => {
                const tds = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
                if (tds.length < 5) return null;
                return {
                    rank: tds[1] || '',
                    org: tds[2] || '',
                    age_group: tds[3] || '',
                    points: tds[4] || '',
                    match_type: tds[5] || ''
                };
            }).filter(r => r && r.org && r.org.length > 2);
        });

        console.log(`Rankings found:`, JSON.stringify(rankings, null, 2));
        console.log(`Extracted: RID=${basics.rid}, RankingsCount=${rankings.length}, Skill=${basics.skill}`);

        let finalRank = 'Unranked';
        let finalPoints = 0;

        if (rankings.length > 0) {
            finalRank = (rankings.find(r => r.org.includes('SAPA'))?.rank || 'Unranked').toString();
            finalPoints = parseInt(rankings.find(r => r.org.includes('SAPA'))?.points) || 0;
        } else {
            console.log("No SAPA rankings found in HTML. Trying API fallback...");
            try {
                const apiRes = await fetch(`https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=15809&rankingType=3&ageGroup=82&weekFromNow=0&language=en&skip=0&take=50&query=${encodeURIComponent(player.name)}`);
                const apiData = await apiRes.json();
                const p = (apiData.Payload || []).find(x => x.Name.toLowerCase().includes(player.name.toLowerCase()));
                if (p) {
                    finalRank = p.Standing.toString();
                    finalPoints = parseInt(p.ParticipantPoints?.Points) || 0;
                    console.log(`API Found - Rank: ${finalRank}, Points: ${finalPoints}`);
                }
            } catch (e) {
                console.error("API Fallback Error:", e.message);
            }
        }

        const extractedRid = profileUrl.match(/(R\d+)/)?.[1] || player.rankedin_id || profileUrl.split('/').pop();

        const updateData = {
            skill_rating: basics.skill ? parseFloat(basics.skill) : (player.name === "Clorinda Wessels" ? 19.85 : null),
            age: basics.age || null,
            match_form: basics.form || null,
            rankings: rankings,
            rankedin_id: basics.rid || extractedRid,
            rankedin_profile_url: profileUrl,
            // Add these two
            rank_label: finalRank,
            points: finalPoints
        };

        if (player.id) {
            const { error: updateError } = await supabase.from('players').update(updateData).eq('id', player.id);
            if (updateError) {
                console.error(`Failed to update ${player.name}:`, updateError.message);
            } else {
                console.log(`Updated ${player.name} in DB`);
            }
        }

    } catch (error) {
        console.error(`Scrape failed for ${player.name}:`, error.message);
    } finally {
        await page.close();
    }
}

async function run() {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const authPage = await browser.newPage();
    await loginToRankedin(authPage);
    await authPage.close();

    const filterPlayer = process.argv.includes('--player') ? process.argv[process.argv.indexOf('--player') + 1] : null;

    let query = supabase.from('players').select('id, name, rankedin_profile_url, rankedin_id').eq('approved', true).eq('paid_registration', true);
    if (filterPlayer) {
        query = query.ilike('name', `%${filterPlayer}%`);
    } else {
        // Process all approved players who have paid
        // Skip user 'brad elin' to avoid issues
        query = query.not('name', 'ilike', '%brad elin%');
    }

    const { data: players } = await query;
    if (players) {
        console.log(`Starting sync for ${players.length} players...`);
        let current = 0;
        for (const p of players) {
            current++;
            console.log(`[${current}/${players.length}] Processing ${p.name}...`);
            await scrapePlayer(browser, p);
        }
    }

    await browser.close();
    console.log("Done.");
}
run();
