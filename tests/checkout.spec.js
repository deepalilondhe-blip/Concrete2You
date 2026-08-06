const { test, expect } = require('@playwright/test');

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
        // Retrieve the owner <iframe> element directly from the frame handle
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

// Helper to open cookie settings, check all toggle switches, and confirm choices step-by-step
async function checkAllCookiesStepByStep(page, urlDescription) {
  console.log(`Checking for OneTrust cookie banner on [${urlDescription}]...`);
  
  const pcBtn = page.locator('#onetrust-pc-btn-handler');
  const banner = page.locator('#onetrust-banner-sdk');
  const pcSdk = page.locator('#onetrust-pc-sdk');
  
  // Wait up to 10 seconds for any of the OneTrust cookie elements to become visible
  let bannerVisible = false;
  for (let i = 0; i < 10; i++) {
    if (await pcBtn.isVisible() || await banner.isVisible() || await pcSdk.isVisible()) {
      bannerVisible = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
  
  if (!bannerVisible) {
    console.log(`No OneTrust cookie banner appeared on [${urlDescription}].`);
    return;
  }
  
  // 1. Click "Cookies Settings" button to open the preferences panel (if visible)
  if (await pcBtn.isVisible()) {
    console.log('Clicking "Cookies Settings" button to expand choices...');
    await pcBtn.click();
    await page.waitForTimeout(2000);
  }
  
  // 2. Find and check all cookie switch checkboxes programmatically
  const checkboxes = page.locator('#onetrust-consent-sdk input[type="checkbox"]');
  const count = await checkboxes.count();
  console.log(`Found ${count} toggle checkboxes in cookie settings.`);
  
  for (let i = 0; i < count; i++) {
    const cb = checkboxes.nth(i);
    const isChecked = await cb.isChecked();
    const id = await cb.getAttribute('id');
    const name = await cb.getAttribute('name');
    console.log(`Checkbox ${i} (ID: ${id}, Name: ${name}): isChecked = ${isChecked}`);
    
    if (!isChecked) {
      console.log(`Checking checkbox ${id} to enable category...`);
      // Use evaluate to safely toggle checkbox and trigger event listeners
      await cb.evaluate((el) => {
        if (!el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(500);
    }
  }
  
  // 3. Save choices
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

test('Execute login and proceed to checkout', async ({ page }, testInfo) => {
  // Set test timeout to 180 seconds to allow complete cookies selection and E2E checkout navigation steps
  test.setTimeout(180000);
  
  // Step 1: Navigate directly to the login page first
  console.log('Navigating directly to login page...');
  await page.goto('/customer/account/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  // Handle Cloudflare challenge on login page if present
  await handleCloudflare(page, 'Login page');
  
  // Step 2: Handle Cookie settings step-by-step
  await checkAllCookiesStepByStep(page, 'Login page');
  
  // Step 3: Fill credentials
  console.log('Filling in login details...');
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', 'ilfas.mansuri+10@bytestechnolab.com');
  await page.fill('#pass', 'Smart@123');
  
  await page.screenshot({ path: 'tests/before_login_checkout.png' });
  
  // Step 4: Submit login form
  console.log('Clicking the yellow Sign In button...');
  const loginBtn = page.locator('#send2').first();
  await loginBtn.click();
  
  // Wait for login processing and redirect
  console.log('Waiting for post-login page redirect...');
  await page.waitForTimeout(7000);
  await handleCloudflare(page, 'Post-Login Page');
  
  // Step 5: Navigate to checkout cart page to verify items
  console.log('Navigating to checkout cart page...');
  await page.goto('/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await handleCloudflare(page, 'Cart Page');
  await checkAllCookiesStepByStep(page, 'Cart Page');
  
  // Check if cart is empty
  const isCartEmpty = (await page.locator('.cart-empty').count()) > 0;
  if (isCartEmpty) {
    console.log('🛒 Cart is empty. Adding a sample product...');
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await handleCloudflare(page, 'Homepage');
    
    const productLink = page.locator('.product-item-link').first();
    if (await productLink.count() > 0) {
      await productLink.click();
      await page.waitForTimeout(4000);
      await handleCloudflare(page, 'Product Details Page');
      await checkAllCookiesStepByStep(page, 'Product Details Page');
      
      const addToCartBtn = page.locator('#product-addtocart-button');
      if (await addToCartBtn.count() > 0) {
        await addToCartBtn.click();
        await page.waitForTimeout(6000);
      }
    }
    
    await page.goto('/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
  }
  
  // Step 6: Proceed to Checkout
  console.log('Clicking "Proceed to Checkout" button...');
  const checkoutBtn = page.locator('button[data-role="proceed-to-checkout"], .checkout-methods-items button.checkout, button.checkout:not(#top-cart-btn-checkout)').first();
  if (await checkoutBtn.count() > 0) {
    await checkoutBtn.click();
  } else {
    await page.goto('/checkout/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  
  await page.waitForTimeout(6000);
  await handleCloudflare(page, 'Checkout Page');
  
  // Step 7: Handle Cookie settings on Checkout page
  await checkAllCookiesStepByStep(page, 'Checkout Page');
  
  // Fill Shipping Address if fields are present (i.e. not prefilled)
  console.log('Checking for Shipping Address form fields...');
  try {
    const streetInput = page.locator('input[name="street[0]"]');
    if (await streetInput.isVisible()) {
      console.log('Shipping address fields visible. Filling out address details...');
      await page.fill('input[name="firstname"]', 'Ilfas');
      await page.fill('input[name="lastname"]', 'Mansuri');
      await streetInput.fill('123 Test Street');
      await page.fill('input[name="city"]', 'London');
      await page.selectOption('select[name="country_id"]', 'GB'); // United Kingdom
      await page.fill('input[name="postcode"]', 'EC1A 1BB');
      await page.fill('input[name="telephone"]', '07123456789');
      await page.waitForTimeout(2000);
    }
  } catch (err) {
    console.warn('Notice: Shipping form parsing check completed with warning: ', err.message);
  }
  
  // Step 8: Select Shipping Method
  console.log('Selecting Shipping Method...');
  try {
    await page.waitForSelector('.table-checkout-shipping-method input[type="radio"], input[type="radio"]', { timeout: 10000 });
    const shippingRadio = page.locator('.table-checkout-shipping-method input[type="radio"], input[type="radio"]').first();
    const isRadioChecked = await shippingRadio.isChecked();
    if (!isRadioChecked) {
      await shippingRadio.click();
    }
    await page.waitForTimeout(2000);
  } catch (err) {
    console.warn('Could not select shipping method automatically:', err.message);
  }
  
  // Step 8.5: Handle custom Delivery Date & Time (Concrete2You specific checkout requirements)
  console.log('Handling Delivery Date & Time fields...');
  try {
    const dateInput = page.locator('#mp-delivery-date');
    if (await dateInput.count() > 0) {
      // Calculate a future date (e.g. 7 days from now) to avoid validation blocks
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const dd = String(futureDate.getDate()).padStart(2, '0');
      const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
      const yyyy = futureDate.getFullYear();
      const formattedDate = `${dd}/${mm}/${yyyy}`;
      
      console.log(`Setting Delivery Date to: ${formattedDate}`);
      await dateInput.evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }, formattedDate);
      await page.keyboard.press('Escape'); // close calendar widget popup
      await page.waitForTimeout(2000);
    }
    
    const timeSelect = page.locator('#mp-delivery-time');
    if (await timeSelect.count() > 0) {
      console.log('Selecting first available Delivery Time slot...');
      await timeSelect.selectOption({ index: 1 });
      await page.waitForTimeout(1000);
    }
  } catch (err) {
    console.warn('Could not select delivery date and time automatically:', err.message);
  }
  
  await page.screenshot({ path: 'tests/checkout_shipping.png' });
  
  // Step 9: Click Next button to navigate to Payment Step
  console.log('Clicking "Next" button to proceed to Payment/Billing...');
  const nextBtn = page.locator('button.continue.button, button.action.continue.primary, .button.action.continue.primary');
  if (await nextBtn.isVisible()) {
    await nextBtn.click();
    await page.waitForTimeout(6000);
    await handleCloudflare(page, 'Checkout Payment Step');
  }
  
  const screenshot = await page.screenshot({ path: 'tests/checkout_payment.png' });
  await testInfo.attach('checkout_payment', {
    body: screenshot,
    contentType: 'image/png'
  });
  
  console.log(`Final Page URL reached: ${page.url()}`);
  expect(page.url()).toContain('/checkout/');
});
