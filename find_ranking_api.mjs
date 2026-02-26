import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Intercept network requests
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        if (url.includes('api.rankedin.com') && url.includes('Ranking') || url.includes('rankings')) {
            console.log('API Request:', url);
        }
        request.continue();
    });

    await page.goto('https://www.rankedin.com/en/organisation/ranking/11331/sapa', { waitUntil: 'networkidle0' });

    await browser.close();
})();
