const { chromium, devices } = require('@playwright/test');
const path = require('path');

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
  const userDataDir = path.resolve(__dirname, 'tmp/user-data-dir');
  
  // Clear cached user data folder from scratch
  const fs = require('fs');
  if (fs.existsSync(userDataDir)) {
    try {
      console.log('Cleaning up previous session cache and cookies...');
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not clean user data directory (it might be locked by another process):', e.message);
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
        `--load-extension=${pathToExtension}`
      ],
      viewport: { width: 1280, height: 800 }
    });
  } catch (err) {
    console.warn('\n⚠️ Headed mode failed to launch (likely due to background session or policy restrictions).');
    console.log('Falling back to headless mode with system Chrome (without extension)...\n');
    
    const browser = await chromium.launch({ 
      headless: true,
      channel: 'chrome'
    });
    context = await browser.newContext({
      userAgent: chromeUserAgent,
      viewport: { width: 1280, height: 800 }
    });
    isHeadless = true;
  }
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  // Step 1: Navigate directly to the login page first to avoid triggering Cloudflare Turnstile
  console.log('Navigating directly to login page...');
  await page.goto('https://mcstaging.concrete2you.com/customer/account/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  // Handle Cloudflare challenge on login page if present
  await handleCloudflare(page, 'Login page');
  console.log(`Login page Title after challenge checks: "${await page.title()}"`);
  
  // Step 2: Handle Cookie settings step-by-step
  await checkAllCookiesStepByStep(page, 'Login page');
  
  // Step 3: Fill credentials
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
  const loginBtn = page.locator('#send2');
  await loginBtn.click();
  
  // Wait for login processing and redirect
  console.log('Waiting for post-login page redirect...');
  await page.waitForTimeout(7000);
  await handleCloudflare(page, 'Post-Login Page');
  
  console.log(`Post-login URL: ${page.url()}`);
  console.log(`Post-login Title: "${await page.title()}"`);
  
  await page.screenshot({ path: 'after_login.png' });
  console.log('Saved after_login.png screenshot');
  
  // Step 5: Navigate to checkout cart page
  console.log('Navigating to checkout cart page...');
  await page.goto('https://mcstaging.concrete2you.com/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // Handle Cookie settings on cart page step-by-step (if they appear)
  await checkAllCookiesStepByStep(page, 'Cart page');
  
  console.log(`Final Cart URL: ${page.url()}`);
  console.log(`Final Cart Title: "${await page.title()}"`);
  
  await page.screenshot({ path: 'cart_logged_in.png' });
  console.log('Saved cart_logged_in.png screenshot');
  
  if (isHeadless) {
    console.log('Running in headless mode. Closing browser.');
    await context.close();
  } else {
    console.log('\n======================================================');
    console.log('Login automation completed! Keeping the browser open.');
    console.log('Close the browser window or press Ctrl+C in your terminal to exit.');
    console.log('======================================================\n');
    await new Promise(resolve => page.on('close', resolve));
    await context.close();
  }
})();
