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

test('Login to Concrete2You', async ({ page }) => {
  // Step 1: Navigate directly to the login page first to avoid triggering Cloudflare Turnstile
  console.log('Navigating directly to login page...');
  await page.goto('/customer/account/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    await page.screenshot({ path: 'tests/error_login_page.png', fullPage: true });
    console.log('Saved error page screenshot to tests/error_login_page.png');
    throw err;
  }
  
  await page.screenshot({ path: 'tests/before_login_direct.png' });
  console.log('Saved before_login_direct.png');
  
  // Step 4: Submit login form
  console.log('Submitting login form...');
  await page.click('#send2');
  
  await page.waitForTimeout(7000);
  await handleCloudflare(page, 'Post-Login Page');
  
  console.log(`Post-login URL: ${page.url()}`);
  console.log(`Post-login Title: "${await page.title()}"`);
  
  await page.screenshot({ path: 'tests/after_login_direct.png' });
  console.log('Saved after_login_direct.png');
  
  // Assert that we have logged in successfully
  expect(page.url()).not.toContain('/customer/account/login/');
  
  // Step 5: Navigate to checkout cart page
  console.log('Navigating to checkout cart page...');
  await page.goto('/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // Handle Cookie settings on cart page step-by-step (if they appear)
  await checkAllCookiesStepByStep(page, 'Cart page');
  
  console.log(`Final Cart URL: ${page.url()}`);
  console.log(`Final Cart Title: "${await page.title()}"`);
  
  await page.screenshot({ path: 'tests/cart_logged_in.png' });
  console.log('Saved cart_logged_in.png');
  
  expect(page.url()).toContain('/checkout/cart/');
});
