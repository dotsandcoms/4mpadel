import puppeteer from 'puppeteer';

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    const url = 'https://www.rankedin.com/en/player/R000335461/clorinda-wessels/rankings';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    console.log("Waiting for page load...");
    await new Promise(r => setTimeout(r, 6000));

    console.log("Dumping table HTML before click...");
    const tableBefore = await page.evaluate(() => {
        const t = document.querySelector('table');
        return t ? t.outerHTML : "Table not found";
    });

    console.log("Clicking 'show details'...");
    await page.evaluate(() => {
        const span = document.querySelector('span[data-action-click="show-ranking-details"]');
        if (span) {
            span.click();
            console.log("Clicked!");
        } else {
            console.log("Span not found!");
        }
    });

    console.log("Waiting after click...");
    await new Promise(r => setTimeout(r, 5000));

    console.log("Dumping table and modal HTML after click...");
    const result = await page.evaluate(() => {
        const t = document.querySelector('table');
        const modal = document.querySelector('.modal, .dialog, [class*="modal"], [class*="popup"]');
        return {
            tableHTML: t ? t.outerHTML : "Table not found",
            modalHTML: modal ? modal.outerHTML : "Modal not found",
            bodyHTMLSnippet: document.body.innerHTML.substring(document.body.innerHTML.indexOf('vdtnetable1') - 500, document.body.innerHTML.indexOf('vdtnetable1') + 2000)
        };
    });

    console.log("Modal found:", result.modalHTML !== "Modal not found");
    if (result.modalHTML !== "Modal not found") {
        console.log("Modal HTML snippet:", result.modalHTML.substring(0, 1500));
    }
    console.log("Table HTML changed:", tableBefore !== result.tableHTML);
    console.log("Body snippet:", result.bodyHTMLSnippet);

    await browser.close();
})();
