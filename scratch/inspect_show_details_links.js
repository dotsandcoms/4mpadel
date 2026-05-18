import puppeteer from 'puppeteer';

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    const url = 'https://www.rankedin.com/en/player/R000335461/clorinda-wessels/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for page load...");
    await new Promise(r => setTimeout(r, 6000));

    const links = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, button, span, td, tr'));
        return els
            .filter(el => el.innerText && el.innerText.toLowerCase().includes('show details'))
            .map(el => {
                return {
                    tagName: el.tagName,
                    className: el.className,
                    innerText: el.innerText,
                    outerHTML: el.outerHTML.substring(0, 500)
                };
            });
    });

    console.log("Found show details elements:", links);
    await browser.close();
})();
