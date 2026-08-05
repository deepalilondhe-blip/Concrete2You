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

test('Register a new account on Concrete2You', async ({ page }) => {
  // Step 1: Navigate directly to the account creation page
  console.log('Navigating directly to account creation page...');
  await page.goto('/customer/account/create/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  // Handle Cloudflare challenge on account creation page if present
  await handleCloudflare(page, 'Registration page');
  console.log(`Registration page Title after challenge checks: "${await page.title()}"`);
  
  // Step 2: Handle Cookie settings step-by-step
  await checkAllCookiesStepByStep(page, 'Registration page');
  
  // Step 3: Fill registration details
  console.log('Filling in registration details...');
  try {
    await page.waitForSelector('#firstname', { timeout: 15000 });
    await page.fill('#firstname', 'Ilfas');
    await page.fill('#lastname', 'Mansuri');
    await page.fill('#email_address', 'ilfas.mansuri+11@bytestechnolab.com');
    await page.fill('#password', 'Smart@123');
    await page.fill('#password-confirmation', 'Smart@123');
  } catch (err) {
    console.error('❌ Failed to find or fill registration fields!');
    await page.screenshot({ path: 'tests/error_registration_page.png', fullPage: true });
    console.log('Saved error page screenshot to tests/error_registration_page.png');
    throw err;
  }
  
  await page.screenshot({ path: 'tests/before_registration.png' });
  console.log('Saved before_registration.png');
  
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
  
  await page.screenshot({ path: 'tests/after_registration.png' });
  console.log('Saved after_registration.png');
  
  // Verify we redirected successfully away from create page (should go to account dashboard /customer/account/)
  expect(page.url()).not.toContain('/customer/account/create/');
});
