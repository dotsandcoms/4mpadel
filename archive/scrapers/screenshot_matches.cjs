const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1000 });
    await page.goto('https://www.rankedin.com/en/player/R000328907/mark-stillerman/matches', { waitUntil: 'networkidle0' });
    
    // Also click the History tab if there is one
    try {
        await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('a'));
            const historyTab = tabs.find(t => t.innerText && t.innerText.toLowerCase().includes('history'));
            if (historyTab) historyTab.click();
        });
        await page.waitForTimeout(2000);
    } catch(e) {}

    await page.screenshot({ path: '/tmp/rankedin_matches.png', fullPage: true });
    await browser.close();
})();
