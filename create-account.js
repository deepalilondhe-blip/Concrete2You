const { chromium } = require('@playwright/test');
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
  const userDataDir = path.resolve(__dirname, 'tmp/user-data-dir-create');
  
  // Clear cached user data folder from scratch
  const fs = require('fs');
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
  
  // Step 1: Navigate directly to the account creation page
  console.log('Navigating directly to account creation page...');
  await page.goto('https://mcstaging.concrete2you.com/customer/account/create/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  // Handle Cloudflare challenge on account creation page if present
  await handleCloudflare(page, 'Registration page');
  console.log(`Registration page Title after challenge checks: "${await page.title()}"`);
  
  // Step 2: Handle Cookie settings step-by-step
  await checkAllCookiesStepByStep(page, 'Registration page');
  
  // Generate a unique email using a timestamp on each execution to prevent "already registered" errors
  const uniqueEmail = `ilfas.mansuri+${Date.now()}@bytestechnolab.com`;
  
  // Step 3: Fill registration details
  console.log('Filling in registration details...');
  try {
    await page.waitForSelector('#firstname', { timeout: 15000 });
    await page.fill('#firstname', 'Ilfas');
    await page.fill('#lastname', 'Mansuri');
    console.log(`Using unique email: ${uniqueEmail}`);
    await page.fill('#email_address', uniqueEmail);
    await page.fill('#password', 'Smart@123');
    await page.fill('#password-confirmation', 'Smart@123');
  } catch (err) {
    console.error('❌ Failed to find or fill registration fields!');
    await page.screenshot({ path: 'error_registration_page.png', fullPage: true });
    console.log('Error page screenshot saved to error_registration_page.png');
    throw err;
  }
  
  await page.screenshot({ path: 'before_registration.png' });
  console.log('Saved before_registration.png screenshot');
  
  // Step 4: Click register button
  console.log('Clicking the register button...');
  const submitBtn = page.locator('button.action.submit.primary');
  await submitBtn.click();
  
  // Wait for registration processing and redirect
  console.log('Waiting for post-registration redirect...');
  await page.waitForTimeout(8000);
  await handleCloudflare(page, 'Post-Registration Page');
  
  console.log(`Post-registration URL: ${page.url()}`);
  console.log(`Post-registration Title: "${await page.title()}"`);
  
  await page.screenshot({ path: 'after_registration.png' });
  console.log('Saved after_registration.png screenshot');
  
  if (isHeadless) {
    console.log('Running in headless mode. Closing browser.');
    await context.close();
  } else {
    console.log('\n======================================================');
    console.log('Registration automation completed! Keeping the browser open.');
    console.log('Close the browser window or press Ctrl+C in your terminal to exit.');
    console.log('======================================================\n');
    await new Promise(resolve => page.on('close', resolve));
    await context.close();
  }
})();
