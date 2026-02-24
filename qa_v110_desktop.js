const { chromium } = require('@playwright/test');
const fs = require('fs');
(async() => {
  const base = 'http://voyager-platform.voyagerlabs.co';
  const outDir = '/home/vkzone/.openclaw/workspace-testing/qa-artifacts-v110-desktop';
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({url: page.url(), text: msg.text()}); });
  page.on('pageerror', err => consoleErrors.push({url: page.url(), text: String(err)}));
  const result = { login:false, pages:{}, consoleErrors };
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'admin@voyager.local', { timeout: 10000 });
    await page.fill('input[type="password"], input[name="password"]', 'admin123', { timeout: 10000 });
    await page.locator('button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in"), button[type="submit"]').first().click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    result.login = !/login|sign-?in/i.test(page.url()) || await page.locator('text=Dashboard').count() > 0;

    async function checkPage(name, path, clues=[]) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const screenshot = `${outDir}/${name}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      const bodyText = await page.locator('body').innerText();
      const has404 = /404|not found/i.test(bodyText);
      const clueHits = clues.filter(c => new RegExp(c,'i').test(bodyText)).length;
      let interactionOk = false;
      const candidates = ['[role="tab"]', 'button:has-text("All")', 'button'];
      for (const sel of candidates) {
        const loc = page.locator(sel).first();
        if (await loc.count()) {
          try { await loc.click({ timeout: 2000 }); interactionOk = true; break; } catch {}
        }
      }
      result.pages[name] = { url: page.url(), screenshot, has404, clueHits, interactionOk };
    }

    await checkPage('dashboard','/dashboard',['dashboard','clusters','nodes']);
    await checkPage('clusters','/clusters',['clusters','cluster','status']);
    await checkPage('settings','/settings',['settings','preferences','users','config']);
    await checkPage('audit','/audit',['audit','events','activity','log']);
  } catch (e) {
    result.fatal = String(e);
  }
  await browser.close();
  fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(result,null,2));
  console.log(`${outDir}/report.json`);
})();
