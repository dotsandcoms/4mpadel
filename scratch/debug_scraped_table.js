import puppeteer from 'puppeteer';

async function run() {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });

    const url = "https://www.rankedin.com/en/player/R000328907/mark-stillerman/rankings";
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 7000));

    const rowsData = await page.evaluate(() => {
        const table = document.querySelector('.rankings-table table, #vdtnetable1, table');
        if (!table) return "Table not found";
        
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
        const rows = Array.from(table.querySelectorAll('tbody tr')).filter(r => r.querySelector('td'));
        
        return {
            headers,
            rows: rows.map(row => {
                const cells = Array.from(row.querySelectorAll('td')).map((td, idx) => {
                    let info = {
                        html: td.innerHTML,
                        text: td.innerText.trim()
                    };
                    if (idx === 2) {
                        const a = td.querySelector('a');
                        if (a) {
                            info.anchor = {
                                html: a.outerHTML,
                                className: a.className,
                                style: a.getAttribute('style'),
                                computedBgImage: window.getComputedStyle(a).backgroundImage,
                                computedBg: window.getComputedStyle(a).background
                            };
                        }
                    }
                    return info;
                });
                return cells;
            })
        };
    });

    console.log("Scraped Rows Data:");
    console.log(JSON.stringify(rowsData, null, 2));

    await browser.close();
}
run();
