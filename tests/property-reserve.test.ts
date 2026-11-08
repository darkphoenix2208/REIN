// Property-based tests for reserve/settle: never negative, totals within caps
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { tempDb } from './helpers.ts';
import { runRefund } from '../server/dispatch.ts';
import type { GateDeps } from '../server/gate.ts';
import type { Mandate } from '../server/types.ts';

const NOW = Date.now();

test('property: reserved_cents never goes negative', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          itemId: fc.constantFrom('mug', 'beans', 'filter'),
          qty: fc.integer({ min: 1, max: 3 }),
        }),
        { minLength: 1, maxLength: 3 }
      ),
      async (itemRequests) => {
        const { db } = await tempDb();

        const captureId = 'TEST-CAP-' + Math.random().toString(36).slice(2);
        const orderId = 'TEST-ORD-' + Math.random().toString(36).slice(2);

        db.run(
          `INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,?,?,?,?,?)`,
          captureId, 10000, 0, 0, 'USD', 'test', NOW
        );

        db.run(`INSERT INTO orders(order_id, capture_id) VALUES (?,?)`, orderId, captureId);

        db.run(
          `INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,?,?,?)`,
          orderId, 'mug', 'Mug', 1800, 1, 0, 0, 1
        );
        db.run(
          `INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,?,?,?)`,
          orderId, 'beans', 'Beans', 2000, 2, 0, 0, 1
        );
        db.run(
          `INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,?,?,?)`,
          orderId, 'filter', 'Filter', 1500, 3, 0, 0, 1
        );

        const mandate: Mandate = {
          perActionCapCents: 5000,
          hardMaxCents: 10000,
          dailyCapCents: 10000,
          hardDailyCapCents: 20000,
          expiresAt: NOW + 86400000,
        };

        const deps: GateDeps = { db, mandate, paypal: null, now: () => NOW };

        const items = itemRequests.slice(0, 2);
        await runRefund(deps, {
          sessionId: 'test-session',
          tool: 'refund_items',
          captureId,
          amountCents: null,
          items: items.map((i) => ({ itemId: i.itemId, qty: Math.min(i.qty, 1) })),
        }, undefined);

        const payment = db.one<{ reserved_cents: number }>('SELECT reserved_cents FROM payments WHERE txn_id=?', captureId);
        assert.ok(payment, 'Payment must exist');
        assert.ok(payment.reserved_cents >= 0, `reserved_cents must be >= 0, got ${payment.reserved_cents}`);

        db.close();
      }
    ),
    { numRuns: 50 }
  );
});

test('property: refunded + reserved never exceeds captured', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        captured: fc.integer({ min: 5000, max: 50000 }),
        refundRequests: fc.array(fc.integer({ min: 100, max: 2000 }), { minLength: 1, maxLength: 5 }),
      }),
      async ({ captured, refundRequests }) => {
        const { db } = await tempDb();

        const captureId = 'TEST-CAP-' + Math.random().toString(36).slice(2);
        const orderId = 'TEST-ORD-' + Math.random().toString(36).slice(2);

        db.run(
          `INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,?,?,?,?,?)`,
          captureId, captured, 0, 0, 'USD', 'test', NOW
        );

        db.run(`INSERT INTO orders(order_id, capture_id) VALUES (?,?)`, orderId, captureId);

        db.run(
          `INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,?,?,?)`,
          orderId, 'item1', 'Item 1', captured, 1, 0, 0, 1
        );

        const mandate: Mandate = {
          perActionCapCents: 50000,
          hardMaxCents: 50000,
          dailyCapCents: 100000,
          hardDailyCapCents: 100000,
          expiresAt: NOW + 86400000,
        };

        const deps: GateDeps = { db, mandate, paypal: null, now: () => NOW };

        for (const amount of refundRequests.slice(0, 3)) {
          await runRefund(deps, {
            sessionId: `test-session-${Math.random()}`,
            tool: 'create_refund',
            captureId,
            amountCents: Math.min(amount, captured),
            items: null,
          }, undefined);
        }

        const payment = db.one<{ captured_cents: number; refunded_cents: number; reserved_cents: number }>(
          'SELECT captured_cents, refunded_cents, reserved_cents FROM payments WHERE txn_id=?', captureId
        );
        assert.ok(payment, 'Payment must exist');
        assert.ok(
          payment.refunded_cents + payment.reserved_cents <= payment.captured_cents,
          `refunded + reserved must be <= captured`
        );

        db.close();
      }
    ),
    { numRuns: 50 }
  );
});
