const { chromium } = require('@playwright/test');
const fs = require('fs');

(async() => {
  const base = 'http://voyager-platform.voyagerlabs.co';
  const outDir = '/home/vkzone/.openclaw/workspace-testing/qa-artifacts-mobile-v110';
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();

  const report = { pages: {}, issues: [], consoleErrors: [] };
  page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); });
  page.on('pageerror', err => report.consoleErrors.push('PAGEERROR: '+err.message));

  async function loginIfNeeded() {
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('input[type="email"]', 'admin@voyager.local');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });
    await page.waitForTimeout(1200);
  }

  async function checkPage(name, path) {
    const url = base + path;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
        clientWidth: doc.clientWidth,
        hasOverflow: (document.body ? document.body.scrollWidth : 0) > doc.clientWidth + 2
      };
    });

    const touch = await page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));
      const visible = interactive.filter(el => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
      });
      const tooSmall = visible.filter(el => {
        const r = el.getBoundingClientRect();
        return (r.width < 40 || r.height < 40);
      }).length;
      return { total: visible.length, tooSmall };
    });

    const navWorks = page.url().includes(path);
    const shot = `${outDir}/${name.replace(/\s+/g,'_').toLowerCase()}.png`;
    await page.screenshot({ path: shot, fullPage: true });

    report.pages[name] = { url: page.url(), overflow, touch, navWorks, screenshot: shot };
  }

  try {
    await loginIfNeeded();
    await checkPage('Dashboard', '/');
    await checkPage('Clusters', '/clusters');
    await checkPage('Settings', '/settings');
    await checkPage('Audit', '/audit');
  } catch (e) {
    report.issues.push('Script error: ' + e.message);
  }

  fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
})();