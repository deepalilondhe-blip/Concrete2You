const { chromium, devices } = require('@playwright/test');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  console.log('Navigating with Desktop Chrome settings...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded' });
  
  await page.waitForTimeout(6000);
  
  const title = await page.title();
  console.log(`Page Title: "${title}"`);
  
  if (title === 'Basket' || title.includes('Basket')) {
    console.log('Success! Basket page loaded.');
    const content = await page.content();
    fs.writeFileSync('scratch/basket_page.html', content);
    
    // Find all clickable elements
    const elements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, button, div.account, li.account'))
        .map(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          text: el.textContent ? el.textContent.trim().replace(/\s+/g, ' ') : '',
          href: el.getAttribute('href') || ''
        }));
    });
    fs.writeFileSync('scratch/elements.json', JSON.stringify(elements, null, 2));
    console.log('Saved elements to scratch/elements.json');
  } else {
    console.log('Failed to bypass Cloudflare. Page title is:', title);
  }
  
  await browser.close();
})();
