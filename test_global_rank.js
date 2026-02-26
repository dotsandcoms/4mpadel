import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();
const artifactDir = '/Users/bradein/.gemini/antigravity/brain/ea660605-3d9d-41ec-922b-e2b6d1a0c0cc';

async function run() {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1800 });

    const url = "https://www.rankedin.com/en/rankings?search=Clorinda+Wessels&country=ZA";
    console.log(`Searching global rankings: ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 10000));

    await page.screenshot({ path: path.join(artifactDir, 'global_rank_search_v2.png') });
    console.log("Screenshot saved.");

    const rows = await page.evaluate(() => {
        const trs = Array.from(document.querySelectorAll('tr'));
        return trs.filter(r => r.innerText.toLowerCase().includes('clorinda')).map(r => r.innerText.trim());
    });

    console.log("Rows found:", rows);
    await browser.close();
}
run();
