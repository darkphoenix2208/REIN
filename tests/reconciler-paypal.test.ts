// Reconciler with injected PayPal client using REAL response shapes from PayPal documentation
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { createApp } from '../server/app.ts';
import http from 'node:http';

const NOW = Date.now();
const MANDATE = {
  schema_version: 1,
  dailyCapCents: 50000,
  hardDailyCapCents: 100000,
  perActionCapCents: 10000,
  hardMaxCents: 20000,
  expiresAt: Date.parse('2099-12-31T23:59:59Z'),
};

function request(app: any, method: string, path: string, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(app);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as any).port as number;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          srv.close();
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode!, body: data });
          }
        });
      });
      req.on('error', (e) => { srv.close(); reject(e); });
      req.end();
    });
  });
}

for (const driver of ['better-sqlite3', 'node:sqlite'] as const) {
  describe(`Reconciler with injected PayPal client (${driver})`, () => {
    test('reconciler finds refund via order lookup using REAL PayPal response shape', async () => {
      const path = join(mkdtempSync(join(tmpdir(), 'rein-rec-')), 't.db');
      const db = await openDb(path, { driver });
      applySchema(db);

      // Seed payment, order, and items
      const captureId = 'CAPTURE-12345';
      const orderId = 'ORDER-67890';
      db.run(
        `INSERT INTO payments(txn_id, captured_cents, refunded_cents, reserved_cents, currency, source, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        captureId, 10000, 0, 1000, 'USD', 'test', NOW
      );
      db.run(`INSERT INTO orders(order_id, capture_id) VALUES (?, ?)`, orderId, captureId);
      db.run(
        `INSERT INTO order_items(order_id, item_id, name, unit_cents, qty)
         VALUES (?, ?, ?, ?, ?)`,
        orderId, 'item-1', 'Test Item', 1000, 1
      );

      // Create unknown_outcome action without refund_id
      const actionId = 'action-unknown-1';
      db.run(
        `INSERT INTO actions(id, session_id, tool, capture_id, amount_cents, decision, rule_id, reason, status, created_at, updated_at, action_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        actionId, 'sess1', 'refund_items', captureId, 1000, 'allowed', 'R-ALLOW', 'ok', 'unknown_outcome', NOW - 5000, NOW - 5000, 'refund'
      );

      // Create injected PayPal client with REAL response shape from PayPal docs
      const mockPayPalClient = {
        getRefund: async (refundId: string) => {
          return {
            id: refundId,
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '10.00' },
          };
        },
        getOrder: async (oid: string) => {
          assert.equal(oid, orderId, 'Should request the correct order ID');
          // Real PayPal order response shape from documentation
          // See: https://developer.paypal.com/docs/api/orders/v2/#orders_get
          return {
            id: orderId,
            status: 'COMPLETED',
            purchase_units: [
              {
                reference_id: 'default',
                payments: {
                  captures: [
                    {
                      id: captureId,
                      status: 'COMPLETED',
                      amount: { currency_code: 'USD', value: '100.00' },
                    },
                  ],
                  refunds: [
                    {
                      id: 'REFUND-ABC123',
                      status: 'COMPLETED',
                      custom_id: actionId,
                      amount: { currency_code: 'USD', value: '10.00' },
                    },
                  ],
                },
              },
            ],
          };
        },
      };

      const token = 'TEST-TOKEN';
      const app = createApp({ db, mandate: MANDATE, paypal: mockPayPalClient as any }, { token });

      // Call reconciler endpoint
      const res = await request(app, 'POST', '/v1/workflow/reconcile', token);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.reconciled, 1, 'Should reconcile 1 action');

      // Verify action was reconciled
      const action = db.one<{ status: string; refund_id: string | null }>('SELECT status, refund_id FROM actions WHERE id=?', actionId);
      assert.equal(action?.status, 'executed', 'Action should be marked as executed');
      assert.equal(action?.refund_id, 'REFUND-ABC123', 'Refund ID should be discovered and stored');

      // Verify payment was settled
      const payment = db.one<{ refunded_cents: number; reserved_cents: number }>('SELECT refunded_cents, reserved_cents FROM payments WHERE txn_id=?', captureId);
      assert.equal(payment?.refunded_cents, 1000, 'refunded_cents should be updated');
      assert.equal(payment?.reserved_cents, 0, 'reserved_cents should be released');

      db.close();
    });
  });
}
