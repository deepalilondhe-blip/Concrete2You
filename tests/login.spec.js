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
    
    // Check if the Turnstile checkbox iframe is visible on the screen
    const iframeSelector = 'iframe[src*="challenges.cloudflare.com"]';
    const iframe = page.locator(iframeSelector);
    if (await iframe.isVisible()) {
      console.log('Turnstile iframe detected. Getting bounding box...');
      const box = await iframe.boundingBox();
      if (box) {
        console.log(`Iframe location: X=${box.x}, Y=${box.y}, W=${box.width}, H=${box.height}`);
        const clickX = box.x + 35;
        const clickY = box.y + box.height / 2;
        console.log(`Simulating mouse click on Turnstile checkbox at X=${clickX}, Y=${clickY}...`);
        
        await page.mouse.move(clickX, clickY, { steps: 10 });
        await page.waitForTimeout(500);
        await page.mouse.click(clickX, clickY);
        console.log('Clicked. Waiting 8 seconds for verification to clear...');
        await page.waitForTimeout(8000);
      }
    } else {
      console.log('Turnstile iframe not visible yet. Waiting 5 seconds...');
      await page.waitForTimeout(5000);
    }
    
    title = await page.title();
    attempts++;
  }
}

test('Login to Concrete2You', async ({ page }) => {
  console.log('Navigating to checkout cart page...');
  await page.goto('/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  await handleCloudflare(page, 'Cart page');
  
  // 1. Handle OneTrust cookie popup on cart page
  const cookieBtn = page.locator('#onetrust-accept-btn-handler');
  if (await cookieBtn.isVisible()) {
    console.log('Accepting cookies on Cart page...');
    await cookieBtn.click();
    await page.waitForTimeout(2000);
  }
  
  // 2. Click Account icon
  console.log('Clicking on Account link...');
  await page.click('a.my-account-link');
  await page.waitForTimeout(3000);
  
  let currentUrl = page.url();
  console.log(`Current URL after clicking Account: ${currentUrl}`);
  
  if (!currentUrl.includes('/customer/account/login/')) {
    const signInLink = page.locator('a:has-text("Sign In")').first();
    if (await signInLink.isVisible()) {
      console.log('Clicking Sign In dropdown...');
      await signInLink.click();
      await page.waitForTimeout(3000);
    } else {
      console.log('Navigating directly to login page...');
      await page.goto('/customer/account/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
  }
  
  // Handle Cloudflare challenge on login page if present
  await handleCloudflare(page, 'Login page');
  console.log(`Login page Title after challenge checks: "${await page.title()}"`);
  
  // 3. Handle Cookie popup on login page if visible
  if (await cookieBtn.isVisible()) {
    console.log('Accepting cookies on Login page...');
    await cookieBtn.click();
    await page.waitForTimeout(2000);
  }
  
  // 4. Fill credentials
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
  
  await page.screenshot({ path: 'tests/before_login.png' });
  console.log('Saved before_login.png');
  
  // 5. Submit login form
  console.log('Submitting login form...');
  await page.click('#send2');
  
  await page.waitForTimeout(7000);
  await handleCloudflare(page, 'Post-Login Page');
  
  console.log(`Post-login URL: ${page.url()}`);
  console.log(`Post-login Title: "${await page.title()}"`);
  
  await page.screenshot({ path: 'tests/after_login.png' });
  console.log('Saved after_login.png');
  
  // Assert that we have logged in successfully
  expect(page.url()).not.toContain('/customer/account/login/');
});
