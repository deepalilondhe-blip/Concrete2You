const { chromium } = require('playwright');
const path = require('path');

async function handleCloudflare(page, urlDescription) {
  await page.waitForTimeout(3000);
  let title = await page.title();
  let attempts = 0;
  while (attempts < 5) {
    const hasChallengeElements = (await page.locator('#challenge-running').count()) > 0 || 
                                 (await page.locator('#cf-challenge').count()) > 0 ||
                                 (await page.locator('#cf-turnstile-response').count()) > 0 ||
                                 title.includes('Just a moment') ||
                                 title.includes('Cloudflare');
                                 
    if (!hasChallengeElements) {
      console.log(`✅ No Cloudflare challenge detected on [${urlDescription}]. Page title is: "${title}"`);
      break;
    }
    
    console.warn(`⚠️ Cloudflare challenge page detected on [${urlDescription}] (Attempt ${attempts + 1}/5). Page title: "${title}".`);
    const turnstileFrame = page.frames().find(f => f.url().includes('challenges.cloudflare.com'));
    
    if (turnstileFrame) {
      try {
        const iframeElement = await turnstileFrame.frameElement();
        const box = await iframeElement.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          const clickX = box.x + 35;
          const clickY = box.y + box.height / 2;
          await page.mouse.move(clickX, clickY, { steps: 10 });
          await page.waitForTimeout(500);
          await page.mouse.click(clickX, clickY);
          await page.waitForTimeout(10000);
        } else {
          await page.waitForTimeout(4000);
        }
      } catch (err) {
        await page.waitForTimeout(4000);
      }
    } else {
      await page.waitForTimeout(4000);
    }
    title = await page.title();
    attempts++;
  }
}

async function waitForLoaderToDisappear(page) {
  try {
    const loader = page.locator('.loading-mask, .process-loading, .loader').first();
    try {
      await loader.waitFor({ state: 'visible', timeout: 1500 });
      console.log('Loader mask detected. Waiting for it to disappear...');
      await loader.waitFor({ state: 'hidden', timeout: 15000 });
      console.log('Loader mask disappeared.');
    } catch (e) {}
  } catch (err) {}
}

async function checkAllCookiesStepByStep(page, urlDescription) {
  console.log(`Checking for OneTrust cookie banner on [${urlDescription}]...`);
  const pcBtn = page.locator('#onetrust-pc-btn-handler');
  const banner = page.locator('#onetrust-banner-sdk');
  const pcSdk = page.locator('#onetrust-pc-sdk');
  
  let bannerVisible = false;
  for (let i = 0; i < 4; i++) {
    if (await pcBtn.isVisible() || await banner.isVisible() || await pcSdk.isVisible()) {
      bannerVisible = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  
  if (!bannerVisible) {
    console.log(`No OneTrust cookie banner appeared on [${urlDescription}].`);
    return;
  }
  
  if (await pcBtn.isVisible()) {
    await pcBtn.click();
    await page.waitForTimeout(2000);
  }
  
  const checkboxes = page.locator('#onetrust-consent-sdk input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    const cb = checkboxes.nth(i);
    const isChecked = await cb.isChecked();
    if (!isChecked) {
      await cb.evaluate((el) => {
        if (!el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(200);
    }
  }
  
  const saveBtn = page.locator('.save-preference-btn-handler');
  if (await saveBtn.isVisible()) {
    await saveBtn.click();
  } else {
    const acceptAll = page.locator('#onetrust-accept-btn-handler');
    if (await acceptAll.isVisible()) {
      await acceptAll.click();
    }
  }
  
  await page.waitForTimeout(2000);
  console.log('Cookie preferences updated.');
}

(async () => {
  const userDataDir = path.resolve(__dirname, '../tmp/user-data-dir-guest-inspect');
  const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: true,
    channel: 'chrome',
    userAgent: chromeUserAgent,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 }
  });
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log('Navigating directly to Shed Bases category...');
  await page.goto('https://mcstaging.concrete2you.com/shed-bases', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  await checkAllCookiesStepByStep(page, 'Shed Bases Page');
  
  // Click Order Now
  console.log('Clicking Order Now on Basecrete Extra...');
  await page.locator('a.button.primary.icon:has-text("Order Now"), a:has-text("Order Now")').first().click();
  await page.waitForTimeout(5000);
  await checkAllCookiesStepByStep(page, 'Product Page');
  
  // Enter postcode
  console.log('Entering postcode...');
  const postcodeField = page.locator('#pdp-postcode');
  if (await postcodeField.isVisible()) {
    await postcodeField.fill('BB5 1HU');
    await page.waitForTimeout(500);
    await page.locator('button.button.secondary:has-text("Check Postcode"), button:has-text("Check Postcode")').first().click();
    await page.waitForTimeout(1500);
    await waitForLoaderToDisappear(page);
    await page.waitForTimeout(4000);
  }
  
  // Configure dropdown options
  console.log('Selecting dropdown options...');
  try {
    const dropdowns = page.locator('select.super-attribute-select, select[id^="attribute"], select[name^="options"], select.select');
    const count = await dropdowns.count();
    for (let i = 0; i < count; i++) {
      const drop = dropdowns.nth(i);
      const id = await drop.getAttribute('id');
      if (id && (id.includes('onetrust') || id.includes('delivery-time') || id.includes('unit'))) {
        continue;
      }
      if (await drop.isVisible()) {
        await drop.selectOption({ index: 1 });
        await page.waitForTimeout(1500);
        await waitForLoaderToDisappear(page);
        await page.waitForTimeout(2000);
      }
    }
  } catch (err) {}
  
  // Add to basket
  console.log('Setting quantity to 12...');
  const qtyInput = page.locator('input#qty:visible, input[name="qty"]:visible').first();
  if (await qtyInput.isVisible()) {
    await qtyInput.click();
    await qtyInput.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('12');
    await qtyInput.evaluate(el => {
      el.value = '12';
      const events = ['input', 'change', 'keydown', 'keypress', 'keyup', 'blur', 'focusout'];
      events.forEach(name => el.dispatchEvent(new Event(name, { bubbles: true })));
    });
    await page.waitForTimeout(1500);
  }
  
  console.log('Clicking Add to Basket...');
  await page.locator('#product-addtocart-button').first().click();
  await page.waitForTimeout(6000);
  
  // Navigate to basket
  console.log('Navigating to cart...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await checkAllCookiesStepByStep(page, 'Cart Page');
  
  // Click Proceed to Checkout on the main cart page
  console.log('Clicking Proceed to Checkout...');
  const checkoutBtn = page.locator('.checkout-methods-items button.action.primary.checkout, .cart-summary button:has-text("Proceed to Checkout"), .checkout-types button.action.primary.checkout').first();
  await checkoutBtn.click();
  
  await page.waitForTimeout(12000);
  await handleCloudflare(page, 'Checkout Page');
  await checkAllCookiesStepByStep(page, 'Checkout Page');
  
  console.log(`Current URL: ${page.url()}`);
  console.log(`Page Title: "${await page.title()}"`);
  
  await page.screenshot({ path: 'guest_checkout_inspect.png', fullPage: true });
  console.log('Saved guest_checkout_inspect.png');
  
  // Print input fields on checkout screen
  const elements = await page.evaluate(() => {
    const elList = Array.from(document.querySelectorAll('input, select, textarea, button'));
    return elList.map(el => ({
      tag: el.tagName.toLowerCase(),
      id: el.getAttribute('id'),
      name: el.getAttribute('name'),
      type: el.getAttribute('type'),
      class: el.getAttribute('class'),
      text: el.innerText ? el.innerText.trim() : ''
    }));
  });
  
  console.log('\n--- Checkout Page Elements ---');
  elements.forEach((el, idx) => {
    console.log(`${idx + 1}. <${el.tag}> ID: "${el.id}", Name: "${el.name}", Type: "${el.type}", Text: "${el.text}"`);
  });
  
  await context.close();
})();
