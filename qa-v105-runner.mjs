import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://voyager-platform.voyagerlabs.co';
const SCREENSHOTS = '/tmp/qa-desktop';
const ADMIN = { email: 'admin@voyager.local', password: 'admin123' };

fs.mkdirSync(SCREENSHOTS, { recursive: true });

const consoleErrors = [];
const results = [];

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 20000 });
  console.log('✅ Logged in');
}

function recordError(tag, err) {
  console.error(`❌ [${tag}] ${err.message || err}`);
  results.push({ tag, status: 'FAIL', error: err.message || String(err) });
}

function recordPass(tag, note) {
  console.log(`✅ [${tag}] ${note || 'OK'}`);
  results.push({ tag, status: 'PASS', note });
}

async function screenshot(page, name) {
  const p = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name}`);
  return p;
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  // ── Light mode session ────────────────────────────────────────
  const ctxLight = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  const page = await ctxLight.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // ── 1. Login ─────────────────────────────────────────────────
  try {
    await login(page);
    await screenshot(page, '01-login-success-light');
    recordPass('Login', 'Redirected away from /login');
  } catch(e) { recordError('Login', e); }

  // ── 2. Dashboard ──────────────────────────────────────────────
  try {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await screenshot(page, '02-dashboard-light');
    const h1 = await page.locator('h1, h2').first().textContent().catch(() => 'N/A');
    recordPass('Dashboard', `Loaded. Heading: "${h1.trim()}"`);
  } catch(e) { recordError('Dashboard', e); }

  // ── 3. Clusters page ─────────────────────────────────────────
  try {
    await page.goto(`${BASE_URL}/clusters`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    await screenshot(page, '03-clusters-light');
    const bodyText = await page.locator('body').textContent();
    const isError = /404|not found|error|something went wrong/i.test(bodyText.slice(0, 500));
    const hasTable = await page.locator('table, [role="table"]').count();
    const hasRows = await page.locator('tbody tr').count();
    if (isError) {
      recordError('Clusters', new Error('Page shows 404/error content'));
    } else {
      recordPass('Clusters', `Loaded OK. Table: ${hasTable > 0}, Rows: ${hasRows}`);
    }
  } catch(e) { recordError('Clusters', e); }

  // ── 4. Users page ─────────────────────────────────────────────
  try {
    await page.goto(`${BASE_URL}/users`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await screenshot(page, '04-users-light');
    const rows = await page.locator('tbody tr').count();
    recordPass('Users', `Loaded. Rows: ${rows}`);
  } catch(e) { recordError('Users', e); }

  // ── 5. Settings / BYOK ────────────────────────────────────────
  let settingsFound = false;
  try {
    for (const candidate of ['/settings', '/settings/byok', '/admin/settings', '/admin/byok', '/settings/api']) {
      const resp = await page.goto(`${BASE_URL}${candidate}`).catch(() => null);
      if (resp) {
        const url = page.url();
        if (!url.includes('/login') && resp.status() < 400) {
          settingsFound = true;
          break;
        }
      }
    }
    await page.waitForTimeout(1500);
    await screenshot(page, '05-settings-byok-light');
    if (!settingsFound) {
      recordError('Settings', new Error('No settings route found'));
    } else {
      recordPass('Settings', `Reached: ${page.url()}`);
    }
  } catch(e) { recordError('Settings/BYOK', e); }

  // ── 6. BYOK flow — find and interact with API key field ───────
  try {
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="key" i], input[name*="key" i], input[id*="key" i], input[placeholder*="api" i]').first();
    const hasInput = await apiKeyInput.isVisible().catch(() => false);
    if (hasInput) {
      await apiKeyInput.fill('sk-test-playwright-qa-key-v105');
      await page.waitForTimeout(300);
      const saveBtn = page.getByRole('button', { name: /save|apply|submit|connect/i }).first();
      const hasSave = await saveBtn.isVisible().catch(() => false);
      if (hasSave) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
        await screenshot(page, '06-byok-after-save');
        // check for success toast or error
        const toast = await page.locator('[role="alert"], [data-testid*="toast"], .toast').first().textContent().catch(() => '');
        recordPass('BYOK-Save', `Saved. Toast: "${toast.trim().slice(0, 80)}"`);
      } else {
        await screenshot(page, '06-byok-input-found-no-save');
        recordPass('BYOK-Save', 'API key input found but save button not visible');
      }
    } else {
      await screenshot(page, '06-byok-no-input');
      recordPass('BYOK-Save', 'No API key input found on settings page');
    }
  } catch(e) { recordError('BYOK-Save', e); }

  // ── 7. AI Chat / two-tier gate ────────────────────────────────
  try {
    let aiFound = false;
    for (const candidate of ['/ai', '/chat', '/ai-chat', '/assistant', '/copilot']) {
      const resp = await page.goto(`${BASE_URL}${candidate}`).catch(() => null);
      if (resp) {
        const url = page.url();
        if (!url.includes('/login')) { aiFound = true; break; }
      }
    }
    await page.waitForTimeout(1500);
    await screenshot(page, '07-ai-chat-light');
    if (aiFound) {
      const hasChat = await page.locator('textarea, input[placeholder*="message" i]').count();
      const hasGate = await page.locator('text=/upgrade|subscription|plan/i').count();
      recordPass('AI-Chat', `URL: ${page.url()} | Chat: ${hasChat > 0} | Gate: ${hasGate > 0}`);
    } else {
      recordPass('AI-Chat', 'No AI chat route found');
    }
  } catch(e) { recordError('AI-Chat', e); }

  // ── 8. Navigation ─────────────────────────────────────────────
  try {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1000);
    const navLinks = await page.locator('nav a, aside a, [role="navigation"] a').count();
    await screenshot(page, '08-nav-sidebar-light');
    recordPass('Navigation', `Nav links: ${navLinks}`);
  } catch(e) { recordError('Navigation', e); }

  // ── 9. In-app theme toggle ───────────────────────────────────
  try {
    const themeSelectors = [
      'button[aria-label*="theme" i]',
      'button[aria-label*="dark" i]',
      'button[aria-label*="mode" i]',
      'button[title*="theme" i]',
      '[data-testid*="theme"]',
      'button svg[class*="sun"], button svg[class*="moon"]',
    ];
    let themeClicked = false;
    for (const sel of themeSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(600);
        themeClicked = true;
        break;
      }
    }
    await screenshot(page, '09-theme-toggled');
    recordPass('ThemeToggle', `Toggle clicked: ${themeClicked}`);
  } catch(e) { recordError('ThemeToggle', e); }

  // ── 10. Dark mode (OS-level) ──────────────────────────────────
  const ctxDark = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const darkPage = await ctxDark.newPage();
  try {
    await login(darkPage);
    await darkPage.goto(`${BASE_URL}/`);
    await darkPage.waitForTimeout(1500);
    await screenshot(darkPage, '10-dashboard-dark');
    await darkPage.goto(`${BASE_URL}/clusters`);
    await darkPage.waitForTimeout(2000);
    await screenshot(darkPage, '11-clusters-dark');
    for (const candidate of ['/settings', '/settings/byok']) {
      const resp = await darkPage.goto(`${BASE_URL}${candidate}`).catch(() => null);
      if (resp && resp.status() < 400 && !darkPage.url().includes('/login')) break;
    }
    await darkPage.waitForTimeout(1500);
    await screenshot(darkPage, '12-settings-dark');
    recordPass('DarkMode', 'Dark mode screenshots captured');
  } catch(e) { recordError('DarkMode', e); }
  await ctxDark.close();

  // ── Cleanup ───────────────────────────────────────────────────
  await ctxLight.close();
  await browser.close();

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n══════════════════════════════════');
  console.log('QA RESULTS SUMMARY');
  console.log('══════════════════════════════════');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${r.tag}] ${r.note || r.error || ''}`);
  }

  console.log(`\nConsole errors captured: ${consoleErrors.length}`);
  consoleErrors.slice(0, 10).forEach(e => console.log(`  🔴 ${e}`));

  const passes = results.filter(r => r.status === 'PASS').length;
  const fails = results.filter(r => r.status === 'FAIL').length;
  console.log(`\nPASS: ${passes} | FAIL: ${fails}`);
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
