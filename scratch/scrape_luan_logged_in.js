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

    const url = 'https://www.rankedin.com/en/player/R000328907/luan-krige/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for page load...");
    await new Promise(r => setTimeout(r, 6000));

    console.log("Dumping table rows BEFORE click...");
    const rowsBefore = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows.map(r => r.innerText.trim());
    });
    console.log("Rows count:", rowsBefore.length);
    console.log("Rows text:", rowsBefore);

    console.log("Clicking 'show details'...");
    const clickResult = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('span, button, a, td'));
        const span = els.find(el => el.innerText && el.innerText.toLowerCase().includes('show details'));
        if (span) {
            span.click();
            return "Clicked successfully!";
        }
        return "Show details element not found";
    });
    console.log("Click result:", clickResult);

    console.log("Waiting after click for details to expand...");
    await new Promise(r => setTimeout(r, 6000));

    console.log("Dumping table HTML after click...");
    const data = await page.evaluate(() => {
        const table = document.querySelector('table');
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const detailRows = rows.filter(r => r.innerText.toLowerCase().includes('castle') || r.innerText.toLowerCase().includes('padel 365') || r.className.includes('details') || r.className.includes('child'));
        
        return {
            tableHTML: table ? table.outerHTML.substring(0, 3000) : "No table",
            rowsText: rows.map(r => ({ className: r.className, text: r.innerText.trim() })),
            detailRowsHTML: detailRows.map(r => ({ className: r.className, html: r.outerHTML }))
        };
    });

    console.log("All rows after click:", data.rowsText);
    console.log("Detail rows html found:", data.detailRowsHTML.length);
    data.detailRowsHTML.forEach((r, idx) => {
        console.log(`--- Detail Row ${idx} (Class: ${r.className}) ---`);
        console.log(r.html);
    });

    await browser.close();
    console.log("Done!");
})();
