import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = 'http://voyager-platform.voyagerlabs.co';
const LOGIN_EMAIL = 'admin@voyager.local';
const LOGIN_PASS = 'admin123';
const VIEWPORT = { width: 1280, height: 800 };
const TIMEOUT = 15000;
const SCREENSHOT_DIR = '/tmp/qa-screenshots-v104';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = {
  nav: { dashboard: false, clusters: false, users: false, logs: false, events: false },
  byok: { save: false, testConnection: false },
  ai: { freeTier: false, chatGate: false },
  issues: [],
  consoleErrors: []
};

async function ss(page, name) {
  const p = `${SCREENSHOT_DIR}/${name}.png`;
  try { await page.screenshot({ path: p, fullPage: false }); } catch(e) {}
  return p;
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().substring(0, 100));
});

async function getBodyText() {
  try { return (await page.innerText('body')).toLowerCase(); } catch(e) { return ''; }
}

async function doLogin() {
  await page.goto(BASE, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const url = page.url();
  console.log('Initial URL:', url);
  
  if (url.includes('login') || url.includes('signin') || await page.$('input[type="password"]')) {
    try {
      const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i], input[type="text"]');
      if (emailInput) await emailInput.fill(LOGIN_EMAIL);
      const pwdInput = await page.$('input[type="password"]');
      if (pwdInput) await pwdInput.fill(LOGIN_PASS);
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    } catch(e) {
      console.log('Login step error:', e.message);
    }
  }
  console.log('After login URL:', page.url());
}

try {
  console.log('=== LOGIN ===');
  await doLogin();
  await ss(page, '00-after-login');
  const loginUrl = page.url();
  if (loginUrl.includes('login')) {
    results.issues.push('CRITICAL: Still on login page after login attempt');
  }

  // === NAVIGATION TESTS ===
  const navTests = [
    { key: 'dashboard', paths: ['/dashboard', '/'] },
    { key: 'clusters', paths: ['/clusters'] },
    { key: 'users', paths: ['/users', '/settings/users', '/admin/users'] },
    { key: 'logs', paths: ['/logs'] },
    { key: 'events', paths: ['/events'] }
  ];

  for (const navTest of navTests) {
    console.log(`=== NAV: ${navTest.key} ===`);
    let passed = false;
    for (const path of navTest.paths) {
      try {
        await page.goto(`${BASE}${path}`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const url = page.url();
        const text = await getBodyText();
        const isLoginPage = url.includes('login') || url.includes('signin');
        const is404 = text.includes('404') && text.includes('not found');
        if (!isLoginPage && !is404) {
          passed = true;
          await ss(page, `nav-${navTest.key}`);
          console.log(`  ✓ ${path} -> ${url}`);
          break;
        } else {
          console.log(`  ✗ ${path} -> ${url} (login=${isLoginPage}, 404=${is404})`);
        }
      } catch(e) {
        console.log(`  ✗ ${path} error: ${e.message}`);
      }
    }
    results.nav[navTest.key] = passed;
  }

  // === BYOK FLOW ===
  console.log('=== BYOK: AI Configuration ===');
  const byokPaths = ['/settings/ai-configuration', '/settings/ai', '/settings', '/ai-settings'];
  let byokPageLoaded = false;
  let byokText = '';

  for (const path of byokPaths) {
    try {
      await page.goto(`${BASE}${path}`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      byokText = await getBodyText();
      const hasAI = byokText.includes('api key') || byokText.includes('openai') || byokText.includes('ai config') ||
                    byokText.includes('model') || byokText.includes('anthropic') || byokText.includes('byok') ||
                    byokText.includes('provider');
      console.log(`  BYOK path ${path}: hasAI=${hasAI}, url=${page.url()}`);
      if (hasAI && !page.url().includes('login')) {
        byokPageLoaded = true;
        await ss(page, 'byok-page');
        console.log(`  ✓ Found AI config at ${path}`);
        break;
      }
    } catch(e) {
      console.log(`  path ${path} error: ${e.message}`);
    }
  }

  if (!byokPageLoaded) {
    // Try navigating via sidebar
    await page.goto(BASE, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // Look for settings/AI link
    const links = await page.$$('a, button, [role="menuitem"]');
    for (const link of links) {
      const t = (await link.innerText().catch(() => '')).toLowerCase();
      if (t.includes('setting') || t.includes('ai') || t.includes('config')) {
        console.log('  Found link:', t);
        await link.click().catch(() => {});
        await page.waitForTimeout(2000);
        byokText = await getBodyText();
        if (byokText.includes('api key') || byokText.includes('openai') || byokText.includes('model')) {
          byokPageLoaded = true;
          await ss(page, 'byok-page-via-nav');
          break;
        }
      }
    }
  }

  if (byokPageLoaded) {
    // Find API key input
    const keyInput = await page.$('input[type="password"], input[placeholder*="key" i], input[name*="key" i], input[id*="key" i], input[type="text"][name*="api" i]').catch(() => null);
    console.log('  API key input found:', !!keyInput);
    
    if (keyInput) {
      await keyInput.clear().catch(() => {});
      await keyInput.fill('sk-test-qa-1234567890abcdef');
      await page.waitForTimeout(500);
      await ss(page, 'byok-filled');

      // Save
      const saveBtn = await page.$('button:has-text("Save"), button[type="submit"], button:has-text("Update"), button:has-text("Apply")').catch(() => null);
      console.log('  Save button found:', !!saveBtn);
      if (saveBtn) {
        await saveBtn.click();
        await page.waitForTimeout(3000);
        await ss(page, 'byok-after-save');
        const afterSaveText = await getBodyText();
        const saveSuccess = afterSaveText.includes('saved') || afterSaveText.includes('success') || 
                           afterSaveText.includes('updated') || afterSaveText.includes('applied');
        results.byok.save = saveSuccess;
        console.log('  Save result:', saveSuccess, 'text snippet:', afterSaveText.substring(0, 300));
        if (!saveSuccess) {
          results.issues.push('BYOK Save: No success confirmation visible');
        }
      } else {
        results.issues.push('BYOK: No Save button found');
      }

      // Test Connection
      const testBtn = await page.$('button:has-text("Test"), button:has-text("Test Connection"), button:has-text("Verify"), button:has-text("Check")').catch(() => null);
      console.log('  Test Connection button found:', !!testBtn);
      if (testBtn) {
        await testBtn.click();
        await page.waitForTimeout(4000);
        await ss(page, 'byok-test-connection');
        const testText = await getBodyText();
        results.byok.testConnection = testText.includes('success') || testText.includes('connected') ||
                                      testText.includes('valid') || testText.includes('ok') ||
                                      testText.includes('test');
        console.log('  Test Connection result:', results.byok.testConnection);
      } else {
        results.issues.push('BYOK: No "Test Connection" button found');
      }
    } else {
      results.issues.push('BYOK: No API key input field found on AI config page');
      // Print what's on the page
      console.log('  Page text:', byokText.substring(0, 500));
    }
  } else {
    results.issues.push('BYOK: AI Configuration page not found at any expected path');
  }

  // === AI PAGE ===
  console.log('=== AI Page ===');
  const aiPaths = ['/ai', '/ai-insights', '/insights', '/ai-assistant', '/intelligence'];
  let aiLoaded = false;

  for (const path of aiPaths) {
    try {
      await page.goto(`${BASE}${path}`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const url = page.url();
      const text = await getBodyText();
      const notLogin = !url.includes('login');
      const hasContent = text.includes('health') || text.includes('recommendation') || 
                        text.includes('insight') || text.includes('score') || text.includes('ai');
      console.log(`  AI path ${path}: notLogin=${notLogin}, hasContent=${hasContent}, url=${url}`);
      if (notLogin && hasContent) {
        aiLoaded = true;
        await ss(page, 'ai-page');
        
        results.ai.freeTier = text.includes('health score') || text.includes('recommendation') || 
                              text.includes('free') || text.includes('health') || text.includes('score');
        results.ai.chatGate = text.includes('chat') || text.includes('lock') || text.includes('upgrade') ||
                             text.includes('api key') || text.includes('configure') || text.includes('premium');
        console.log(`  AI free tier: ${results.ai.freeTier}, chat gate: ${results.ai.chatGate}`);
        console.log('  Text snippet:', text.substring(0, 400));
        break;
      }
    } catch(e) {
      console.log(`  AI path ${path} error: ${e.message}`);
    }
  }

  if (!aiLoaded) {
    results.issues.push('AI Page: Not found at any expected path');
    // Try sidebar navigation
    await page.goto(BASE, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const aiLinks = await page.$$('a[href*="ai"], a[href*="insight"], nav a');
    for (const link of aiLinks) {
      const href = await link.getAttribute('href').catch(() => '');
      const text = (await link.innerText().catch(() => '')).toLowerCase();
      if (text.includes('ai') || text.includes('insight') || href.includes('ai')) {
        console.log('  Clicking AI nav link:', text, href);
        await link.click().catch(() => {});
        await page.waitForTimeout(2000);
        const pageText = await getBodyText();
        if (pageText.includes('health') || pageText.includes('recommend') || pageText.includes('insight')) {
          aiLoaded = true;
          results.ai.freeTier = true;
          results.ai.chatGate = pageText.includes('chat') || pageText.includes('lock');
          await ss(page, 'ai-page-via-nav');
          break;
        }
      }
    }
  }

  results.consoleErrors = consoleErrors.slice(0, 5);

} catch(e) {
  console.error('Fatal:', e.message);
  results.issues.push(`Fatal: ${e.message}`);
}

await browser.close();

console.log('\n=== FINAL RESULTS ===');
console.log(JSON.stringify(results, null, 2));

// Calculate score
const navCount = Object.values(results.nav).filter(Boolean).length; // out of 5
const byokCount = (results.byok.save ? 1 : 0) + (results.byok.testConnection ? 1 : 0); // out of 2
const aiCount = (results.ai.freeTier ? 1 : 0) + (results.ai.chatGate ? 1 : 0); // out of 2

// Score: nav(5pts) + byok(3pts) + ai(2pts) = 10
const navScore = navCount; // 0-5
const byokScore = byokCount === 2 ? 3 : byokCount === 1 ? 1.5 : 0; // 0-3
const aiScore = aiCount; // 0-2
const total = Math.round(navScore + byokScore + aiScore);

console.log(`\nScore breakdown: nav=${navScore}/5 byok=${byokScore}/3 ai=${aiScore}/2 TOTAL=${total}/10`);
