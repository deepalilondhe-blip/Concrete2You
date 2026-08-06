const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Helper to handle Cloudflare challenges by programmatically clicking the Turnstile checkbox
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
  console.log('Cookie preferences successfully updated step-by-step.');
}

test('Execute Guest Checkout Flow without Login', async ({ page }, testInfo) => {
  // Set execution timeout to 180s to allow navigation + configuration steps
  test.setTimeout(180000);
  
  // Use static email for guest checkout
  const guestEmail = 'ilfas.mansuri+10@bytestechnolab.com';
  console.log(`Using static guest email: ${guestEmail}`);
  
  // Navigate directly to Shed Bases Category
  console.log('Navigating directly to Shed Bases application page...');
  await page.goto('/shed-bases', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await handleCloudflare(page, 'Shed Base Page');
  await checkAllCookiesStepByStep(page, 'Shed Base Page');
  
  // Click yellow "Order Now" button
  console.log('Clicking yellow "Order Now" button...');
  const orderNowBtn = page.locator('a.button.primary.icon:has-text("Order Now"), a:has-text("Order Now")').first();
  await orderNowBtn.click();
  
  await page.waitForTimeout(5000);
  await handleCloudflare(page, 'Product Page');
  await checkAllCookiesStepByStep(page, 'Product Page');
  
  // Check postcode
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
  
  // Input quantity 12 natively & programmatically
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
  
  // Add to Basket
  console.log('Clicking "Add to Basket" button...');
  await page.locator('#product-addtocart-button').first().click();
  await page.waitForTimeout(6000);
  
  // Navigate to Basket page
  console.log('Navigating to Shopping Basket details page...');
  await page.goto('/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await handleCloudflare(page, 'Cart Page');
  await checkAllCookiesStepByStep(page, 'Cart Page');
  
  // Click Proceed to Checkout
  console.log('Clicking Proceed to Checkout...');
  const checkoutBtn = page.locator('.checkout-methods-items button.action.primary.checkout, .cart-summary button:has-text("Proceed to Checkout"), .checkout-types button.action.primary.checkout').first();
  await checkoutBtn.click();
  
  console.log('Waiting for guest checkout screen to load...');
  await page.waitForTimeout(12000);
  await handleCloudflare(page, 'Guest Checkout Shipping Page');
  await checkAllCookiesStepByStep(page, 'Guest Checkout Shipping Page');
  
  // Fill in Guest Shipping details
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
  
  const shippingPostcode = page.locator('input[name="postcode"]').first();
  await shippingPostcode.clear();
  await shippingPostcode.fill('BB5 1HU');
  
  await page.waitForTimeout(2000);
  
  // Fill Delivery Date and Time
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
  
  const deliveryTimeSelect = page.locator('#mp-delivery-time').first();
  if (await deliveryTimeSelect.isVisible()) {
    await deliveryTimeSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
  }
  
  // Click "Next" button to proceed to payment screen
  console.log('Clicking "Next" button...');
  const nextBtn = page.locator('button[type="submit"]:has-text("Next"), button.action.continue.primary, button:has-text("Next")').first();
  await nextBtn.click();
  
  console.log('Waiting for payment checkout phase to load...');
  await page.waitForTimeout(10000);
  await handleCloudflare(page, 'Payment Page');
  
  const screenshot = await page.screenshot({ path: 'tests/guest_checkout_success.png', fullPage: true });
  await testInfo.attach('guest_checkout_success', {
    body: screenshot,
    contentType: 'image/png'
  });
  console.log('Success! Saved tests/guest_checkout_success.png screenshot.');
  
  expect(page.url()).toContain('#payment');
});
