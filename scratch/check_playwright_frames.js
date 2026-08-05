const { chromium, devices } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  console.log('Navigating...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  const cookieBtn = page.locator('#onetrust-accept-btn-handler');
  if (await cookieBtn.isVisible()) {
    await cookieBtn.click();
    await page.waitForTimeout(2000);
  }
  
  await page.click('a.my-account-link');
  await page.waitForTimeout(5000);
  
  if (!page.url().includes('/customer/account/login/')) {
    await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
  }
  
  console.log(`Page URL: ${page.url()}`);
  console.log(`Page Title: "${await page.title()}"`);
  
  const frames = page.frames();
  console.log(`--- PLAYWRIGHT FRAMES (${frames.length}) ---`);
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    console.log(`Frame ${i}: URL="${frame.url()}" Name="${frame.name()}"`);
  }
  
  await browser.close();
})();
