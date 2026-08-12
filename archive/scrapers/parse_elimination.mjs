import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('response', async request => {
    const url = request.url();
    if (url.includes('GetOrganisationEventsAsync')) {
      const body = await request.json();
      console.log("Recent Tournament ID:", body.payload[0].eventId);
    }
  });

  await page.goto('https://www.rankedin.com/en/organisation/calendar/11331/sapa', { waitUntil: 'networkidle0' });
  await browser.close();
})();
