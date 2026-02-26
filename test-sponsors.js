const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://www.rankedin.com/en/tournament/63194/padel-odyssey-summer-finals/info', { waitUntil: 'networkidle0' });
  
  const sponsors = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.map(img => img.src).filter(src => src.includes('sponsor'));
  });

  console.log(JSON.stringify(sponsors, null, 2));
  await browser.close();
})();
