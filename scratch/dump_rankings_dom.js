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

    console.log("Extracting DOM text and structure...");
    const data = await page.evaluate(() => {
        // Find table or container
        const tables = Array.from(document.querySelectorAll('table'));
        const tableData = tables.map((t, i) => {
            return {
                index: i,
                className: t.className,
                html: t.outerHTML.substring(0, 1000),
                innerText: t.innerText
            };
        });

        const buttons = Array.from(document.querySelectorAll('button, a')).map(b => ({
            text: b.innerText,
            className: b.className,
            tagName: b.tagName
        }));

        return {
            title: document.title,
            tableData,
            buttons: buttons.filter(b => b.text && b.text.trim().length > 0)
        };
    });

    console.log("Page Title:", data.title);
    console.log("Tables found:", data.tableData.length);
    data.tableData.forEach((t, i) => {
        console.log(`--- Table ${i} (Class: ${t.className}) ---`);
        console.log("Snippet:", t.html);
        console.log("Text:", t.innerText);
    });

    console.log("Interactive elements:");
    console.log(data.buttons);

    // Let's click "Show details" if found and dump DOM again!
    const clicked = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('span, button, a, div'));
        const btn = els.find(el => el.innerText && el.innerText.toLowerCase().includes('show details'));
        if (btn) {
            btn.click();
            return "Clicked 'Show details'";
        }
        return "Not found";
    });
    console.log("Click result:", clicked);

    if (clicked !== "Not found") {
        await new Promise(r => setTimeout(r, 3000));
        const tablesAfter = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('table')).map(t => t.innerText);
        });
        console.log("Tables after clicking:", tablesAfter);
    }

    await browser.close();
})();
