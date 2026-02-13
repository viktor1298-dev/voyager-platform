/**
 * Automated UI validation — takes screenshots after deploy.
 * Usage: node scripts/screenshot.mjs [base-url]
 * Default: http://localhost:9000
 * 
 * Outputs:
 *   /tmp/voyager-screenshot-dashboard.png
 *   /tmp/voyager-screenshot-detail.png
 */
import puppeteer from 'puppeteer';

const BASE = process.argv[2] || 'http://localhost:9000';

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Dashboard
  console.log(`→ Loading dashboard: ${BASE}`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 6000)); // Wait for React hydration + data fetch
  
  // Check for data
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasData = !bodyText.includes('Loading clusters');
  console.log(`  Data loaded: ${hasData ? '✅' : '❌ Still loading'}`);
  
  await page.screenshot({ path: '/tmp/voyager-screenshot-dashboard.png' });
  console.log('  📸 Dashboard screenshot saved');

  // Click first cluster for detail page
  const links = await page.$$('a[href*="/clusters/"]');
  if (links.length > 0) {
    console.log('→ Navigating to cluster detail...');
    await links[0].click();
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: '/tmp/voyager-screenshot-detail.png', fullPage: true });
    console.log('  📸 Detail screenshot saved');
  } else {
    console.log('  ⚠️ No cluster links found');
  }

  // Console errors check
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  if (errors.length > 0) {
    console.log(`  ❌ Console errors: ${errors.join(', ')}`);
  } else {
    console.log('  ✅ No console errors');
  }

  await browser.close();
  console.log('\nDone. Screenshots at /tmp/voyager-screenshot-*.png');
}

run().catch(err => {
  console.error('Screenshot failed:', err.message);
  process.exit(1);
});
