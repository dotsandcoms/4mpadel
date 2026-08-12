import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('response', async request => {
        const url = request.url();
        // Only care about JSON API responses
        if (request.request().resourceType() === 'fetch' || request.request().resourceType() === 'xhr') {
            try {
                const body = await request.json();
                console.log('API RESP API:', url);
                console.log('KEYS:', Object.keys(body).join(', '));
            } catch (e) { }
        }
    });

    console.log('Navigating to Rankedin...');
    await page.goto('https://www.rankedin.com/en/organisation/calendar/11331/sapa', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 10000));

    await browser.close();
})();
