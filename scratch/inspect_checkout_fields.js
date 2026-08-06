const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const userDataDir = path.resolve(__dirname, '../tmp/user-data-dir-inspect');
  const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: true,
    channel: 'chrome',
    userAgent: chromeUserAgent,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 }
  });
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log('Logging in...');
  await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // Close cookie modal if any
  try {
    const acceptAll = page.locator('#onetrust-accept-btn-handler');
    if (await acceptAll.isVisible()) {
      await acceptAll.click();
      await page.waitForTimeout(2000);
    }
  } catch(e){}
  
  await page.fill('#email', 'ilfas.mansuri+10@bytestechnolab.com');
  await page.fill('#pass', 'Smart@123');
  await page.locator('#send2').first().click();
  await page.waitForTimeout(6000);
  
  console.log('Navigating to checkout...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  
  // Print page content to see if we reached checkout
  console.log(`Current page title: "${await page.title()}"`);
  console.log(`Current page URL: ${page.url()}`);
  
  // Inspect all visible input, select, and textarea elements
  const elements = await page.evaluate(() => {
    const elList = Array.from(document.querySelectorAll('input, select, textarea'));
    return elList.map(el => {
      // Find parent label text or surrounding label
      let labelText = '';
      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) labelText = label.innerText;
      }
      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel) labelText = parentLabel.innerText;
      }
      if (!labelText) {
        // Try finding nearest text node or field wrapper label
        const field = el.closest('.field');
        if (field) {
          const label = field.querySelector('label, .label');
          if (label) labelText = label.innerText;
        }
      }
      return {
        tag: el.tagName.toLowerCase(),
        id: id,
        name: el.getAttribute('name'),
        type: el.getAttribute('type'),
        class: el.getAttribute('class'),
        placeholder: el.getAttribute('placeholder'),
        labelText: labelText ? labelText.trim().replace(/\n/g, ' ') : ''
      };
    });
  });
  
  console.log('\n--- DOM Elements List ---');
  elements.forEach((el, index) => {
    console.log(`${index + 1}. <${el.tag}> ID: "${el.id}", Name: "${el.name}", Label: "${el.labelText}", Placeholder: "${el.placeholder}", Type: "${el.type}", Class: "${el.class}"`);
  });
  console.log('------------------------\n');
  
  await page.screenshot({ path: 'inspect_checkout.png' });
  console.log('Saved screenshot of checkout page to inspect_checkout.png');
  
  await context.close();
})();
