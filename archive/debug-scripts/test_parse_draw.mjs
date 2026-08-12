import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('response', async request => {
    const url = request.url();
    if (url.includes('GetDrawsForStageAndStrengthAsync')) {
      try {
        const body = await request.json();
        const elimination = body[0]?.Elimination;
        if (elimination) {
           console.log("ROUND 1, CELL 0:", JSON.stringify(elimination[0][0], null, 2));
           console.log("ROUND 1, CELL 1:", JSON.stringify(elimination[0][1], null, 2));
           console.log("ROUND 1, CELL 2:", JSON.stringify(elimination[0][2], null, 2));
        }
      } catch (e) {}
    }
  });

  await page.goto('https://www.rankedin.com/en/tournament/63194/padel-odyssey-summer-finals/draws/148221', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 4000));
  await browser.close();
})();
