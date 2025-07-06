const { chromium } = require('playwright');

async function testPlaywright() {
  console.log('Testing Playwright installation...');
  
  try {
    // Launch browser
    const browser = await chromium.launch({ headless: true });
    console.log('✓ Browser launched successfully');
    
    // Create context
    const context = await browser.newContext();
    console.log('✓ Browser context created');
    
    // Create page
    const page = await context.newPage();
    console.log('✓ Page created');
    
    // Navigate to local server (if running)
    try {
      await page.goto('http://localhost:8660', { timeout: 5000 });
      console.log('✓ Successfully connected to CCO-MCP dashboard');
      
      // Take a screenshot as proof
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await page.screenshot({ path: `recordings/playwright-test-${timestamp}.png` });
      console.log(`✓ Screenshot saved as recordings/playwright-test-${timestamp}.png`);
    } catch (error) {
      console.log('⚠ Could not connect to http://localhost:8660 (server may not be running)');
    }
    
    // Close browser
    await browser.close();
    console.log('✓ Browser closed successfully');
    
    console.log('\n✅ Playwright is working correctly!');
  } catch (error) {
    console.error('❌ Error testing Playwright:', error.message);
    process.exit(1);
  }
}

testPlaywright();