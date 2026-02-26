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
    await page.goto("https://www.rankedin.com/en", { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));

    await page.screenshot({ path: path.join(artifactDir, 'hp_debug.png') });

    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href }));
    });

    console.log("Found links:", links.filter(l => l.text.toLowerCase().includes('ranking')));
    await browser.close();
}
run();
