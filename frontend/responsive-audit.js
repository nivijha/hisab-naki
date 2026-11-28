const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// Connect to existing dev server
const BASE_URL = 'http://localhost:3000';

async function runPlaywrightTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Test viewports
  const viewports = [
    { name: 'Small mobile', width: 320, height: 568 },
    { name: 'Standard mobile', width: 360, height: 800 },
    { name: 'Large mobile', width: 390, height: 844 },
    { name: 'Large mobile', width: 430, height: 932 },
    { name: 'Small tablet', width: 600, height: 960 },
    { name: 'Tablet portrait', width: 768, height: 1024 },
    { name: 'Tablet landscape', width: 1024, height: 768 },
    { name: 'Small laptop', width: 1280, height: 720 },
    { name: 'Standard desktop', width: 1440, height: 900 },
    { name: 'Large desktop', width: 1920, height: 1080 },
  ];

  const pages = [
    { path: '/', name: 'Landing page' },
    { path: '/login', name: 'Login' },
    { path: '/signup', name: 'Signup' },
    { path: '/business/select', name: 'Business select' },
    { path: '/dashboard', name: 'Dashboard' },
    { path: '/customers', name: 'Customers' },
    { path: '/transactions', name: 'Transactions' },
    { path: '/profile', name: 'Profile' },
  ];

  const results = [];

  for (const viewport of viewports) {
    console.log(`\n=== Testing ${viewport.name} (${viewport.width}x${viewport.height}) ===`);
    
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    
    for (const testPage of pages) {
      try {
        const url = `${BASE_URL}${testPage.path}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        
        // Check for horizontal overflow
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        
        const bodyOverflow = await page.evaluate(() => {
          return document.body.scrollWidth > document.body.clientWidth;
        });
        
        // Check for content overflow
        const contentOverflow = await page.evaluate(() => {
          const elements = document.querySelectorAll('*');
          let overflowElements = [];
          elements.forEach(el => {
            if (el.scrollWidth > el.clientWidth) {
              overflowElements.push({
                tag: el.tagName,
                class: el.className,
                id: el.id,
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                overflow: el.scrollWidth - el.clientWidth
              });
            }
          });
          return overflowElements;
        });
        
        const hasOverflow = overflow || bodyOverflow || contentOverflow.length > 0;
        
        // Take screenshot
        const screenshotPath = `screenshots/${testPage.name.replace(/\s+/g, '-').toLowerCase()}-${viewport.name.replace(/\s+/g, '-').toLowerCase()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        const status = hasOverflow ? 'FAIL' : 'PASS';
        console.log(`  ${status} ${testPage.name}: ${hasOverflow ? 'Horizontal overflow detected' : 'OK'}`);
        
        if (hasOverflow) {
          console.log(`    Document overflow: ${overflow}, Body overflow: ${bodyOverflow}`);
          if (contentOverflow.length > 0) {
            console.log(`    Overflow elements: ${contentOverflow.length}`);
            contentOverflow.slice(0, 5).forEach(el => {
              console.log(`      - ${el.tag}${el.id ? '#' + el.id : ''}${el.class ? '.' + el.class.split(' ')[0] : ''}: ${el.overflow}px overflow`);
            });
          }
        }
        
        results.push({
          viewport: viewport.name,
          page: testPage.name,
          status,
          overflow,
          bodyOverflow,
          overflowCount: contentOverflow.length,
          screenshot: screenshotPath
        });
        
      } catch (error) {
        console.log(`  ERROR ${testPage.name}: ${error.message}`);
        results.push({
          viewport: viewport.name,
          page: testPage.name,
          status: 'ERROR',
          error: error.message
        });
      }
    }
  }
  
  // Save results
  fs.writeFileSync('responsive-audit-results.json', JSON.stringify(results, null, 2));
  
  // Print summary
  console.log('\n=== SUMMARY ===');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const error = results.filter(r => r.status === 'ERROR').length;
  console.log(`Total tests: ${results.length}`);
  console.log(`PASS: ${pass}`);
  console.log(`FAIL: ${fail}`);
  console.log(`ERROR: ${error}`);
  
  console.log('\nFailed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.viewport} / ${r.page}`);
  });
  
  // Print detailed by viewport
  console.log('\n=== BY VIEWPORT ===');
  viewports.forEach(vp => {
    const vpResults = results.filter(r => r.viewport === vp.name);
    const vpFail = vpResults.filter(r => r.status === 'FAIL').length;
    const vpError = vpResults.filter(r => r.status === 'ERROR').length;
    const vpPass = vpResults.filter(r => r.status === 'PASS').length;
    console.log(`  ${vp.name} (${vp.width}x${vp.height}): PASS=${vpPass}, FAIL=${vpFail}, ERROR=${vpError}`);
  });
  
  await browser.close();
  
  process.exit(fail > 0 ? 1 : 0);
}

// Create screenshots directory
if (!fs.existsSync('screenshots')) {
  fs.mkdirSync('screenshots', { recursive: true });
}

runPlaywrightTests().catch(err => {
  console.error(err);
  process.exit(1);
});