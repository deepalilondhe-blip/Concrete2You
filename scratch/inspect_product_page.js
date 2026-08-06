const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const userDataDir = path.resolve(__dirname, '../tmp/user-data-dir-inspect-prod');
  const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: true,
    channel: 'chrome',
    userAgent: chromeUserAgent,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 }
  });
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log('Navigating to product details page...');
  await page.goto('https://mcstaging.concrete2you.com/foundationcrete-extra', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Close cookies
  try {
    const acceptAll = page.locator('#onetrust-accept-btn-handler');
    if (await acceptAll.isVisible()) {
      await acceptAll.click();
      await page.waitForTimeout(2000);
    }
  } catch(e){}
  
  // Log page title and URL
  console.log(`Title: "${await page.title()}"`);
  console.log(`URL: ${page.url()}`);
  
  // Inspect inputs, selects, textareas, and buttons
  const elements = await page.evaluate(() => {
    const elList = Array.from(document.querySelectorAll('input, select, textarea, button'));
    return elList.map(el => {
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
        text: el.innerText ? el.innerText.trim() : '',
        labelText: labelText ? labelText.trim().replace(/\n/g, ' ') : ''
      };
    });
  });
  
  console.log('\n--- DOM Product Page Elements ---');
  elements.forEach((el, index) => {
    console.log(`${index + 1}. <${el.tag}> ID: "${el.id}", Name: "${el.name}", Text: "${el.text}", Label: "${el.labelText}", Placeholder: "${el.placeholder}", Type: "${el.type}", Class: "${el.class}"`);
  });
  console.log('-------------------------------\n');
  
  await page.screenshot({ path: 'product_page_inspect.png' });
  console.log('Saved product_page_inspect.png');
  
  await context.close();
})();
