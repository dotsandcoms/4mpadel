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
            console.log('API Request:', url, request.method());
        }
        request.continue();
    });

    const url = 'https://www.rankedin.com/en/player/R000335461/clorinda-wessels/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for page load...");
    await new Promise(r => setTimeout(r, 6000));

    // Try to find the rankings or "show details" elements and click them!
    console.log("Attempting to find elements to click...");
    const clicked = await page.evaluate(async () => {
        // Find elements with text "Show details" or "SAPA" or similar clickables
        const buttons = Array.from(document.querySelectorAll('button, a, div, span, tr, td'));
        const showDetails = buttons.find(el => el.innerText && el.innerText.toLowerCase().includes('show details'));
        if (showDetails) {
            console.log("Found show details element, clicking it...");
            showDetails.click();
            return "Clicked 'Show details'";
        }
        
        // Let's try clicking on any element that looks like a ranking row
        const rankingRow = document.querySelector('.rankings-table tbody tr, table tbody tr, [class*="ranking"]');
        if (rankingRow) {
            rankingRow.click();
            return "Clicked ranking row";
        }
        
        return "No elements clicked";
    });
    console.log("Action result:", clicked);

    // Wait after click to see new requests
    await new Promise(r => setTimeout(r, 6000));

    await browser.close();
    console.log("Done!");
})();
