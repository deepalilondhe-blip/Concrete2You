const { chromium, devices } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  console.log('Navigating to Cart page first...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // Handle Cookie Popup
  const cookieBtn = page.locator('#onetrust-accept-btn-handler');
  if (await cookieBtn.isVisible()) {
    console.log('Accepting cookies on Cart page...');
    await cookieBtn.click();
    await page.waitForTimeout(2000);
  }
  
  console.log('Clicking Account link to trigger Cloudflare...');
  await page.click('a.my-account-link');
  await page.waitForTimeout(4000);
  
  if (!page.url().includes('/customer/account/login/')) {
    console.log('Navigating to login page...');
    await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
  }
  
  console.log(`Final Page URL: ${page.url()}`);
  console.log(`Final Page Title: "${await page.title()}"`);
  
  // Dump all iframes
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
  
  await page.screenshot({ path: 'scratch/challenge_loaded.png' });
  console.log('Saved screenshot to scratch/challenge_loaded.png');
  
  await browser.close();
})();
