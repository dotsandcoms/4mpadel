import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();
const artifactDir = '/Users/bradein/.gemini/antigravity/brain/ea660605-3d9d-41ec-922b-e2b6d1a0c0cc';

async function run() {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    // Login first to see if it makes a difference
    const rankedinEmail = process.env.RANKEDIN_EMAIL;
    const rankedinPassword = process.env.RANKEDIN_PASSWORD;

    if (rankedinEmail && rankedinPassword) {
        await page.goto("https://www.rankedin.com/en/account/login", { waitUntil: 'networkidle2' });
        const fieldSelector = 'input[type="email"], input[name="Email"], #Email, input[name="Username"]';
        await page.waitForSelector(fieldSelector);
        await page.type(fieldSelector, rankedinEmail);
        await page.type('input[type="password"]', rankedinPassword);
        await Promise.all([
            page.click('button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
        console.log("Logged in.");
    }

    const name = "Paul Anderson";
    const searchUrl = `https://www.rankedin.com/en/rankings?search=${encodeURIComponent(name)}&country=ZA`;
    console.log(`Searching for ${name}: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 8000));

    await page.screenshot({ path: path.join(artifactDir, 'search_results_debug.png') });

    const data = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText, href: a.href }));
        const tables = Array.from(document.querySelectorAll('table')).map(t => t.innerText);
        return { links: links.filter(l => l.href.includes('/player/')), tables };
    });

    console.log("Found player links:", data.links);
    await browser.close();
}
run();
