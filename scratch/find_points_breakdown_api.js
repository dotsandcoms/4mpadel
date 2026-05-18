import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import path from 'path';
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

    // Intercept and search response bodies
    page.on('response', async response => {
        const url = response.url();
        if (url.includes('api.rankedin.com')) {
            try {
                const text = await response.text();
                if (text.includes('SA Grand Legends') || text.includes('936') || text.includes('Cape Town Major')) {
                    console.log(`\n==========================================`);
                    console.log(`FOUND TARGET DATA IN RESPONSE!`);
                    console.log(`URL: ${url}`);
                    console.log(`Method: ${response.request().method()}`);
                    console.log(`Status: ${response.status()}`);
                    console.log(`Body Length: ${text.length}`);
                    console.log(`Body Snippet: ${text.substring(0, 1500)}`);
                    console.log(`==========================================\n`);
                }
            } catch (e) {
                // Ignore parsing errors for empty/binary responses
            }
        }
    });

    const url = 'https://www.rankedin.com/en/player/R000328907/luan-krige/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for page load and table load...");
    await new Promise(r => setTimeout(r, 6000));

    console.log("Clicking 'show details' to see if a late request is triggered...");
    await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span'));
        const showDetailsSpan = spans.find(s => s.innerText && s.innerText.toLowerCase().includes('show details'));
        if (showDetailsSpan) showDetailsSpan.click();
    });

    console.log("Waiting after click...");
    await new Promise(r => setTimeout(r, 6000));

    await browser.close();
    console.log("Done!");
})();
