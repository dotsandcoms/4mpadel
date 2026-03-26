const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    const requests = [];

    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('api.rankedin.com')) {
            try {
                const text = await response.text();
                let json = null;
                try {
                    json = JSON.parse(text);
                } catch(e) {}
                requests.push({ url, json: json || text.substring(0, 100) });
            } catch (e) {
                // Ignore responses that can't be read
            }
        }
    });

    await page.goto('https://www.rankedin.com/en/player/R000328907/markstillerman/matches', { waitUntil: 'networkidle0' });
    
    // Explicitly click History tab if available to trigger lazy loads
    try {
        await page.evaluate(() => {
            const historyBtn = Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.toLowerCase().includes('history'));
            if (historyBtn) historyBtn.click();
        });
        await new Promise(r => setTimeout(r, 5000));
    } catch(e) {}

    fs.writeFileSync('./rankedin_full_network.json', JSON.stringify(requests, null, 2));
    await browser.close();
})();
