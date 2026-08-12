import puppeteer from 'puppeteer';
import fs from 'fs';

async function run() {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1800 });

    const url = "https://www.rankedin.com/en/player/R000335461/clorinda-wessels/skill";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 6000));

    const content = await page.content();
    fs.writeFileSync('skill_diagnostic.html', content);

    const exists = content.includes('19.85');
    console.log(`Does '19.85' exist in full source? ${exists}`);

    const numbers = await page.evaluate(() => {
        const bTags = Array.from(document.querySelectorAll('b')).map(b => b.innerText.trim());
        return bTags.filter(t => /\d+\.\d+/.test(t));
    });
    console.log("Numeric b tags found:", numbers);

    await browser.close();
}
run();
