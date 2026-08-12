const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const apis = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('api.rankedin.com')) {
      apis.push(url);
    }
  });

  await page.goto('https://www.rankedin.com/en/teamleague/940/kit-kat-elite-padel-league/standings?pool=12616', { waitUntil: 'networkidle2' });
  
  console.log('Rankedin APIs hit:', apis.filter(a => !a.includes('healthchecks') && !a.includes('signalr')));
  
  await browser.close();
})();
