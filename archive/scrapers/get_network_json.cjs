const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'];
    if (contentType && contentType.includes('application/json')) {
      try {
        const text = await response.text();
        if (text.includes('12616') || text.includes('940') || text.includes('Atholl Aces')) {
           console.log('Found match in URL:', url);
           console.log('Sample data:', text.substring(0, 200));
        }
      } catch (e) {}
    }
  });

  await page.goto('https://www.rankedin.com/en/teamleague/940/kit-kat-elite-padel-league/standings?pool=12616', { waitUntil: 'networkidle0' });
  
  await browser.close();
})();
