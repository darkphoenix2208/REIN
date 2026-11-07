import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { decidePurchase } from '../server/policy.ts';
import { checkPurchase } from '../server/dispatch.ts';
import { runPurchase, runPriceMatch, runShoppingLoop } from '../server/gate.ts';
import { createApp } from '../server/app.ts';
import { parseMandate } from '../server/config.ts';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { RECORDED_CATALOG, type Channel3Client } from '../server/channel3.ts';
import { verifyChain } from '../server/ledger.ts';

const MANDATE_JSON = {
  schema_version: 1,
  perActionCapCents: 5000,
  hardMaxCents: 20000,
  dailyCapCents: 20000,
  hardDailyCapCents: 40000,
  expiresAt: '2099-01-01T00:00:00Z',
};

const tempDb = async (driver: 'better-sqlite3' | 'node:sqlite' = 'better-sqlite3') => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-shop-test-')), 't.db');
  const db = await openDb(path, { driver });
  applySchema(db);
  return { db, close: () => db.close() };
};

const startServer = async (app: any) => {
  const srv = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => srv.once('listening', resolve));
  const addr = srv.address() as any;
  return { server: srv, base: `http://127.0.0.1:${addr.port}` };
};

const baseMandate = parseMandate({
  ...MANDATE_JSON,
  perPurchaseCapCents: 5000, // $50 max auto-purchase
  agentDailyBudgetCents: 15000, // $150 daily budget
  purchaseHardMaxCents: 20000, // $200 hard cap
  productBlocklist: ['crypto', 'gift_cards'],
});

describe('Pure policy: decidePurchase', () => {
  const now = Date.now();

  test('blocks expired mandate', () => {
    const d = decidePurchase('prod-mug', 1800, 'kitchen', baseMandate, {
      amountCents: 1800,
      agentDailySpendCents: 0,
      productId: 'prod-mug',
      productCategory: 'kitchen',
      now: baseMandate.expiresAt + 1000,
    });
    assert.equal(d.status, 'blocked');
    assert.equal(d.ruleId, 'R-MANDATE-EXPIRED');
  });

  test('blocks invalid non-positive or non-integer amount', () => {
    const d1 = decidePurchase('prod-mug', 0, 'kitchen', baseMandate, {
      amountCents: 0,
      agentDailySpendCents: 0,
      productId: 'prod-mug',
      now,
    });
    assert.equal(d1.status, 'blocked');
    assert.equal(d1.ruleId, 'R-INVALID');

    const d2 = decidePurchase('prod-mug', 12.5, 'kitchen', baseMandate, {
      amountCents: 12.5,
      agentDailySpendCents: 0,
      productId: 'prod-mug',
      now,
    });
    assert.equal(d2.status, 'blocked');
    assert.equal(d2.ruleId, 'R-INVALID');
  });

  test('escalates on product lookup failure (fail-closed, never allows)', () => {
    const d = decidePurchase('prod-unknown', 2000, undefined, baseMandate, {
      amountCents: 2000,
      agentDailySpendCents: 0,
      productId: 'prod-unknown',
      lookupFailed: true,
      now,
    });
    assert.equal(d.status, 'pending_approval');
    assert.equal(d.ruleId, 'R-PRODUCT-LOOKUP-FAILED');
  });

  test('blocks items on product blocklist', () => {
    const d1 = decidePurchase('prod-crypto', 15000, 'crypto', baseMandate, {
      amountCents: 15000,
      agentDailySpendCents: 0,
      productId: 'prod-crypto',
      productCategory: 'crypto',
      now,
    });
    assert.equal(d1.status, 'blocked');
    assert.equal(d1.ruleId, 'R-PRODUCT-BLOCKLIST');

    const d2 = decidePurchase('prod-giftcard', 5000, 'gift_cards', baseMandate, {
      amountCents: 5000,
      agentDailySpendCents: 0,
      productId: 'prod-giftcard',
      productCategory: 'gift_cards',
      now,
    });
    assert.equal(d2.status, 'blocked');
    assert.equal(d2.ruleId, 'R-PRODUCT-BLOCKLIST');
  });

  test('blocks items not in allowlist when allowlist is configured', () => {
    const allowMandate = {
      ...baseMandate,
      productAllowlist: ['kitchen', 'office'],
    };
    const dBlocked = decidePurchase('prod-gaming', 2000, 'games', allowMandate, {
      amountCents: 2000,
      agentDailySpendCents: 0,
      productId: 'prod-gaming',
      productCategory: 'games',
      now,
    });
    assert.equal(dBlocked.status, 'blocked');
    assert.equal(dBlocked.ruleId, 'R-PRODUCT-ALLOWLIST');

    const dAllowed = decidePurchase('prod-mug', 1800, 'kitchen', allowMandate, {
      amountCents: 1800,
      agentDailySpendCents: 0,
      productId: 'prod-mug',
      productCategory: 'kitchen',
      now,
    });
    assert.equal(dAllowed.status, 'allowed');
  });

  test('blocks purchase exceeding hard max', () => {
    const d = decidePurchase('prod-desk', 25000, 'furniture', baseMandate, {
      amountCents: 25000,
      agentDailySpendCents: 0,
      productId: 'prod-desk',
      productCategory: 'furniture',
      now,
    });
    assert.equal(d.status, 'blocked');
    assert.equal(d.ruleId, 'R-PURCHASE-HARD-MAX');
  });

  test('blocks purchase exceeding agent daily budget', () => {
    const d = decidePurchase('prod-chair', 12000, 'furniture', baseMandate, {
      amountCents: 12000,
      agentDailySpendCents: 5000, // 5000 + 12000 = 17000 > 15000
      productId: 'prod-chair',
      productCategory: 'furniture',
      now,
    });
    assert.equal(d.status, 'blocked');
    assert.equal(d.ruleId, 'R-AGENT-BUDGET');
  });

  test('escalates purchase exceeding per-purchase cap to pending_approval', () => {
    const d = decidePurchase('prod-chair', 7500, 'furniture', baseMandate, {
      amountCents: 7500, // 7500 > 5000 cap
      agentDailySpendCents: 0,
      productId: 'prod-chair',
      productCategory: 'furniture',
      now,
    });
    assert.equal(d.status, 'pending_approval');
    assert.equal(d.ruleId, 'R-PURCHASE-CAP');
  });

  test('human approval waives per-purchase threshold', () => {
    const d = decidePurchase('prod-chair', 7500, 'furniture', baseMandate, {
      amountCents: 7500,
      agentDailySpendCents: 0,
      productId: 'prod-chair',
      productCategory: 'furniture',
      approved: true,
      now,
    });
    assert.equal(d.status, 'allowed');
    assert.equal(d.ruleId, 'R-APPROVED');
  });

  test('allows normal purchase under cap and budget', () => {
    const d = decidePurchase('prod-mug', 1800, 'kitchen', baseMandate, {
      amountCents: 1800,
      agentDailySpendCents: 2000,
      productId: 'prod-mug',
      productCategory: 'kitchen',
      now,
    });
    assert.equal(d.status, 'allowed');
    assert.equal(d.ruleId, 'R-ALLOW');
  });
});

for (const driver of ['better-sqlite3', 'node:sqlite'] as const) {
  describe(`Gate execution & loop (${driver})`, () => {
    test('runPurchase allows under cap, creates order, and updates ledger', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const out = await runPurchase({ db, mandate: baseMandate, paypal: null }, {
          productId: 'prod-mug',
          qty: 1,
          sessionId: 'agent-session-1',
          agentId: 'buyer-agent',
        });

        assert.equal(out.status, 'executed');
        assert.equal(out.ruleId, 'R-ALLOW');
        assert.equal(out.amountCents, 1800);
        assert.ok(out.orderId);
        assert.ok(out.captureId);

        // Verify order items exist in DB
        const pay = db.one<{ captured_cents: number }>('SELECT captured_cents FROM payments WHERE txn_id=?', out.captureId);
        assert.equal(pay?.captured_cents, 1800);

        const item = db.one<{ item_id: string; unit_cents: number }>('SELECT item_id, unit_cents FROM order_items WHERE order_id=?', out.orderId);
        assert.equal(item?.item_id, 'prod-mug');
        assert.equal(item?.unit_cents, 1800);

        // Verify hash chain
        const chain = verifyChain(db);
        assert.equal(chain.ok, true);
      } finally {
        close();
      }
    });

    test('runPurchase escalates above per-purchase cap and generates approval token', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const out = await runPurchase({ db, mandate: baseMandate, paypal: null }, {
          productId: 'prod-chair', // $120.00 > $50.00 cap
          qty: 1,
          sessionId: 'agent-session-2',
        });

        assert.equal(out.status, 'pending_approval');
        assert.equal(out.ruleId, 'R-PURCHASE-CAP');
        assert.ok(out.approvalUrl);

        // DB action status is pending_approval
        const act = db.one<{ status: string }>('SELECT status FROM actions WHERE id=?', out.actionId);
        assert.equal(act?.status, 'pending_approval');
      } finally {
        close();
      }
    });

    test('injected Channel3Client supports custom catalogs and live price checks', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const fakeClient: Channel3Client = {
          async searchProducts(q) {
            return [{
              id: 'custom-widget',
              name: 'Custom Injected Widget',
              description: 'A special test widget',
              priceCents: 2500,
              currency: 'USD',
              category: 'hardware',
              inStock: true,
            }];
          },
          async getProduct(id) {
            if (id === 'custom-widget') {
              return {
                id: 'custom-widget',
                name: 'Custom Injected Widget',
                description: 'A special test widget',
                priceCents: 2500,
                currency: 'USD',
                category: 'hardware',
                inStock: true,
                competitors: [{ store: 'DiscountCo', priceCents: 2000, url: 'https://example.com' }],
              };
            }
            return null;
          },
          async getSimilarProducts() {
            return [];
          },
          async checkPrice(itemId, ourPriceCents) {
            return {
              itemId,
              captureId: 'CAP-TEST',
              ourPriceCents,
              marketPriceCents: 2000,
              anomaly: true,
              source: 'live',
            };
          },
        };

        const out = await runPurchase({ db, mandate: baseMandate, paypal: null }, {
          productId: 'custom-widget',
          qty: 1,
          channel3Client: fakeClient,
        });

        assert.equal(out.status, 'executed');
        assert.equal(out.amountCents, 2500);

        // Run price match with injected client
        const pm = await runPriceMatch({ db, mandate: baseMandate, paypal: null }, {
          captureId: out.captureId!,
          itemId: 'custom-widget',
          client: fakeClient,
        });

        assert.equal(pm.status, 'executed');
        assert.equal(pm.priceMatch.adjustmentCents, 500); // 2500 - 2000 = 500 ($5 diff)
        assert.equal(pm.priceMatch.source, 'live');
      } finally {
        close();
      }
    });

    test('full shopping loop (buy -> price-match -> refund) runs and links in hash chain', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const loop = await runShoppingLoop({ db, mandate: baseMandate, paypal: null }, {
          productId: 'prod-mug',
          sessionId: 'loop-session',
          agentId: 'loop-agent',
        });

        assert.equal(loop.success, true);
        assert.equal(loop.steps.length, 4);
        assert.equal(loop.steps[0].step, '1_search');
        assert.equal(loop.steps[1].step, '2_purchase');
        assert.equal(loop.steps[2].step, '3_price_match');
        assert.equal(loop.steps[3].step, '4_refund');

        // Check hash chain integrity
        assert.equal(loop.chainResult.ok, true);
        assert.ok(loop.chainResult.rows >= 4);

        // Verify linked actions in database
        const rows = db.all<{ action_id: string; event: string; payload_json: string }>('SELECT action_id, event, payload_json FROM ledger ORDER BY seq');
        assert.ok(rows.some((r) => r.payload_json.includes('purchase')));
        const acts = db.all<{ tool: string }>('SELECT tool FROM actions');
        assert.ok(acts.some((a) => a.tool === 'price_match_refund'));
      } finally {
        close();
      }
    });
  });
}

describe('Shop HTTP Express Routes', () => {
  test('GET /v1/shop/products returns catalog with source label', async () => {
    const { db, close } = await tempDb();
    try {
      const app = createApp({ db, mandate: baseMandate, paypal: null });
      const { server, base } = await startServer(app);

      const res = await fetch(`${base}/v1/shop/products?q=mug`);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.source, 'recorded');
      assert.ok(data.products.length >= 1);
      assert.equal(data.products[0].id, 'prod-mug');

      server.close();
    } finally {
      close();
    }
  });

  test('GET /v1/shop/products/:id returns 200 for found and 404 for unknown', async () => {
    const { db, close } = await tempDb();
    try {
      const app = createApp({ db, mandate: baseMandate, paypal: null });
      const { server, base } = await startServer(app);

      const rOk = await fetch(`${base}/v1/shop/products/prod-mug`);
      assert.equal(rOk.status, 200);
      const p = await rOk.json() as any;
      assert.equal(p.product.name, 'Ceramic Coffee Mug');

      const rNotFound = await fetch(`${base}/v1/shop/products/prod-nonexistent-12345`);
      assert.equal(rNotFound.status, 404);

      server.close();
    } finally {
      close();
    }
  });

  test('GET /v1/shop/similar/:id returns related products for exchanges', async () => {
    const { db, close } = await tempDb();
    try {
      const app = createApp({ db, mandate: baseMandate, paypal: null });
      const { server, base } = await startServer(app);

      const res = await fetch(`${base}/v1/shop/similar/prod-mug`);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.ok(Array.isArray(data.similar));
      assert.ok(data.similar.some((s: any) => s.id === 'prod-tumbler'));

      server.close();
    } finally {
      close();
    }
  });

  test('POST /v1/shop/purchase executes checkout through gate', async () => {
    const { db, close } = await tempDb();
    try {
      const app = createApp({ db, mandate: baseMandate, paypal: null });
      const { server, base } = await startServer(app);

      const res = await fetch(`${base}/v1/shop/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 'prod-mug', qty: 1 }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.status, 'executed');
      assert.equal(data.amountCents, 1800);
      assert.ok(data.captureId);

      server.close();
    } finally {
      close();
    }
  });

  test('POST /v1/shop/loop executes full shopping loop end to end', async () => {
    const { db, close } = await tempDb();
    try {
      const app = createApp({ db, mandate: baseMandate, paypal: null });
      const { server, base } = await startServer(app);

      const res = await fetch(`${base}/v1/shop/loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 'prod-mug' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.steps.length, 4);
      assert.equal(data.chainResult.ok, true);

      server.close();
    } finally {
      close();
    }
  });
});
