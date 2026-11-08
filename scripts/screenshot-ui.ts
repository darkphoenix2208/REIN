import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const PAGES = [
  { path: '/', name: 'demo' },
  { path: '/shop', name: 'shop' },
  { path: '/challenge', name: 'challenge' },
  { path: '/attack-lab', name: 'attack-lab' },
  { path: '/ledger', name: 'ledger' },
  { path: '/ops', name: 'ops' },
  { path: '/verify', name: 'verify' },
  { path: '/mandate', name: 'mandate' },
  { path: '/approve/test', name: 'approve' },
  { path: '/proof', name: 'proof' },
  { path: '/author', name: 'author' },
];

const VIEWPORTS = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 390, height: 844, name: 'mobile' },
];

const BASE_URL = process.env.BASE_URL || 'http://localhost:4317';
const OUTPUT_DIR = join(process.cwd(), 'screenshots');

async function main() {
  // Create output directory
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();

  console.log(`📸 Capturing screenshots of ${PAGES.length} pages at ${VIEWPORTS.length} viewports...\n`);

  for (const page of PAGES) {
    for (const viewport of VIEWPORTS) {
      const browserPage = await context.newPage();
      await browserPage.setViewportSize({ width: viewport.width, height: viewport.height });

      try {
        console.log(`  ${page.name} (${viewport.name})...`);
        await browserPage.goto(`${BASE_URL}${page.path}`, { waitUntil: 'networkidle' });

        // Wait a bit for any animations or loading states
        await browserPage.waitForTimeout(500);

        const filename = `${page.name}-${viewport.name}.png`;
        await browserPage.screenshot({
          path: join(OUTPUT_DIR, filename),
          fullPage: true,
        });

        console.log(`    ✓ Saved ${filename}`);
      } catch (error) {
        console.error(`    ✗ Failed to capture ${page.name} (${viewport.name}):`, error);
      } finally {
        await browserPage.close();
      }
    }
  }

  await browser.close();
  console.log(`\n✨ Screenshots saved to ${OUTPUT_DIR}/`);
}

main().catch(console.error);
