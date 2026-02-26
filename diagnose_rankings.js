import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) { process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    const url = "https://www.rankedin.com/en/player/R000335461/clorinda-wessels/rankings";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 7000));

    const structure = await page.evaluate(() => {
        // Find the container for rankings
        const main = document.querySelector('main, #app, .content');
        if (!main) return "Main not found";

        // Find any table or row-like structures
        const table = document.querySelector('.rankings-table table, table');
        if (table) {
            return { type: 'table', html: table.outerHTML.substring(0, 1000) };
        }

        return { type: 'unknown', html: document.body.innerHTML.substring(0, 500) };
    });

    fs.writeFileSync('rankings_structure.json', JSON.stringify(structure, null, 2));
    console.log("Structure info saved to rankings_structure.json");

    await browser.close();
}
run();
