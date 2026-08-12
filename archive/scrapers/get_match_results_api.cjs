const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'];
    if (url.includes('api.rankedin.com') && contentType && contentType.includes('application/json')) {
      console.log('Found API URL:', url);
    }
  });

  await page.goto('https://www.rankedin.com/en/team/matchresults/143237', { waitUntil: 'networkidle0' });
  
  await browser.close();
})();
