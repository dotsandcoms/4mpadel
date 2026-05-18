import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const rankedinEmail = process.env.RANKEDIN_EMAIL;
const rankedinPassword = process.env.RANKEDIN_PASSWORD;

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

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    const loggedIn = await loginToRankedin(page);
    if (!loggedIn) {
        console.log("Failed to log in.");
        await browser.close();
        return;
    }

    // Capture the API response when we navigate to Luan Krige's page
    let targetResponse = null;
    page.on('response', async response => {
        const url = response.url();
        if (url.includes('PlayerRankingsAsync')) {
            console.log("Intercepted PlayerRankingsAsync response!");
            try {
                targetResponse = await response.json();
            } catch (e) {
                console.error("Failed to parse response JSON:", e.message);
            }
        }
    });

    const url = 'https://www.rankedin.com/en/player/R000328907/luan-krige/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for network idle...");
    await new Promise(r => setTimeout(r, 8000));

    if (targetResponse) {
        const filePath = path.resolve(__dirname, 'player_rankings_response.json');
        fs.writeFileSync(filePath, JSON.stringify(targetResponse, null, 2));
        console.log(`Saved PlayerRankingsAsync response to ${filePath}`);
    } else {
        console.log("PlayerRankingsAsync response was not intercepted.");
    }

    await browser.close();
    console.log("Done!");
})();
