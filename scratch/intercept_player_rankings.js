import puppeteer from 'puppeteer';

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    // Intercept network requests
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        if (url.includes('api.rankedin.com')) {
            console.log('Rankedin API Request:', url);
        }
        request.continue();
    });

    const url = 'https://www.rankedin.com/en/player/R000335461/clorinda-wessels/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait a bit for all requests to finish
    await new Promise(r => setTimeout(r, 7000));

    await browser.close();
    console.log("Done!");
})();
