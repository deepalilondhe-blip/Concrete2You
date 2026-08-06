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
    console.log(`Checkbox ${i} (ID: ${id}, Name: ${name}): isChecked = ${isChecked}`);
    
    if (!isChecked) {
      console.log(`Checking checkbox ${id} to enable category...`);
      await cb.evaluate((el) => {
        if (!el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await page.waitForTimeout(500);
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
  const userDataDir = path.resolve(__dirname, 'tmp/user-data-dir-addconcrete');
  
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
  
  // Step 1: Navigate directly to the login page first
  console.log('Navigating directly to login page...');
  await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  await handleCloudflare(page, 'Login page');
  await checkAllCookiesStepByStep(page, 'Login page');
  
  console.log('Filling in login details...');
  try {
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', 'ilfas.mansuri+10@bytestechnolab.com');
    await page.fill('#pass', 'Smart@123');
  } catch (err) {
    console.error('❌ Failed to find or fill #email input field!');
    await page.screenshot({ path: 'error_login_page.png', fullPage: true });
    throw err;
  }
  
  await page.screenshot({ path: 'before_login.png' });
  
  console.log('Clicking the yellow Sign In button...');
  const loginBtn = page.locator('#send2').first();
  await loginBtn.click();
  
  console.log('Waiting for post-login page redirect...');
  await page.waitForTimeout(7000);
  await handleCloudflare(page, 'Post-Login Page');
  
  await page.screenshot({ path: 'after_login.png' });
  console.log('Login complete. Navigating to homepage...');
  
  // Step 2: Navigate to the homepage
  await page.goto('https://mcstaging.concrete2you.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  await handleCloudflare(page, 'Homepage');
  await checkAllCookiesStepByStep(page, 'Homepage');
  
  // Step 3: Go to "Buy your Concrete" menu option and click "Foundations" under "Buy Concrete by Application"
  console.log('Navigating the product menus...');
  try {
    // Hover over the primary "Buy your Concrete" link with a short timeout to prevent freezes
    const buyConcreteMenu = page.locator('a.main-menu__link:has-text("Buy your Concrete")').first();
    await buyConcreteMenu.hover({ timeout: 3000 });
    await page.waitForTimeout(1000);
    
    // Click on Foundations link with short timeout
    const foundationsLink = page.locator('a.main-menu__inner-link:has-text("Foundations")').first();
    await foundationsLink.click({ timeout: 3000 });
  } catch (err) {
    console.log('Menu hover/click timed out or was blocked. Navigating directly to Foundations application page...');
    await page.goto('https://mcstaging.concrete2you.com/foundation-concrete', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  
  await page.waitForTimeout(4000);
  await handleCloudflare(page, 'Foundations Application Page');
  await checkAllCookiesStepByStep(page, 'Foundations Application Page');
  
  await page.screenshot({ path: 'application_page.png' });
  
  // Step 4: Click the yellow "Order Now" button
  console.log('Locating and clicking yellow "Order Now" button...');
  const orderNowBtn = page.locator('a.button.primary.icon:has-text("Order Now"), a:has-text("Order Now")').first();
  await orderNowBtn.click();
  
  await page.waitForTimeout(5000);
  await handleCloudflare(page, 'Product Details Page');
  await checkAllCookiesStepByStep(page, 'Product Details Page');
  
  await page.screenshot({ path: 'product_details_page.png' });
  
  // Step 5: Enter valid postcode
  console.log('Entering postcode for delivery zone check...');
  const postcodeField = page.locator('#pdp-postcode');
  if (await postcodeField.isVisible()) {
    await postcodeField.fill('LE65 1BY');
    await page.waitForTimeout(500);
    
    console.log('Clicking "Check Postcode" button...');
    const checkBtn = page.locator('button.button.secondary:has-text("Check Postcode"), button:has-text("Check Postcode")').first();
    await checkBtn.click();
    
    console.log('Waiting for postcode verification to complete and load product options...');
    await page.waitForTimeout(6000);
  }
  
  await page.screenshot({ path: 'postcode_checked.png' });
  
  // Step 6: Select any dropdown options and check quantity
  console.log('Checking for product configuration options...');
  try {
    // Select the first available option in each attributes/options dropdown that loads
    const dropdowns = page.locator('select.super-attribute-select, select[id^="attribute"], select[name^="options"], select.select');
    const dropdownCount = await dropdowns.count();
    console.log(`Found ${dropdownCount} configuration dropdowns on the product form.`);
    
    for (let i = 0; i < dropdownCount; i++) {
      const drop = dropdowns.nth(i);
      const id = await drop.getAttribute('id');
      // Skip the main ot cookie/menu selectors if caught
      if (id && (id.includes('onetrust') || id.includes('delivery-time') || id.includes('unit'))) {
        continue;
      }
      if (await drop.isVisible()) {
        console.log(`Selecting first available configuration option in dropdown ID: "${id}"...`);
        await drop.selectOption({ index: 1 });
        await page.waitForTimeout(1000);
      }
    }
    
    // Fill quantity last (to prevent dynamic dropdown AJAX refreshes from clearing the value)
    const qtyInput = page.locator('#qty').first();
    if (await qtyInput.isVisible()) {
      console.log('Interacting with quantity input using native keyboard and spinner events...');
      await qtyInput.click();
      await qtyInput.focus();
      
      // Select any existing text and clear it
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(500);
      
      // Type the number 2 natively
      await page.keyboard.type('2');
      await page.waitForTimeout(500);
      
      // Press ArrowUp and then ArrowDown to trigger the spinner control state change listeners
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(500);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);
      
      // Force programmatic value injection & dispatch all possible validation events
      // to ensure the form updates even if the headed browser window loses OS focus.
      console.log('Dispatching all validation events programmatically...');
      await qtyInput.evaluate(el => {
        el.value = '2';
        const events = ['input', 'change', 'keydown', 'keypress', 'keyup', 'blur', 'focusout'];
        events.forEach(name => {
          const event = new Event(name, { bubbles: true, cancelable: true });
          el.dispatchEvent(event);
        });
        
        // Also trigger jQuery validation if present
        try {
          if (window.jQuery && window.jQuery(el).valid) {
            window.jQuery(el).valid();
          }
        } catch (e) {}
      });
      await page.waitForTimeout(1000);
    }
  } catch (err) {
    console.warn('Could not populate product configuration options:', err.message);
  }
  
  await page.screenshot({ path: 'product_configured.png' });
  
  // Step 7: Click "Add to Basket" button
  console.log('Clicking the yellow "Add to Basket" button...');
  const addToBasketBtn = page.locator('#product-addtocart-button, button.action.primary.tocart').first();
  await addToBasketBtn.click();
  
  console.log('Waiting for product to be added to cart...');
  await page.waitForTimeout(8000);
  
  await page.screenshot({ path: 'product_added_to_basket.png' });
  console.log('Success! Saved product_added_to_basket.png screenshot.');
  
  if (isHeadless) {
    console.log('Running in headless mode. Closing browser.');
    await context.close();
  } else {
    console.log('\n======================================================');
    console.log('Product addition automation completed! Keeping the browser open.');
    console.log('Close the browser window or press Ctrl+C in your terminal to exit.');
    console.log('======================================================\n');
    await new Promise(resolve => page.on('close', resolve));
    await context.close();
  }
})();
