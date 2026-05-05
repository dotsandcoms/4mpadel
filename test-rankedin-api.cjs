const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api.rankedin.com')) {
            console.log('API Call:', url);
        }
    });
    await page.goto('https://www.rankedin.com/en/teamleague/940/kit-kat-elite-padel-league/standings?pool=12616', { waitUntil: 'networkidle2' });
    await browser.close();
})();
