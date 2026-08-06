const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const userDataDir = path.resolve(__dirname, '../tmp/user-data-dir-inspect-nav');
  const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: true,
    channel: 'chrome',
    userAgent: chromeUserAgent,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 }
  });
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log('Navigating to homepage...');
  await page.goto('https://mcstaging.concrete2you.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  // Close cookie modal if any
  try {
    const acceptAll = page.locator('#onetrust-accept-btn-handler');
    if (await acceptAll.isVisible()) {
      await acceptAll.click();
      await page.waitForTimeout(2000);
    }
  } catch(e){}
  
  // Inspect all visible links containing text or in header
  const links = await page.evaluate(() => {
    const aList = Array.from(document.querySelectorAll('a'));
    return aList.map(a => ({
      text: a.innerText ? a.innerText.trim() : '',
      href: a.getAttribute('href'),
      class: a.getAttribute('class'),
      id: a.getAttribute('id')
    })).filter(item => item.text.length > 0 || (item.href && item.href.includes('concrete')));
  });
  
  console.log('\n--- DOM Links List ---');
  links.forEach((l, index) => {
    console.log(`${index + 1}. Text: "${l.text}", Href: "${l.href}", ID: "${l.id}", Class: "${l.class}"`);
  });
  console.log('---------------------\n');
  
  await context.close();
})();
