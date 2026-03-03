import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = 'http://voyager-platform.voyagerlabs.co';
const LOGIN_EMAIL = 'admin@voyager.local';
const LOGIN_PASS = 'admin123';
const VIEWPORT = { width: 1280, height: 800 };
const TIMEOUT = 15000;
const SCREENSHOT_DIR = '/tmp/qa-screenshots-v104';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();

async function getBodyText() {
  try { return (await page.innerText('body')).toLowerCase(); } catch(e) { return ''; }
}
async function ss(name) {
  try { await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false }); } catch(e) {}
}

// Login
await page.goto(BASE, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().includes('login')) {
  await page.fill('input[type="email"], input[type="text"]', LOGIN_EMAIL);
  await page.fill('input[type="password"]', LOGIN_PASS);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
console.log('Logged in, URL:', page.url());

// === BYOK: /settings ===
console.log('\n=== BYOK FLOW ===');
await page.goto(`${BASE}/settings`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await ss('byok-settings-page');
const settingsText = await getBodyText();
console.log('Settings page text (first 500):', settingsText.substring(0, 500));

// Use locator API for reliable interaction
const apiKeyLocator = page.locator('input[type="password"], input[placeholder*="key" i], input[name*="key" i], input[id*="key" i]').first();
const hasApiInput = await apiKeyLocator.count() > 0;
console.log('API key input count:', await apiKeyLocator.count());

// List all inputs on the page
const allInputs = await page.$$('input, textarea, select');
console.log('All inputs count:', allInputs.length);
for (const inp of allInputs) {
  const type = await inp.getAttribute('type').catch(() => 'text');
  const name = await inp.getAttribute('name').catch(() => '');
  const placeholder = await inp.getAttribute('placeholder').catch(() => '');
  const id = await inp.getAttribute('id').catch(() => '');
  console.log(`  Input: type=${type} name=${name} placeholder=${placeholder} id=${id}`);
}

// List buttons
const allBtns = await page.$$('button');
console.log('Buttons on settings page:');
for (const btn of allBtns.slice(0, 20)) {
  const text = await btn.innerText().catch(() => '');
  if (text.trim()) console.log(`  Button: "${text.trim()}"`);
}

// BYOK Save test
let byokSave = false;
let byokTest = false;

if (hasApiInput) {
  await apiKeyLocator.fill('sk-test-qa-1234567890abcdef');
  await page.waitForTimeout(500);
  await ss('byok-filled');
  
  // Find and click save
  const saveLocator = page.locator('button:has-text("Save"), button[type="submit"], button:has-text("Update"), button:has-text("Apply")').first();
  if (await saveLocator.count() > 0) {
    await saveLocator.click();
    await page.waitForTimeout(3000);
    await ss('byok-after-save');
    const afterText = await getBodyText();
    // Check for toast/success
    byokSave = afterText.includes('saved') || afterText.includes('success') || 
               afterText.includes('updated') || afterText.includes('applied') ||
               afterText.includes('configuration saved') || afterText.includes('settings saved');
    console.log('\nAfter save text (300 chars):', afterText.substring(0, 300));
    console.log('BYOK Save:', byokSave);
    
    // Check for toast notification (might be in a different element)
    const toastText = await page.locator('[role="alert"], [class*="toast"], [class*="notification"], [class*="snack"]').allInnerTexts().catch(() => []);
    console.log('Toast texts:', toastText);
    if (toastText.some(t => t.toLowerCase().includes('saved') || t.toLowerCase().includes('success'))) {
      byokSave = true;
    }
  }
  
  // Test connection button
  const testLocator = page.locator('button:has-text("Test"), button:has-text("Test Connection"), button:has-text("Verify"), button:has-text("Check Connection")').first();
  if (await testLocator.count() > 0) {
    await testLocator.click();
    await page.waitForTimeout(4000);
    await ss('byok-test-result');
    const testText = await getBodyText();
    byokTest = testText.includes('success') || testText.includes('connected') || testText.includes('valid');
    const toastTest = await page.locator('[role="alert"], [class*="toast"], [class*="notification"]').allInnerTexts().catch(() => []);
    console.log('Test connection toasts:', toastTest);
    if (toastTest.some(t => t.toLowerCase().includes('success') || t.toLowerCase().includes('connect') || t.toLowerCase().includes('valid'))) {
      byokTest = true;
    }
    console.log('BYOK Test Connection:', byokTest);
  } else {
    console.log('No Test Connection button found');
  }
} else {
  console.log('No API key input — checking settings sub-navigation');
  // Look for AI configuration sub-section link
  const aiSubLinks = await page.$$('a, button, [role="tab"]');
  for (const link of aiSubLinks) {
    const t = (await link.innerText().catch(() => '')).toLowerCase();
    if (t.includes('ai') || t.includes('config') || t.includes('intelligence') || t.includes('openai')) {
      console.log('Clicking sub-link:', t);
      await link.click().catch(() => {});
      await page.waitForTimeout(2000);
      await ss('byok-sub-nav');
      const newText = await getBodyText();
      console.log('After sub-nav:', newText.substring(0, 300));
      const hasInput = await page.locator('input[type="password"], input[placeholder*="key" i]').count();
      if (hasInput > 0) {
        console.log('Found API key input after sub-nav!');
        break;
      }
    }
  }
}

// === AI PAGE ===
console.log('\n=== AI PAGE ===');
const aiPaths = ['/ai', '/ai-insights', '/insights', '/ai-assistant', '/intelligence', '/analytics'];
let aiPageFound = false;
let aiFreeTier = false;
let aiChatGate = false;

for (const path of aiPaths) {
  await page.goto(`${BASE}${path}`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const url = page.url();
  const text = await getBodyText();
  const isLogin = url.includes('login');
  const hasContent = text.includes('health') || text.includes('recommend') || text.includes('score') ||
                     text.includes('insight') || text.includes('ai') || text.includes('cluster health');
  console.log(`AI ${path}: isLogin=${isLogin}, hasContent=${hasContent}, url=${url}`);
  if (!isLogin && hasContent) {
    aiPageFound = true;
    await ss('ai-page');
    console.log('AI page text (400):', text.substring(0, 400));
    aiFreeTier = text.includes('health score') || text.includes('recommendation') || 
                 text.includes('free') || text.includes('health') || text.includes('score') ||
                 text.includes('insight');
    aiChatGate = text.includes('chat') || text.includes('lock') || text.includes('upgrade') ||
                text.includes('api key required') || text.includes('configure') || text.includes('premium');
    break;
  }
}

if (!aiPageFound) {
  // Check sidebar for AI link
  await page.goto(BASE, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const allLinks = await page.$$('a');
  console.log('\nAll nav links:');
  for (const link of allLinks) {
    const href = await link.getAttribute('href').catch(() => '');
    const text = (await link.innerText().catch(() => '')).trim();
    if (text) console.log(`  ${text} -> ${href}`);
  }
}

await browser.close();

console.log('\n=== FINAL RESULTS ===');
console.log(JSON.stringify({ byokSave, byokTest, aiFreeTier, aiChatGate, aiPageFound }, null, 2));
