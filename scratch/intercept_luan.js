import puppeteer from 'puppeteer';

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    // Intercept network requests
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        if (url.includes('api.rankedin.com')) {
            console.log('Rankedin API Request:', url, request.method());
        }
        request.continue();
    });

    const url = 'https://www.rankedin.com/en/player/R000328907/luan-krige/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for page load...");
    await new Promise(r => setTimeout(r, 6000));

    console.log("Dumping table body text...");
    const textBefore = await page.evaluate(() => {
        const tbody = document.querySelector('tbody');
        return tbody ? tbody.innerText : "No tbody found";
    });
    console.log("Before click table text:", textBefore);

    console.log("Clicking 'show details'...");
    const clickResult = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('span, button, a, td'));
        const span = els.find(el => el.innerText && el.innerText.toLowerCase().includes('show details'));
        if (span) {
            span.click();
            return "Clicked successfully!";
        }
        return "Show details element not found";
    });
    console.log("Click result:", clickResult);

    console.log("Waiting after click...");
    await new Promise(r => setTimeout(r, 6000));

    console.log("Dumping body text/HTML changes...");
    const afterInfo = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table')).map(t => t.innerText);
        const detailsContainer = document.querySelector('[class*="details"], [class*="expanded"], [class*="child"]');
        return {
            tables,
            detailsHTML: detailsContainer ? detailsContainer.outerHTML : "Details container not found",
            bodyText: document.body.innerText.substring(0, 2000)
        };
    });

    console.log("Tables after click:", afterInfo.tables);
    console.log("Details container HTML:", afterInfo.detailsHTML);

    await browser.close();
    console.log("Done!");
})();
