const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.goto('https://www.rankedin.com/en/teamleague/940/kit-kat-elite-padel-league/standings?pool=12616', { waitUntil: 'networkidle2' });
  
  const initialState = await page.evaluate(() => window.__INITIAL_STATE__);
  if (initialState) {
    console.log(Object.keys(initialState));
    if (initialState.teamLeague) {
       console.log('teamLeague keys:', Object.keys(initialState.teamLeague));
       if (initialState.teamLeague.standings) {
         console.log('standings count:', initialState.teamLeague.standings.length);
       }
    }
  } else {
    console.log('__INITIAL_STATE__ not found. Other window keys:');
    const keys = await page.evaluate(() => Object.keys(window).filter(k => k.includes('state') || k.includes('STATE')));
    console.log(keys);
  }
  
  await browser.close();
})();
