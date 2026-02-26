import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();
const artifactDir = '/Users/bradein/.gemini/antigravity/brain/ea660605-3d9d-41ec-922b-e2b6d1a0c0cc';

async function run() {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    console.log("Navigating to homepage...");
    await page.goto("https://www.rankedin.com/en", { waitUntil: 'load' });

    const searchInputSelector = 'input[placeholder="Search Players, Events, Clubs"]';
    console.log("Waiting for search input...");
    await page.waitForSelector(searchInputSelector);

    const name = "Paul Anderson";
    console.log(`Searching for ${name}...`);
    await page.type(searchInputSelector, name);

    // Wait for the dropdown or some results to appear
    await new Promise(r => setTimeout(r, 8000));
    await page.screenshot({ path: path.join(artifactDir, 'search_dropdown_debug.png') });

    const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/player/"]'));
        return anchors.map(a => ({ text: a.innerText.trim(), href: a.href }));
    });

    console.log("Found player links in dropdown:", links);
    await browser.close();
}
run();
