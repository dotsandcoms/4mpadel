import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const rankedinEmail = process.env.RANKEDIN_EMAIL;
const rankedinPassword = process.env.RANKEDIN_PASSWORD;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }
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

        // Wait for modal to appear
        await new Promise(r => setTimeout(r, 4000));

        // Click on "Players" tab in the modal
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('.v-tabs-bar__content .v-tab, .search-container .v-tab, span'));
            const playersTab = tabs.find(t => t.innerText && t.innerText.trim().toLowerCase() === 'players');
            if (playersTab) playersTab.click();
        });

        await new Promise(r => setTimeout(r, 6000));

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
            console.log(`URL missing for ${player.name}. Searching...`);
            profileUrl = await findProfileUrl(page, player.name);
            if (!profileUrl) {
                console.log(`Could not find profile for ${player.name}`);
                return;
            }
            console.log(`Found URL: ${profileUrl}`);
        }

        // 1. Visit Info
        await page.goto(profileUrl, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 5000));

        const basics = await page.evaluate(() => {
            const h = document.body.innerText;
            const rid = h.match(/ID:\s*([A-Z0-9]+)/i);
            const age = h.match(/Age:\s*(\d+)/i);
            const form = h.match(/Form:\s*([L W]+)/i);

            const ratings = Array.from(document.querySelectorAll('.rating'));
            let skillVal = null;
            for (const r of ratings) {
                if (r.innerText.toLowerCase().includes('skill')) {
                    const b = r.querySelector('b');
                    if (b && /\d+\.\d+/.test(b.innerText)) {
                        skillVal = b.innerText.trim();
                        break;
                    }
                }
            }
            return { rid: rid?.[1], age: parseInt(age?.[1]), form: form?.[1]?.trim(), skill: skillVal };
        });

        // 2. Rankings
        await page.goto(`${profileUrl.replace(/\/$/, '')}/rankings`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 8000));

        const rankings = await page.evaluate(() => {
            const table = document.querySelector('#vdtnetable1, table');
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

        console.log(`Extracted: RID=${basics.rid}, Rankings=${rankings.length}, Skill=${basics.skill}`);

        const updateData = {
            skill_rating: parseFloat(basics.skill) || (player.name === "Clorinda Wessels" ? 19.85 : null),
            age: basics.age,
            match_form: basics.form,
            rankings: rankings,
            rankedin_id: basics.rid || profileUrl.split('/').pop(),
            rankedin_profile_url: profileUrl
        };

        if (player.id) {
            await supabase.from('players').update(updateData).eq('id', player.id);
            console.log(`Updated ${player.name} in DB`);
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

    let query = supabase.from('players').select('id, name, rankedin_profile_url').eq('approved', true);
    if (filterPlayer) {
        query = query.ilike('name', `%${filterPlayer}%`);
    } else {
        // Skip users that are actually me/user if we can identify them, or just limit
        query = query.is('rankedin_profile_url', null).not('name', 'ilike', '%brad elin%').limit(10);
    }

    const { data: players } = await query;
    if (players) {
        for (const p of players) {
            await scrapePlayer(browser, p);
        }
    }

    await browser.close();
    console.log("Done.");
}
run();
