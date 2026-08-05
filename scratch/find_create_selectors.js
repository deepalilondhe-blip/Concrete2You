const { chromium } = require('@playwright/test');

// Helper to handle Cloudflare challenges
async function handleCloudflare(page) {
  await page.waitForTimeout(4000);
  let title = await page.title();
  if (title.includes('Just a moment') || title.includes('Cloudflare')) {
    console.log('Turnstile challenge detected. Searching for iframe...');
    const turnstileFrame = page.frames().find(f => f.url().includes('challenges.cloudflare.com'));
    if (turnstileFrame) {
      console.log('Turnstile iframe found.');
      const iframeElement = await turnstileFrame.frameElement();
      const box = await iframeElement.boundingBox();
      if (box && box.width > 0 && box.height > 0) {
        const clickX = box.x + 35;
        const clickY = box.y + box.height / 2;
        await page.mouse.move(clickX, clickY, { steps: 10 });
        await page.waitForTimeout(500);
        await page.mouse.click(clickX, clickY);
        console.log('Clicked checkbox. Waiting for redirect...');
        await page.waitForTimeout(10000);
      }
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Navigating to account creation page...');
  await page.goto('https://mcstaging.concrete2you.com/customer/account/create/', { waitUntil: 'domcontentloaded' });
  await handleCloudflare(page);
  
  console.log(`Page URL after challenge: ${page.url()}`);
  console.log(`Page Title after challenge: "${await page.title()}"`);
  
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, button, select, textarea'))
      .map(el => ({
        tagName: el.tagName,
        type: el.type,
        id: el.id,
        name: el.name,
        className: el.className,
        value: el.value,
        placeholder: el.placeholder,
        visible: el.offsetWidth > 0 && el.offsetHeight > 0
      }));
  });
  console.log(JSON.stringify(inputs, null, 2));
  
  await browser.close();
})();
