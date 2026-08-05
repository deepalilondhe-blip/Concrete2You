const { test, expect } = require('@playwright/test');

test('Authenticate and save session state', async ({ page }) => {
  console.log('Navigating directly to login page...');
  await page.goto('/customer/account/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  
  // 1. Handle Cookie popup
  const cookieBtn = page.locator('#onetrust-accept-btn-handler');
  if (await cookieBtn.isVisible()) {
    console.log('Accepting cookies...');
    await cookieBtn.click();
    await page.waitForTimeout(2000);
  }
  
  // 2. Fill login details
  console.log('Filling in credentials...');
  await page.fill('#email', 'ilfas.mansuri+10@bytestechnolab.com');
  await page.fill('#pass', 'Smart@123');
  
  // 3. User action warning
  console.log('\n======================================================');
  console.log('⚠️ Please solve the CAPTCHA challenge in the headed browser window.');
  console.log('Once solved, the script will automatically submit and save the session.');
  console.log('======================================================\n');
  
  // Wait for the user to solve the Turnstile challenge and for the email input/form to submit successfully
  await page.click('#send2');
  
  // Wait for the URL to change to the customer account dashboard (indicating success)
  await page.waitForURL('**/customer/account/', { timeout: 120000 });
  console.log('✅ Logged in successfully!');
  
  // Save storage state to a file
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
  console.log('Saved authentication state to playwright/.auth/user.json');
});
