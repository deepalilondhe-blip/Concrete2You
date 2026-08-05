const { chromium } = require('@playwright/test');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  console.log('Navigating...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded' });
  console.log('Navigated. Waiting for 5 seconds for page load...');
  await page.waitForTimeout(5000);
  
  const content = await page.content();
  fs.writeFileSync('scratch/page_source.html', content);
  console.log('Page source saved to scratch/page_source.html');
  await browser.close();
})();
