// Tests for Phase 3-5 new features: webhooks, order endpoint, channel3, price_adjust
import { strictEqual as eq, ok, match } from 'node:assert';
import { describe, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { loadMandate } from '../server/config.ts';
import { PayPalClient } from '../server/paypal.ts';
import { detectPriceAnomaly, checkPrice } from '../server/channel3.ts';
import { decide } from '../server/policy.ts';
import { result as dispatchResult } from '../server/dispatch.ts';
import { createProxy } from '../server/proxy.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const mandate = loadMandate('mandate.json');

// Test helpers
const tempDb = async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
  const db = await openDb(path);
  applySchema(db);
  return { db, path, close: () => db.close() };
};

const seedOrder = (db: any, captureId: string) => {
  const orderId = `ORD-${captureId}`;
  db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,0,0,'USD','test',?)`,
    captureId, 20000, Date.now() - 86400000);
  db.run(`INSERT INTO orders(order_id,capture_id) VALUES (?,?)`, orderId, captureId);
  db.run(`INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,0,0,1)`,
    orderId, 'mug', 'Coffee Mug', 1800, 1);
  db.run(`INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,0,0,1)`,
    orderId, 'cushion', 'Velvet Cushion', 4200, 1);
};

describe('webhook receiver reconciliation', () => {
  test('PAYMENT.CAPTURE.REFUNDED reconciles unknown_outcome action', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP-WH1');
    const now = Date.now();
    db.run(`INSERT INTO actions(id,session_id,capture_id,amount_cents,status,rule_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      'act-wh1', 'sess', 'CAP-WH1', 1800, 'unknown_outcome', 'R-ALLOW', now, now);

    // Simulate webhook reconciliation via dispatch.result
    dispatchResult(db, { actionId: 'act-wh1', outcome: 'executed', refundId: 'REFUND-123' }, now, 'sim');

    const action = db.one<{ status: string }>('SELECT status FROM actions WHERE id=?', 'act-wh1');
    eq(action?.status, 'executed', 'action reconciled to executed');
    close();
  });
});

describe('GET /v1/order/:captureId', () => {
  test('returns order items for known capture', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP-ORD1');

    // Direct DB query (simulating endpoint logic)
    const order = db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', 'CAP-ORD1');
    ok(order, 'order found');
    const items = db.all<any>('SELECT item_id, name, unit_cents, qty FROM order_items WHERE order_id=?', order.order_id);
    ok(items.length > 0, 'has items');
    const total = items.reduce((sum, i) => sum + i.unit_cents * i.qty, 0);
    ok(total > 0, 'total > 0');
    close();
  });

  test('returns nothing for unknown capture', async () => {
    const { db, close } = await tempDb();
    const order = db.one<{ order_id: string }>('SELECT order_id FROM orders WHERE capture_id=?', 'UNKNOWN');
    eq(order, undefined, 'no order for unknown capture');
    close();
  });
});

describe('server/channel3.ts', () => {
  test('detectPriceAnomaly: >10% diff is anomaly', () => {
    eq(detectPriceAnomaly(1800, 1500), true, '$18 vs $15 = 16.7% diff');
    eq(detectPriceAnomaly(1800, 1700), false, '$18 vs $17 = 5.5% diff');
    eq(detectPriceAnomaly(1800, null), false, 'null market price = no anomaly');
    eq(detectPriceAnomaly(0, 1000), false, 'zero our price = no anomaly');
  });

  test('checkPrice with recorded fallback (keyless)', async () => {
    const result = await checkPrice('CAP1', 'mug', 1800);
    eq(result.itemId, 'mug');
    eq(result.ourPriceCents, 1800);
    eq(result.marketPriceCents, 1500, 'recorded fallback for mug');
    eq(result.anomaly, true);
    eq(result.source, 'recorded');
  });

  test('checkPrice with unknown item (keyless)', async () => {
    const result = await checkPrice('CAP1', 'unknown-item', 5000);
    eq(result.itemId, 'unknown-item');
    eq(result.marketPriceCents, null);
    eq(result.anomaly, false);
    eq(result.source, 'unavailable');
  });

  test('checkPrice with live Channel3 (mocked fetch)', async () => {
    let fetchCalled = false;
    const mockFetch = async (url: string, opts: any) => {
      fetchCalled = true;
      match(url, /channel3\.com/);
      return { ok: true, json: async () => ({ price_cents: 1400 }) } as any;
    };

    const origKey = process.env.CHANNEL3_API_KEY;
    process.env.CHANNEL3_API_KEY = 'test-key';
    const result = await checkPrice('CAP1', 'test-item', 1800, mockFetch as any);
    process.env.CHANNEL3_API_KEY = origKey;

    ok(fetchCalled, 'fetch was called');
    eq(result.marketPriceCents, 1400);
    eq(result.anomaly, true);
    eq(result.source, 'live');
  });

  test('checkPrice live failure falls through to recorded', async () => {
    const mockFetch = async () => { throw new Error('network error'); };
    const origKey = process.env.CHANNEL3_API_KEY;
    process.env.CHANNEL3_API_KEY = 'test-key';
    const result = await checkPrice('CAP1', 'mug', 1800, mockFetch as any);
    process.env.CHANNEL3_API_KEY = origKey;

    eq(result.marketPriceCents, 1500, 'fell back to recorded');
    eq(result.source, 'recorded');
  });
});

describe('R-PRICE-ANOMALY policy rule', () => {
  test('price anomaly escalates', async () => {
    const { db, close} = await tempDb();
    seedOrder(db, 'CAP-PA1');

    const pay = db.one<any>('SELECT captured_cents AS c, refunded_cents AS f, reserved_cents AS r, currency AS cur, captured_at AS capturedAt FROM payments WHERE txn_id=?', 'CAP-PA1');
    const decision = decide({ amountCents: 1800, currency: 'USD' }, mandate, {
      pay: { c: pay.c, f: pay.f, r: pay.r, cur: pay.cur, capturedAt: pay.capturedAt },
      windowSum: 0,
      dup: false,
      now: Date.now(),
      priceAnomaly: true,
    });

    eq(decision.status, 'pending_approval');
    eq(decision.ruleId, 'R-PRICE-ANOMALY');
    match(decision.reason, /cheaper elsewhere/i);
    close();
  });

  test('no price anomaly allows refund', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP-PA2');

    const pay = db.one<any>('SELECT captured_cents AS c, refunded_cents AS f, reserved_cents AS r, currency AS cur, captured_at AS capturedAt FROM payments WHERE txn_id=?', 'CAP-PA2');
    const decision = decide({ amountCents: 1800, currency: 'USD' }, mandate, {
      pay: { c: pay.c, f: pay.f, r: pay.r, cur: pay.cur, capturedAt: pay.capturedAt },
      windowSum: 0,
      dup: false,
      now: Date.now(),
      priceAnomaly: false,
    });

    eq(decision.status, 'allowed');
    eq(decision.ruleId, 'R-ALLOW');
    close();
  });
});

describe('price_adjust MCP tool', () => {
  test('returns price anomaly status', async () => {
    const { db, close } = await tempDb();
    seedOrder(db, 'CAP-MCP1');
    const server = createProxy({ db, mandate, paypal: null });
    const [client, serverTrans] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTrans);
    const c = new Client({ name: 't', version: '1' });
    await c.connect(client);

    const result: any = await c.callTool({ name: 'price_adjust', arguments: { capture_id: 'CAP-MCP1', item_id: 'mug' } });
    const data = JSON.parse(result.content[0].text);

    eq(data.item_id, 'mug');
    eq(data.our_price, '18.00');
    eq(data.market_price, '15.00');
    eq(data.price_anomaly, true);
    eq(data.source, 'recorded');
    ok(data.note, 'has escalation note');

    await c.close();
    close();
  });

  test('unknown capture returns error', async () => {
    const { db, close } = await tempDb();
    const server = createProxy({ db, mandate, paypal: null });
    const [client, serverTrans] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTrans);
    const c = new Client({ name: 't', version: '1' });
    await c.connect(client);

    const result: any = await c.callTool({ name: 'price_adjust', arguments: { capture_id: 'UNKNOWN', item_id: 'mug' } });
    eq(result.isError, true);
    const data = JSON.parse(result.content[0].text);
    eq(data.status, 'unknown_order');

    await c.close();
    close();
  });
});

describe('custom_id on refunds', () => {
  test('PayPalClient.refund includes custom_id', async () => {
    let requestBody: any;
    const mockFetch = async (url: string, opts: any) => {
      if (url.includes('/oauth2/token')) {
        return { ok: true, json: async () => ({ access_token: 'tok' }), text: async () => '{}' } as any;
      }
      requestBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'REF123', status: 'COMPLETED' }), text: async () => '{"id":"REF123","status":"COMPLETED"}' } as any;
    };

    const pp = new PayPalClient({
      baseUrl: 'https://api-m.sandbox.paypal.com',
      clientId: 'test',
      clientSecret: 'secret',
      fetchImpl: mockFetch as any,
    });

    await pp.refund('CAP123', 1800, 'USD', 'action-123', 'test note');

    eq(requestBody.custom_id, 'action-123', 'custom_id set to action ID');
    eq(requestBody.amount.value, '18.00');
    eq(requestBody.note_to_payer, 'test note');
  });
});
