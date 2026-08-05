const { chromium, devices } = require('@playwright/test');
const fs = require('fs');

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
  
  console.log(`Page Title: "${await page.title()}"`);
  
  // Dump all inputs and buttons
  const inputsAndButtons = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, button'))
      .map(el => ({
        tagName: el.tagName,
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        id: el.id,
        className: el.className,
        text: el.textContent ? el.textContent.trim() : '',
        placeholder: el.getAttribute('placeholder') || ''
      }));
    return inputs;
  });
  
  console.log('--- INPUTS & BUTTONS ---');
  console.log(inputsAndButtons);
  
  await browser.close();
})();
