const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded' });
  
  // Find all links/elements containing "Account"
  console.log('--- Links containing "Account" ---');
  const accountElements = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, div, span'))
      .filter(el => el.textContent && el.textContent.includes('Account'))
      .map(el => ({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        text: el.textContent.trim().substring(0, 50),
        href: el.getAttribute('href')
      }));
  });
  console.log(accountElements);

  // Let's also check for cookie banner elements (e.g. IDs containing "cookie", "consent", "accept", "banner")
  console.log('--- Potential Cookie/Consent Banner Elements ---');
  const potentialBanners = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div, button, a'))
      .filter(el => {
        const id = (el.id || '').toLowerCase();
        const cls = (el.className || '').toLowerCase();
        return id.includes('cookie') || cls.includes('cookie') || id.includes('consent') || cls.includes('consent') || id.includes('popup') || cls.includes('popup');
      })
      .map(el => ({
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        text: el.textContent ? el.textContent.trim().substring(0, 80) : ''
      }));
  });
  console.log(potentialBanners.slice(0, 15));

  await browser.close();
})();
