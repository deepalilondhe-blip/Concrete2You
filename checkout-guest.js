const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Helper to handle Cloudflare challenges by programmatically clicking the Turnstile checkbox
async function handleCloudflare(page, urlDescription) {
  await page.waitForTimeout(3000); // Give the page a moment to initiate the challenge
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
    
    // Get the Turnstile Frame using Playwright's Frame API
    const turnstileFrame = page.frames().find(f => f.url().includes('challenges.cloudflare.com'));
    
    if (turnstileFrame) {
      console.log('Turnstile iframe found via page.frames() API.');
      
      try {
        const iframeElement = await turnstileFrame.frameElement();
        const box = await iframeElement.boundingBox();
        
        if (box && box.width > 0 && box.height > 0) {
          console.log(`Visible iframe bounding box: X=${box.x}, Y=${box.y}, W=${box.width}, H=${box.height}`);
          const clickX = box.x + 35;
          const clickY = box.y + box.height / 2;
          console.log(`Clicking Turnstile checkbox at X=${clickX}, Y=${clickY}...`);
          
          await page.mouse.move(clickX, clickY, { steps: 10 });
          await page.waitForTimeout(500);
          await page.mouse.click(clickX, clickY);
          
          console.log('Clicked. Waiting 10 seconds for challenge verification...');
          await page.waitForTimeout(10000);
        } else {
          console.log('Turnstile iframe element has no layout/size yet. Waiting 4 seconds...');
          await page.waitForTimeout(4000);
        }
      } catch (err) {
        console.error('Failed to retrieve or check Turnstile iframe element bounding box:', err.message);
        await page.waitForTimeout(4000);
      }
    } else {
      console.log('Turnstile iframe not found in page.frames() yet. Waiting 4 seconds...');
      await page.waitForTimeout(4000);
    }
    
    title = await page.title();
    attempts++;
  }
}

// Helper to wait for Magento loading masks and spinners to disappear
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

// Helper to open cookie settings, check all toggle switches, and confirm choices step-by-step
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
    console.log('Clicking "Cookies Settings" button to expand choices...');
    await pcBtn.click();
    await page.waitForTimeout(2000);
  }
  
  const checkboxes = page.locator('#onetrust-consent-sdk input[type="checkbox"]');
  const count = await checkboxes.count();
  console.log(`Found ${count} toggle checkboxes in cookie settings.`);
  
  for (let i = 0; i < count; i++) {
    const cb = checkboxes.nth(i);
    const isChecked = await cb.isChecked();
    const id = await cb.getAttribute('id');
    const name = await cb.getAttribute('name');
    
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
    console.log('Clicking "Confirm My Choices" to save preferences...');
    await saveBtn.click();
  } else {
    const acceptAll = page.locator('#onetrust-accept-btn-handler');
    if (await acceptAll.isVisible()) {
      console.log('Clicking "Accept All Cookies" to save...');
      await acceptAll.click();
    }
  }
  
  await page.waitForTimeout(2000);
  console.log('Cookie preferences successfully updated step-by-step.');
}

(async () => {
  let context;
  let isHeadless = false;
  
  const pathToExtension = path.resolve(__dirname, 'extensions/buster');
  const userDataDir = path.resolve(__dirname, 'tmp/user-data-dir-guestcheckout');
  
  if (fs.existsSync(userDataDir)) {
    try {
      console.log('Cleaning up previous session cache and cookies...');
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not clean user data directory:', e.message);
    }
  }
  
  const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  
  try {
    console.log('Attempting to launch system Google Chrome in headed mode with Buster extension...');
    context = await chromium.launchPersistentContext(userDataDir, { 
      headless: false,
      channel: 'chrome',
      userAgent: chromeUserAgent,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--disable-blink-features=AutomationControlled'
      ],
      viewport: { width: 1280, height: 800 }
    });
  } catch (err) {
    console.warn('\n⚠️ Headed mode failed to launch (likely due to background session or policy restrictions).');
    console.log('Falling back to headless mode with system Chrome (without extension)...\n');
    
    const browser = await chromium.launch({ 
      headless: true,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    });
    context = await browser.newContext({
      userAgent: chromeUserAgent,
      viewport: { width: 1280, height: 800 }
    });
    isHeadless = true;
  }
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  if (context.pages().length > 1) {
    const pages = context.pages();
    for (let i = 1; i < pages.length; i++) {
      try {
        await pages[i].close();
      } catch (e) {}
    }
  }
  
  try {
    await page.bringToFront();
  } catch (e) {}
  
  // Step 1: Generate unique sequential email for guest checkout
  let numericId = 10;
  const counterFile = path.resolve(__dirname, 'tmp/last_numeric_id.txt');
  if (fs.existsSync(counterFile)) {
    try {
      const saved = fs.readFileSync(counterFile, 'utf8').trim();
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 10 && parsed < 99) {
        numericId = parsed + 1;
      }
    } catch (e) {}
  }
  fs.writeFileSync(counterFile, String(numericId), 'utf8');
  const guestEmail = `ilfas.mansuri+guest${numericId}@bytestechnolab.com`;
  console.log(`Generated unique guest email: ${guestEmail}`);
  
  // Step 2: Navigate directly to Shed Bases Category
  console.log('Navigating directly to Shed Bases application page...');
  await page.goto('https://mcstaging.concrete2you.com/shed-bases', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await handleCloudflare(page, 'Shed Base Page');
  await checkAllCookiesStepByStep(page, 'Shed Base Page');
  
  // Step 3: Click yellow "Order Now" button
  console.log('Clicking yellow "Order Now" button...');
  const orderNowBtn = page.locator('a.button.primary.icon:has-text("Order Now"), a:has-text("Order Now")').first();
  await orderNowBtn.click();
  
  await page.waitForTimeout(5000);
  await handleCloudflare(page, 'Product Page');
  await checkAllCookiesStepByStep(page, 'Product Page');
  
  // Step 4: Check postcode
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
  
  // Step 5: Configure dropdown options
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
  
  // Step 6: Input quantity 12 natively & programmatically
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
  
  // Step 7: Add to Basket
  console.log('Clicking "Add to Basket" button...');
  await page.locator('#product-addtocart-button').first().click();
  await page.waitForTimeout(6000);
  
  // Step 8: Navigate to Basket page
  console.log('Navigating to Shopping Basket details page...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await handleCloudflare(page, 'Cart Page');
  await checkAllCookiesStepByStep(page, 'Cart Page');
  
  // Step 9: Click Proceed to Checkout
  console.log('Clicking Proceed to Checkout...');
  const checkoutBtn = page.locator('.checkout-methods-items button.action.primary.checkout, .cart-summary button:has-text("Proceed to Checkout"), .checkout-types button.action.primary.checkout').first();
  await checkoutBtn.click();
  
  console.log('Waiting for guest checkout screen to load...');
  await page.waitForTimeout(12000);
  await handleCloudflare(page, 'Guest Checkout Shipping Page');
  await checkAllCookiesStepByStep(page, 'Guest Checkout Shipping Page');
  
  // Step 10: Fill in Guest Shipping details
  console.log('Filling in guest email field...');
  const emailInput = page.locator('input#customer-email').first();
  await emailInput.click();
  await emailInput.fill(guestEmail);
  await page.waitForTimeout(500);
  
  console.log('Filling in address details using stable name locators...');
  await page.locator('input[name="firstname"]').first().fill('Ilfas');
  await page.locator('input[name="lastname"]').first().fill('Mansuri');
  await page.locator('input[name="street[0]"]').first().fill('12 Main Street');
  await page.locator('input[name="city"]').first().fill('Accrington');
  await page.locator('input[name="telephone"]').first().fill('07123456789');
  
  // Explicitly clear/fill checkout postcode (just in case)
  const shippingPostcode = page.locator('input[name="postcode"]').first();
  await shippingPostcode.clear();
  await shippingPostcode.fill('BB5 1HU');
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'guest_checkout_shipping_filled.png' });
  
  // Step 11: Fill Delivery Date and Time
  console.log('Handling custom delivery date and time validation...');
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  const formattedDate = `${String(futureDate.getDate()).padStart(2, '0')}/${String(futureDate.getMonth() + 1).padStart(2, '0')}/${futureDate.getFullYear()}`;
  
  console.log(`Setting delivery date to: ${formattedDate}`);
  const deliveryDateInput = page.locator('#mp-delivery-date').first();
  await deliveryDateInput.evaluate((el, val) => {
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, formattedDate);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);
  
  console.log('Selecting delivery time options...');
  const deliveryTimeSelect = page.locator('#mp-delivery-time').first();
  if (await deliveryTimeSelect.isVisible()) {
    await deliveryTimeSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
  }
  
  await page.screenshot({ path: 'guest_checkout_delivery_configured.png' });
  
  // Step 12: Click "Next" button to proceed to payment screen
  console.log('Clicking "Next" button...');
  const nextBtn = page.locator('button[type="submit"]:has-text("Next"), button.action.continue.primary, button:has-text("Next")').first();
  await nextBtn.click();
  
  console.log('Waiting for payment checkout phase to load...');
  await page.waitForTimeout(10000);
  await handleCloudflare(page, 'Payment Page');
  
  await page.screenshot({ path: 'guest_checkout_success.png', fullPage: true });
  console.log('Success! Saved guest_checkout_success.png confirmation screenshot.');
  
  if (isHeadless) {
    console.log('Running in headless mode. Closing browser.');
    await context.close();
  } else {
    console.log('\n======================================================');
    console.log('Guest checkout automation completed! Keeping browser open.');
    console.log('======================================================\n');
    await new Promise(resolve => page.on('close', resolve));
    await context.close();
  }
})();
