import puppeteer from 'puppeteer';

(async () => {
    let browser;
    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        const url = 'https://www.rankedin.com/en/tournament/65139/fnl-men-s-intermediate-clash';
        console.log(`Navigating to ${url}...`);

        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

        // Wait an extra 2 seconds for any client side rendering to finish
        await new Promise(r => setTimeout(r, 2000));

        console.log('Page loaded. Extracting content...');
        const text = await page.evaluate(() => document.body.innerText);
        console.log('--- Page Text ---');
        console.log(text.substring(0, 2000));
        console.log('-----------------');

    } catch (error) {
        console.error('Puppeteer error:', error);
    } finally {
        if (browser) await browser.close();
    }
})();
