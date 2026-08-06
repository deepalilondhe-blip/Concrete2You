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

(async () => {
  let context;
  let isHeadless = false;
  
  const pathToExtension = path.resolve(__dirname, 'extensions/buster');
  const userDataDir = path.resolve(__dirname, 'tmp/user-data-dir-checkout');
  
  // Clear cached user data folder from scratch
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
  
  // Close any additional default blank tabs to keep the user's view clean and focused
  if (context.pages().length > 1) {
    const pages = context.pages();
    for (let i = 1; i < pages.length; i++) {
      try {
        await pages[i].close();
      } catch (e) {
        // Ignore errors closing inactive pages
      }
    }
  }
  
  try {
    await page.bringToFront();
  } catch (e) {
    // Ignore bringToFront errors
  }
  
  // Step 1: Navigate directly to the login page first to avoid triggering Cloudflare Turnstile
  console.log('Navigating directly to login page...');
  await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  // Handle Cloudflare challenge on login page if present
  await handleCloudflare(page, 'Login page');
  console.log(`Login page Title after challenge checks: "${await page.title()}"`);
  
  // Step 2: Handle Cookie settings step-by-step
  await checkAllCookiesStepByStep(page, 'Login page');
  
  // Step 3: Fill credentials (we use our registered user account)
  console.log('Filling in login details...');
  try {
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', 'ilfas.mansuri+10@bytestechnolab.com');
    await page.fill('#pass', 'Smart@123');
  } catch (err) {
    console.error('❌ Failed to find or fill #email input field!');
    await page.screenshot({ path: 'error_login_page.png', fullPage: true });
    console.log('Error page screenshot saved to error_login_page.png');
    throw err;
  }
  
  await page.screenshot({ path: 'before_login.png' });
  console.log('Saved before_login.png screenshot');
  
  // Step 4: Submit login form
  console.log('Clicking the yellow Sign In button...');
  const loginBtn = page.locator('#send2').first();
  await loginBtn.click();
  
  // Wait for login processing and redirect
  console.log('Waiting for post-login page redirect...');
  await page.waitForTimeout(7000);
  await handleCloudflare(page, 'Post-Login Page');
  
  console.log(`Post-login URL: ${page.url()}`);
  console.log(`Post-login Title: "${await page.title()}"`);
  
  await page.screenshot({ path: 'after_login.png' });
  console.log('Saved after_login.png screenshot');
  
  // Step 5: Navigate to checkout cart page to verify items
  console.log('Navigating to checkout cart page...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await handleCloudflare(page, 'Cart Page');
  await checkAllCookiesStepByStep(page, 'Cart Page');
  
  // Check if cart is empty
  const cartEmptySelector = '.cart-empty';
  const isCartEmpty = (await page.locator(cartEmptySelector).count()) > 0;
  
  if (isCartEmpty) {
    console.log('🛒 Cart is empty. Navigating to products listing page to add a product...');
    // Navigate to homepage or a specific category page to select a product
    await page.goto('https://mcstaging.concrete2you.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await handleCloudflare(page, 'Homepage');
    
    // Find the first product link and click it
    const productLink = page.locator('.product-item-link').first();
    if (await productLink.count() > 0) {
      console.log('Clicking first product item link...');
      await productLink.click();
      await page.waitForTimeout(4000);
      await handleCloudflare(page, 'Product Details Page');
      await checkAllCookiesStepByStep(page, 'Product Details Page');
      
      // Select shipping / options if required, or simply click Add to Cart
      const addToCartBtn = page.locator('#product-addtocart-button');
      if (await addToCartBtn.count() > 0) {
        console.log('Clicking "Add to Cart" button...');
        await addToCartBtn.click();
        await page.waitForTimeout(6000);
      }
    } else {
      console.log('❌ No product links found on homepage. Navigating directly to cart (proceeding anyway)...');
    }
    
    // Re-navigate to the cart page
    await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
  }
  
  await page.screenshot({ path: 'cart_ready.png' });
  console.log('Saved cart_ready.png screenshot');
  
  // Step 6: Proceed to Checkout
  console.log('Clicking "Proceed to Checkout" button...');
  const checkoutBtn = page.locator('button[data-role="proceed-to-checkout"], .checkout-methods-items button.checkout, button.checkout:not(#top-cart-btn-checkout)').first();
  if (await checkoutBtn.count() > 0) {
    await checkoutBtn.click();
  } else {
    // Navigate directly to checkout if button not clicked
    await page.goto('https://mcstaging.concrete2you.com/checkout/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  
  await page.waitForTimeout(6000);
  await handleCloudflare(page, 'Checkout Page');
  console.log(`Checkout URL: ${page.url()}`);
  
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
    } else {
      console.log('Shipping address form not visible (likely already pre-filled from account settings).');
    }
  } catch (err) {
    console.warn('Notice: Shipping form parsing check completed with warning: ', err.message);
  }
  
  // Step 8: Select Shipping Method
  console.log('Selecting Shipping Method...');
  try {
    // Wait for the shipping methods to render/load
    await page.waitForSelector('.table-checkout-shipping-method input[type="radio"], input[type="radio"]', { timeout: 10000 });
    const shippingRadio = page.locator('.table-checkout-shipping-method input[type="radio"], input[type="radio"]').first();
    const isRadioChecked = await shippingRadio.isChecked();
    if (!isRadioChecked) {
      await shippingRadio.click();
      console.log('Clicked first available shipping method.');
    } else {
      console.log('Shipping method is already selected.');
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
      await dateInput.click();
      await dateInput.fill(formattedDate);
      await page.keyboard.press('Escape'); // close calendar widget popup
      await page.waitForTimeout(1000);
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
  
  await page.screenshot({ path: 'checkout_shipping.png' });
  console.log('Saved checkout_shipping.png');
  
  // Step 9: Click Next button to navigate to Payment Step
  console.log('Clicking "Next" button to proceed to Payment/Billing...');
  const nextBtn = page.locator('button.continue.button, button.action.continue.primary, .button.action.continue.primary');
  if (await nextBtn.isVisible()) {
    await nextBtn.click();
    await page.waitForTimeout(6000);
    await handleCloudflare(page, 'Checkout Payment Step');
  }
  
  await page.screenshot({ path: 'checkout_payment.png' });
  console.log('Saved checkout_payment.png');
  
  console.log(`Final Page URL reached: ${page.url()}`);
  console.log(`Final Page Title: "${await page.title()}"`);
  
  if (isHeadless) {
    console.log('Running in headless mode. Closing browser.');
    await context.close();
  } else {
    console.log('\n======================================================');
    console.log('Checkout automation completed! Stopping right before "Place Order".');
    console.log('Close the browser window or press Ctrl+C in your terminal to exit.');
    console.log('======================================================\n');
    await new Promise(resolve => page.on('close', resolve));
    await context.close();
  }
})();
