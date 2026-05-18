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
    await page.setViewport({ width: 1440, height: 1600 });

    const loggedIn = await loginToRankedin(page);
    if (!loggedIn) {
        console.log("Failed to log in.");
        await browser.close();
        return;
    }

    const url = 'https://www.rankedin.com/en/player/R000328907/luan-krige/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for page load...");
    await new Promise(r => setTimeout(r, 6000));

    console.log("Clicking 'show details' on the SAPA Men-Main row...");
    const clickResult = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const menMainRow = rows.find(r => r.innerText.includes('Men-Main') && r.innerText.includes('SAPA ranking'));
        if (menMainRow) {
            const span = menMainRow.querySelector('span[data-action-click="show-ranking-details"]');
            if (span) {
                span.click();
                return "Clicked Men-Main show details!";
            }
            return "Span not found in Men-Main row";
        }
        return "SAPA Men-Main row not found";
    });
    console.log("Click result:", clickResult);

    console.log("Waiting after click...");
    await new Promise(r => setTimeout(r, 6000));

    const screenshotPath = path.resolve(__dirname, 'screenshot.png');
    console.log(`Saving screenshot to ${screenshotPath}...`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await browser.close();
    console.log("Done!");
})();
