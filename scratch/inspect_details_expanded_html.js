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

    // Monitor all page requests
    page.on('request', request => {
        const url = request.url();
        console.log('-> Page Request:', url, request.method());
    });

    const url = 'https://www.rankedin.com/en/player/R000328907/luan-krige/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for table to load...");
    await new Promise(r => setTimeout(r, 6000));

    console.log("Clicking 'show details' on row...");
    const clicked = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span'));
        const showDetailsSpan = spans.find(s => s.innerText && s.innerText.toLowerCase().includes('show details'));
        if (showDetailsSpan) {
            showDetailsSpan.click();
            return true;
        }
        return false;
    });
    console.log("Clicked:", clicked);

    // Watch DOM changes every 1s
    for (let i = 1; i <= 8; i++) {
        await new Promise(r => setTimeout(r, 1000));
        console.log(`\n--- Inspecting DOM after ${i}s ---`);
        
        const info = await page.evaluate(() => {
            const trs = Array.from(document.querySelectorAll('tr'));
            const textContent = document.body.innerText;
            const openModals = Array.from(document.querySelectorAll('.modal, .dialog, [class*="modal"], [class*="popup"], [class*="dialog"]')).map(el => el.innerText);
            
            // Check for new tables or new child rows
            const tableRowsInfo = trs.map(tr => ({
                className: tr.className,
                text: tr.innerText.replace(/\s+/g, ' ').trim()
            }));

            return {
                rowsCount: trs.length,
                tableRowsInfo,
                openModals,
                hasCastle: textContent.toLowerCase().includes('castle') || textContent.toLowerCase().includes('padel 365') || textContent.toLowerCase().includes('points') || textContent.toLowerCase().includes('breakdown'),
                bodySnippet: textContent.substring(0, 1000)
            };
        });

        console.log(`Rows count: ${info.rowsCount}`);
        console.log(`Has points/tournament text: ${info.hasCastle}`);
        if (info.openModals.length > 0) {
            console.log("Open Modals:", info.openModals);
        }
        // Print rows that have classes indicating detail/child/expanded
        const detailRows = info.tableRowsInfo.filter(r => r.className.includes('child') || r.className.includes('detail') || r.className.includes('expanded') || r.text.includes('Points') || r.text.includes('Tournament'));
        if (detailRows.length > 0) {
            console.log("Details/Expanded rows found:", detailRows);
        } else {
            // Let's print all rows to see what is there
            console.log("All rows:", info.tableRowsInfo);
        }
    }

    await browser.close();
    console.log("Done!");
})();
