// Price-match refund computation tests
import { strictEqual as eq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { computePriceMatchAdjustment, getPriceMatchAdjustment } from '../server/price-match.ts';

describe('computePriceMatchAdjustment (pure function)', () => {
  test('our price > market price → refund difference', () => {
    const result = computePriceMatchAdjustment(1800, 1500, 'high');
    ok(result.ok);
    eq(result.adjustmentCents, 300, '$18 - $15 = $3 adjustment');
    eq(result.ourPriceCents, 1800);
    eq(result.marketPriceCents, 1500);
    eq(result.confidence, 'high');
  });

  test('our price <= market price → no adjustment', () => {
    const result = computePriceMatchAdjustment(1500, 1800, 'high');
    ok(result.ok);
    eq(result.adjustmentCents, 0, 'no refund when our price is lower');
  });

  test('our price = market price → no adjustment', () => {
    const result = computePriceMatchAdjustment(1800, 1800, 'high');
    ok(result.ok);
    eq(result.adjustmentCents, 0);
  });

  test('market price unavailable → error', () => {
    const result = computePriceMatchAdjustment(1800, null, 'unavailable');
    eq(result.ok, false);
    eq(result.adjustmentCents, 0);
    ok(result.error);
  });

  test('low confidence → error', () => {
    const result = computePriceMatchAdjustment(1800, 1500, 'low');
    eq(result.ok, false);
    eq(result.adjustmentCents, 0);
    eq(result.error, 'Low confidence market data');
  });

  test('null market price with high confidence → error', () => {
    const result = computePriceMatchAdjustment(1800, null, 'high');
    eq(result.ok, false);
    ok(result.error);
  });

  test('large price difference', () => {
    const result = computePriceMatchAdjustment(10000, 6000, 'high');
    ok(result.ok);
    eq(result.adjustmentCents, 4000, '$100 - $60 = $40 adjustment');
  });

  test('small price difference', () => {
    const result = computePriceMatchAdjustment(1000, 950, 'high');
    ok(result.ok);
    eq(result.adjustmentCents, 50, '$10 - $9.50 = $0.50 adjustment');
  });
});

describe('getPriceMatchAdjustment (with DB)', () => {
  const tempDb = async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    return { db, path, close: () => db.close() };
  };

  const seedOrder = (db: any, captureId: string, itemId: string, itemName: string, unitCents: number, qty: number) => {
    const orderId = `ORD-${captureId}`;
    db.run(`INSERT INTO payments(txn_id,captured_cents,currency) VALUES (?,?,'USD')`, captureId, unitCents * qty);
    db.run(`INSERT INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);
    db.run(`INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refundable) VALUES (?,?,?,?,?,1)`,
      orderId, itemId, itemName, unitCents, qty);
  };

  test('returns adjustment for item with lower market price', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP1', 'mug', 'Coffee Mug', 1800, 1);

    // Mock fetch that returns lower market price
    const mockFetch = async (url: string) => {
      if (url.includes('channel3')) {
        return { ok: true, json: async () => ({ price_cents: 1500 }) } as any;
      }
      return { ok: false } as any;
    };

    const origKey = process.env.CHANNEL3_API_KEY;
    process.env.CHANNEL3_API_KEY = 'test-key';
    const result = await getPriceMatchAdjustment(db, 'CAP1', 'mug', mockFetch as any);
    process.env.CHANNEL3_API_KEY = origKey;

    ok(result.ok);
    eq(result.adjustmentCents, 300, '$3 price match');
    eq(result.itemName, 'Coffee Mug');
    eq(result.qty, 1);
    eq(result.confidence, 'high');
    eq(result.source, 'live');
    close();
  });

  test('returns no adjustment when market price is higher', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP2', 'lamp', 'Table Lamp', 5000, 1);

    const mockFetch = async (url: string) => {
      if (url.includes('channel3')) {
        return { ok: true, json: async () => ({ price_cents: 6000 }) } as any;
      }
      return { ok: false } as any;
    };

    const origKey = process.env.CHANNEL3_API_KEY;
    process.env.CHANNEL3_API_KEY = 'test-key';
    const result = await getPriceMatchAdjustment(db, 'CAP2', 'lamp', mockFetch as any);
    process.env.CHANNEL3_API_KEY = origKey;

    ok(result.ok);
    eq(result.adjustmentCents, 0, 'no refund when our price is lower');
    close();
  });

  test('returns error for unknown capture', async () => {
    const { db, close } = await tempDb();
    const result = await getPriceMatchAdjustment(db, 'UNKNOWN', 'mug');
    eq(result.ok, false);
    eq(result.error, 'Order not found');
    close();
  });

  test('returns error for unknown item', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP3', 'mug', 'Coffee Mug', 1800, 1);
    const result = await getPriceMatchAdjustment(db, 'CAP3', 'unknown-item');
    eq(result.ok, false);
    eq(result.error, 'Item not found in order');
    close();
  });

  test('recorded fallback returns low confidence', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP4', 'mug', 'Coffee Mug', 1800, 1);

    // No API key → uses recorded fallback
    const result = await getPriceMatchAdjustment(db, 'CAP4', 'mug');

    eq(result.ok, false, 'low confidence data escalates');
    eq(result.error, 'Low confidence market data');
    eq(result.source, 'recorded');
    eq(result.confidence, 'low');
    close();
  });

  test('multi-quantity item adjustment', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP5', 'cushion', 'Throw Pillow', 2500, 2);

    const mockFetch = async (url: string) => {
      if (url.includes('channel3')) {
        return { ok: true, json: async () => ({ price_cents: 2000 }) } as any;
      }
      return { ok: false } as any;
    };

    const origKey = process.env.CHANNEL3_API_KEY;
    process.env.CHANNEL3_API_KEY = 'test-key';
    const result = await getPriceMatchAdjustment(db, 'CAP5', 'cushion', mockFetch as any);
    process.env.CHANNEL3_API_KEY = origKey;

    ok(result.ok);
    eq(result.adjustmentCents, 500, '$5 adjustment per unit');
    eq(result.qty, 2, 'item has qty 2');
    // Total refund would be 500 * 2 = 1000 cents ($10)
    close();
  });
});
