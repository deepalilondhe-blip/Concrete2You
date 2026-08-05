const { chromium, devices } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  console.log('Navigating to login page...');
  await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  console.log(`Initial Title: "${await page.title()}"`);
  
  // Find Turnstile iframe
  try {
    const iframeSelector = 'iframe[src*="challenges.cloudflare.com"]';
    console.log('Waiting for Turnstile iframe to load...');
    const iframe = await page.waitForSelector(iframeSelector, { timeout: 15000 });
    console.log('Turnstile iframe detected. Getting bounding box...');
    const box = await iframe.boundingBox();
    if (box) {
      console.log(`Iframe location: X=${box.x}, Y=${box.y}, W=${box.width}, H=${box.height}`);
      // The Turnstile checkbox is typically at ~35-45px from the left and in the middle vertically
      const clickX = box.x + 35;
      const clickY = box.y + box.height / 2;
      console.log(`Clicking Turnstile checkbox at coordinates: X=${clickX}, Y=${clickY}`);
      
      // Move mouse to coordinates to mimic real user behavior
      await page.mouse.move(clickX, clickY, { steps: 10 });
      await page.waitForTimeout(500);
      await page.mouse.click(clickX, clickY);
      
      console.log('Clicked. Waiting 10 seconds to see if it bypasses...');
      await page.waitForTimeout(10000);
      console.log(`Page URL: ${page.url()}`);
      console.log(`Page Title after click: "${await page.title()}"`);
      
      // Check if #email is now visible
      const isEmailVisible = await page.locator('#email').isVisible();
      console.log(`Is #email field visible now? ${isEmailVisible}`);
      
      await page.screenshot({ path: 'scratch/turnstile_result.png', fullPage: true });
      console.log('Saved screenshot to scratch/turnstile_result.png');
    } else {
      console.log('Failed to get bounding box for Turnstile iframe.');
    }
  } catch (e) {
    console.log('Error or no Turnstile iframe found:', e.message);
    await page.screenshot({ path: 'scratch/turnstile_error.png', fullPage: true });
  }
  
  await browser.close();
})();
