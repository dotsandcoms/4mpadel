import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('response', async request => {
        const url = request.url();
        if (request.request().resourceType() === 'fetch' || request.request().resourceType() === 'xhr') {
            try {
                const body = await request.json();
                console.log('API RESP API:', url);
                console.log('KEYS:', Object.keys(body).join(', '));
            } catch (e) { }
        }
    });

    console.log('Navigating to draws page...');
    await page.goto('https://www.rankedin.com/en/tournament/63194/padel-odyssey-summer-finals/draws/148221', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 5000));

    await browser.close();
})();
