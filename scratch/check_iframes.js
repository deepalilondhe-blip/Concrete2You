const { chromium, devices } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  console.log('Navigating directly to login page...');
  await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  console.log(`Page URL: ${page.url()}`);
  console.log(`Page Title: "${await page.title()}"`);
  
  const iframeDetails = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe'))
      .map((f, index) => ({
        index,
        src: f.getAttribute('src') || '',
        title: f.getAttribute('title') || '',
        id: f.id,
        className: f.className,
        width: f.offsetWidth,
        height: f.offsetHeight,
        outerHTML: f.outerHTML.substring(0, 300)
      }));
  });
  
  console.log('--- ALL IFRAMES ---');
  console.log(JSON.stringify(iframeDetails, null, 2));
  
  await browser.close();
})();
