/**
 * Discover RankedIn organiser write APIs by logging in and capturing
 * network requests while you edit a blank tournament (classes, save, etc.).
 *
 * Usage:
 *   RANKEDIN_EMAIL=... RANKEDIN_PASSWORD=... \
 *   RANKEDIN_TOURNAMENT_ID=12345 \
 *   node scripts/discover-rankedin-write-apis.mjs
 *
 * Leave the browser open, edit the tournament in RankedIn admin UI, then
 * press Ctrl+C. Captured POST/PUT requests are written to
 * scratch/rankedin-write-api-capture.json
 */
import puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const email = process.env.RANKEDIN_EMAIL;
const password = process.env.RANKEDIN_PASSWORD;
const tournamentId = process.env.RANKEDIN_TOURNAMENT_ID || '';

const OUT_DIR = path.resolve(__dirname, '../scratch');
const OUT_FILE = path.join(OUT_DIR, 'rankedin-write-api-capture.json');

const interesting = (url, method) => {
    if (!/rankedin\.com/i.test(url)) return false;
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return false;
    return /api\.rankedin\.com|\/en\/api\//i.test(url);
};

async function login(page) {
    console.log('Logging into RankedIn…');
    await page.goto('https://www.rankedin.com/en/account/login', { waitUntil: 'networkidle2', timeout: 90000 });
    const fieldSelector = 'input[type="email"], input[name="Email"], #Email, input[name="Username"]';
    await page.waitForSelector(fieldSelector, { timeout: 30000 });
    await page.type(fieldSelector, email, { delay: 20 });
    await page.type('input[type="password"]', password, { delay: 20 });
    await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 90000 }).catch(() => null),
    ]);
    console.log('Login complete. Current URL:', page.url());
}

(async () => {
    if (!email || !password) {
        console.error('Set RANKEDIN_EMAIL and RANKEDIN_PASSWORD in .env');
        process.exit(1);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const captured = [];

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1440, height: 900 },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    page.on('request', (req) => {
        const method = req.method();
        const url = req.url();
        if (!interesting(url, method)) return;
        let postData = null;
        try {
            postData = req.postData() || null;
        } catch {
            postData = null;
        }
        const entry = {
            at: new Date().toISOString(),
            method,
            url,
            resourceType: req.resourceType(),
            headers: req.headers(),
            postData,
        };
        captured.push(entry);
        console.log(`→ ${method} ${url}`);
        if (postData && postData.length < 4000) {
            console.log('  body:', postData.slice(0, 500));
        }
    });

    page.on('response', async (res) => {
        const req = res.request();
        const method = req.method();
        const url = res.url();
        if (!interesting(url, method)) return;
        let bodyPreview = null;
        try {
            const text = await res.text();
            bodyPreview = text.slice(0, 1500);
        } catch {
            bodyPreview = null;
        }
        const match = [...captured].reverse().find((c) => c.url === url && c.method === method && !c.responseStatus);
        if (match) {
            match.responseStatus = res.status();
            match.responsePreview = bodyPreview;
        }
        console.log(`← ${res.status()} ${url}`);
    });

    await login(page);

    const startUrl = tournamentId
        ? `https://www.rankedin.com/en/tournament/${tournamentId}`
        : 'https://www.rankedin.com/en/';
    console.log(`\nOpening ${startUrl}`);
    console.log('Now in the RankedIn UI:');
    console.log('  1. Open your blank tournament admin / edit page');
    console.log('  2. Create or rename a class/division');
    console.log('  3. Save tournament info (name, dates, venue)');
    console.log('  4. Optionally add a test player to a class');
    console.log('Press Ctrl+C when done — captures will be saved.\n');

    await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => null);

    const save = () => {
        fs.writeFileSync(OUT_FILE, JSON.stringify(captured, null, 2));
        console.log(`\nSaved ${captured.length} write-ish requests → ${OUT_FILE}`);
    };

    process.on('SIGINT', async () => {
        save();
        await browser.close().catch(() => null);
        process.exit(0);
    });

    // Keep process alive
    setInterval(() => {
        fs.writeFileSync(OUT_FILE, JSON.stringify(captured, null, 2));
    }, 5000);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
