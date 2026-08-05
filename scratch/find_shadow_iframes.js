const { chromium, devices } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  console.log('Navigating to trigger challenge...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // Accept cookies
  const cookieBtn = page.locator('#onetrust-accept-btn-handler');
  if (await cookieBtn.isVisible()) {
    await cookieBtn.click();
    await page.waitForTimeout(2000);
  }
  
  await page.click('a.my-account-link');
  await page.waitForTimeout(4000);
  
  if (!page.url().includes('/customer/account/login/')) {
    await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
  }
  
  // Find iframe including Shadow DOM
  const iframeDetails = await page.evaluate(() => {
    function findIframes(root) {
      let found = [];
      const localIframes = Array.from(root.querySelectorAll('iframe'));
      found.push(...localIframes.map(f => ({
        src: f.getAttribute('src') || '',
        title: f.getAttribute('title') || '',
        id: f.id,
        className: f.className,
        width: f.offsetWidth,
        height: f.offsetHeight
      })));
      
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          found.push(...findIframes(el.shadowRoot));
        }
      }
      return found;
    }
    return findIframes(document);
  });
  
  console.log('--- IFRAMES FOUND IN SHADOW DOM ---');
  console.log(iframeDetails);
  
  await browser.close();
})();
