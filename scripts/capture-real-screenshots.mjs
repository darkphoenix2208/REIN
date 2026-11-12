import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://rein-xgze.onrender.com';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = join(process.cwd(), 'docs', 'assets', 'screenshots');

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

async function capture() {
  console.log('Launching Chrome from:', CHROME_PATH);
  const browser = await chromium.launch({ executablePath: CHROME_PATH });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // HiDPI / Retina quality screenshots
  });

  // 1. Dual Lane Demo with active evaluation
  console.log('1. Capturing Dual-Lane Live Demo...');
  const page1 = await context.newPage();
  await page1.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  await page1.waitForTimeout(1000);
  
  // Select Ticket 2 (Prompt injection)
  try {
    const t2 = page1.locator('button:has-text("2.")');
    if (await t2.count() > 0) {
      await t2.first().click();
      await page1.waitForTimeout(500);
    }
    const runBtn = page1.locator('button:has-text("Run Both Lanes")');
    if (await runBtn.count() > 0) {
      await runBtn.first().click();
      await page1.waitForTimeout(2500);
    }
  } catch (err) {
    console.warn('Could not trigger ticket run:', err.message);
  }
  await page1.screenshot({ path: join(OUT_DIR, 'rein-dual-lane-demo.png') });
  await page1.close();
  console.log('✓ Saved rein-dual-lane-demo.png');

  // 2. Audit Ledger
  console.log('2. Capturing Cryptographic Audit Ledger...');
  const page2 = await context.newPage();
  await page2.goto(BASE_URL + '/ledger', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(2000);
  await page2.screenshot({ path: join(OUT_DIR, 'rein-audit-ledger.png') });
  await page2.close();
  console.log('✓ Saved rein-audit-ledger.png');

  // 3. Beat the Gate Challenge
  console.log('3. Capturing Beat the Gate Challenge...');
  const page3 = await context.newPage();
  await page3.goto(BASE_URL + '/challenge', { waitUntil: 'networkidle' });
  await page3.waitForTimeout(1500);
  await page3.screenshot({ path: join(OUT_DIR, 'rein-beat-the-gate.png') });
  await page3.close();
  console.log('✓ Saved rein-beat-the-gate.png');

  // 4. Ops Dashboard
  console.log('4. Capturing Ops & Exposure Dashboard...');
  const page4 = await context.newPage();
  await page4.goto(BASE_URL + '/ops', { waitUntil: 'networkidle' });
  await page4.waitForTimeout(1500);
  await page4.screenshot({ path: join(OUT_DIR, 'rein-ops-telemetry.png') });
  await page4.close();
  console.log('✓ Saved rein-ops-telemetry.png');

  // 5. In-Browser Cryptographic Verifier
  console.log('5. Capturing Cryptographic Verifier...');
  const page5 = await context.newPage();
  await page5.goto(BASE_URL + '/verify', { waitUntil: 'networkidle' });
  await page5.waitForTimeout(1500);
  await page5.screenshot({ path: join(OUT_DIR, 'rein-cryptographic-verifier.png') });
  await page5.close();
  console.log('✓ Saved rein-cryptographic-verifier.png');

  await browser.close();
  console.log('✨ All 5 real live screenshots successfully captured!');
}

capture().catch((err) => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
