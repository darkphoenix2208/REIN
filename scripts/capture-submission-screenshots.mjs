import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://rein-xgze.onrender.com';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = join(process.cwd(), 'hackathon-screenshots');

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

async function captureAll() {
  console.log('Launching headless Chrome from:', CHROME_PATH);
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // 2x Retina resolution for submission
  });

  // Helper to capture a page
  async function snap(name, path, setupFn) {
    console.log(`Capturing: ${name} (${path})...`);
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      if (setupFn) {
        await setupFn(page);
      }
      const filePath = join(OUT_DIR, name);
      await page.screenshot({ path: filePath });
      console.log(`  ✓ Saved ${name}`);
    } catch (err) {
      console.error(`  ✗ Error capturing ${name}:`, err.message);
    } finally {
      await page.close();
    }
  }

  // 1. Dual-Lane Live Demo (with ticket 2 run)
  await snap('01-dual-lane-demo.png', '/', async (page) => {
    try {
      const t2 = page.locator('button:has-text("2.")');
      if (await t2.count() > 0) {
        await t2.first().click();
        await page.waitForTimeout(500);
      }
      const runBtn = page.locator('button:has-text("Run Both Lanes")');
      if (await runBtn.count() > 0) {
        await runBtn.first().click();
        await page.waitForTimeout(3000);
      }
    } catch (e) {
      console.warn('Could not run ticket 2:', e.message);
    }
  });

  // 2. Buyer-Side Shop & Agent
  await snap('02-buyer-shop-agent.png', '/shop', async (page) => {
    await page.waitForTimeout(1000);
  });

  // 3. Beat the Gate Red-Team Challenge
  await snap('03-beat-the-gate-challenge.png', '/challenge', async (page) => {
    try {
      const quickBtn = page.locator('button:has-text("VIP Override")');
      if (await quickBtn.count() > 0) {
        await quickBtn.first().click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.warn('Could not click quick attack:', e.message);
    }
  });

  // 4. Attack Lab (8 Vectors)
  await snap('04-attack-lab.png', '/attack-lab', async (page) => {
    await page.waitForTimeout(1000);
  });

  // 5. Cryptographic Audit Ledger
  await snap('05-cryptographic-audit-ledger.png', '/ledger', async (page) => {
    await page.waitForTimeout(2000);
  });

  // 6. Ops & Exposure Dashboard
  await snap('06-ops-telemetry-dashboard.png', '/ops', async (page) => {
    await page.waitForTimeout(1500);
  });

  // 7. Cryptographic Verifier (WebCrypto)
  await snap('07-cryptographic-verifier.png', '/verify', async (page) => {
    await page.waitForTimeout(2000);
  });

  // 8. Mandate & Zero-Write Backtest
  await snap('08-mandate-and-backtest.png', '/mandate', async (page) => {
    await page.waitForTimeout(1500);
  });

  // 9. Author Mandate Compiler
  await snap('09-author-mandate-compiler.png', '/author', async (page) => {
    await page.waitForTimeout(1500);
  });

  // 10. Live PayPal Sandbox Proof
  await snap('10-live-paypal-sandbox-proof.png', '/proof', async (page) => {
    await page.waitForTimeout(1500);
  });

  await browser.close();
  console.log('\n✨ All 10 submission screenshots successfully captured into:', OUT_DIR);
}

captureAll().catch((err) => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
