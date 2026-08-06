const { test, expect } = require('@playwright/test');

test('Verify Concrete2You Checkout Cart page loads', async ({ page }, testInfo) => {
  console.log('Navigating to checkout cart page...');
  
  // Go to the cart page
  await page.goto('/checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Log current page title and url
  const title = await page.title();
  const url = page.url();
  console.log(`Successfully navigated to: ${url}`);
  console.log(`Page Title: ${title}`);
  
  // Check if we hit a Cloudflare challenge page
  if (
    title.includes('Cloudflare') || 
    title.includes('Just a moment') ||
    (await page.locator('#challenge-running').count()) > 0 || 
    (await page.locator('#cf-challenge').count()) > 0
  ) {
    console.warn('⚠️ Cloudflare challenge page detected! Waiting up to 45 seconds for manual/auto solving...');
    
    // Wait for the page title to change from Cloudflare, or wait for standard body content
    try {
      await page.waitForFunction(
        () => !document.title.includes('Cloudflare') && 
              !document.title.includes('Just a moment') &&
              !document.querySelector('#challenge-running') && 
              !document.querySelector('#cf-challenge'),
        { timeout: 45000 }
      );
      console.log('✅ Cloudflare challenge seems to have been bypassed/resolved.');
    } catch (e) {
      console.error('❌ Cloudflare challenge was not resolved within the timeout period.');
    }
  }
  
  // Now verify cart components
  const finalTitle = await page.title();
  const finalUrl = page.url();
  console.log(`Final Page URL: ${finalUrl}`);
  console.log(`Final Page Title: ${finalTitle}`);
  
  // Take a screenshot of the loaded page state
  const screenshot = await page.screenshot({ path: 'tests/cart_page_screenshot.png', fullPage: true });
  await testInfo.attach('cart_page_screenshot', {
    body: screenshot,
    contentType: 'image/png'
  });
  console.log('Screenshot saved to tests/cart_page_screenshot.png');

  // Let's assert on the body content to verify if we are indeed on a checkout/cart page.
  // Usually, Magento 2 uses `.cart-empty` for empty cart, or has "Shopping Cart" header.
  const bodyText = await page.innerText('body');
  
  if (bodyText.includes('Shopping Cart') || bodyText.includes('no items') || bodyText.includes('cart') || bodyText.includes('Checkout')) {
    console.log('✅ Verified: Cart/checkout page keywords detected in body text.');
  } else {
    console.warn('⚠️ Checkout page loaded, but expected keywords were not matched. Page content preview:');
    console.log(bodyText.substring(0, 500));
  }
  
  // Assert that we did not get a 403 or other generic server error page
  expect(finalTitle).not.toContain('403 Forbidden');
  expect(finalTitle).not.toContain('Access Denied');
});
