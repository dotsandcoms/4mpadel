const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    const requests = [];

    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api.rankedin.com') && url.includes('Match')) {
            try {
                const json = await response.json();
                requests.push({ url, json });
            } catch (e) {
                // Ignore matching responses that aren't JSON
            }
        }
    });

    await page.goto('https://www.rankedin.com/en/player/R000328907/markstillerman/matches', { waitUntil: 'networkidle0' });
    
    fs.writeFileSync('./rankedin_network.json', JSON.stringify(requests, null, 2));
    await browser.close();
})();
