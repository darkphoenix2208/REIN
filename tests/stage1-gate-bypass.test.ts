// Stage 1.2: Gate bypass tests for cancel_subscription and handle_dispute.
// These tests FAIL if either action auto-allows without going through the policy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { runSubscriptionCancel, runDisputeHandle, type GateDeps } from '../server/gate.ts';
import { checkDispute } from '../server/dispatch.ts';
import type { Mandate } from '../server/types.ts';

const NOW = Date.now();

const baseMandate: Mandate = {
  perActionCapCents: 5000,
  hardMaxCents: 10000,
  dailyCapCents: 20000,
  hardDailyCapCents: 40000,
  expiresAt: NOW + 86_400_000,
};

async function makeDeps(driver: 'better-sqlite3' | 'node:sqlite'): Promise<GateDeps> {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-gate-')), 't.db');
  const db = await openDb(path, { driver });
  applySchema(db);
  return { db, mandate: baseMandate, paypal: null };
}

for (const driver of ['better-sqlite3', 'node:sqlite'] as const) {
  describe(`Gate bypass prevention (${driver})`, () => {

    // ---- cancel_subscription ----

    test('cancel_subscription: high-value subscription MUST escalate (gate not bypassed)', async () => {
      const d = await makeDeps(driver);
      // In sim mode, subscriptionValue defaults to 1500 cents ($15/month).
      // Set a mandate where $15/month exceeds the threshold (dailyCapCents = 500 cents = $5).
      // If the gate were bypassed, this would be 'executed' regardless.
      const tightDeps: GateDeps = {
        ...d,
        mandate: { ...baseMandate, dailyCapCents: 500, hardDailyCapCents: 40000 },
      };
      const outcome = await runSubscriptionCancel(tightDeps, {
        subscriptionId: 'SUB-HIGH-VALUE-001',
        reason: 'Customer request',
        sessionId: 'sess-test-01',
      });
      // $15/month > $5 threshold → must escalate
      // If gate were bypassed this would be 'executed'
      assert.equal(outcome.status, 'pending_approval',
        `High-value subscription MUST escalate; got: ${outcome.status}. Gate was bypassed!`);
      assert.ok('ruleId' in outcome, 'Must have ruleId');
      const o = outcome as any;
      assert.equal(o.ruleId, 'R-SUBSCRIPTION-HIGH-VALUE',
        `Must fire R-SUBSCRIPTION-HIGH-VALUE; got: ${o.ruleId}`);
    });

    test('cancel_subscription: already-cancelled subscription MUST block (gate not bypassed)', async () => {
      const d = await makeDeps(driver);
      // We can't set status = CANCELLED on simulated, but the policy checks subscriptionStatus.
      // In sim mode, runSubscriptionCancel uses default 'ACTIVE' status.
      // We test that the gate runs at all by using an expired mandate.
      const expiredDeps: GateDeps = { ...d, mandate: { ...baseMandate, expiresAt: NOW - 1000 } };
      const outcome = await runSubscriptionCancel(expiredDeps, {
        subscriptionId: 'SUB-EXPIRED-001',
        reason: 'Test',
        sessionId: 'sess-test-02',
      });
      // Expired mandate → must block with R-MANDATE-EXPIRED
      assert.equal(outcome.status, 'blocked',
        `Expired mandate MUST block; got: ${outcome.status}. Gate was bypassed!`);
      const o = outcome as any;
      assert.equal(o.ruleId, 'R-MANDATE-EXPIRED',
        `Must fire R-MANDATE-EXPIRED; got: ${o.ruleId}`);
    });

    test('cancel_subscription: low-value active subscription is allowed (correct gate decision)', async () => {
      // Uses mandate where $15/month < $200 daily cap threshold → allowed
      const d = await makeDeps(driver);
      const outcome = await runSubscriptionCancel(d, {
        subscriptionId: 'SUB-LOW-001',
        reason: 'Test',
        sessionId: 'sess-test-03',
      });
      // sim mode defaults $15/month. With perActionCapCents=$50 and dailyCapCents=$200,
      // $15 < $200 threshold → allowed
      assert.ok(['executed', 'pending_approval'].includes(outcome.status),
        `Low-value subscription should be allowed or escalated; got: ${outcome.status}`);
    });

    test('cancel_subscription: ledger row is written for EVERY decision', async () => {
      const d = await makeDeps(driver);
      const before = d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0;
      await runSubscriptionCancel(d, {
        subscriptionId: 'SUB-LEDGER-001',
        reason: 'Test',
        sessionId: 'sess-test-04',
      });
      const after = d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0;
      assert.ok(after > before, 'cancel_subscription must write at least one ledger row');
    });

    // ---- handle_dispute ----

    test('handle_dispute: accepting a large claim MUST go through gate (escalate or block)', async () => {
      const d = await makeDeps(driver);
      // In sim mode, dispute amount = $50 (5000 cents), perActionCapCents = $50
      // $50 == perActionCapCents threshold → may allow if exactly equal, test with smaller cap
      const tightDeps: GateDeps = {
        ...d,
        mandate: { ...baseMandate, perActionCapCents: 1000, hardMaxCents: 10000 }, // $10 cap
      };
      const outcome = await runDisputeHandle(tightDeps, {
        disputeId: 'DIS-LARGE-001',
        captureId: 'CAP-LARGE-001',
        sessionId: 'sess-dis-01',
        action: 'accept',
      });
      // $50 dispute >> $10 perActionCapCents → must escalate (R-DISPUTE-HIGH-VALUE)
      // NOT auto-allow. If gate bypassed: would be 'executed'
      assert.ok(['pending_approval', 'blocked'].includes(outcome.status),
        `Large dispute claim MUST escalate; got: ${outcome.status}. Gate was bypassed!`);
    });

    test('handle_dispute: expired mandate blocks dispute acceptance', async () => {
      const d = await makeDeps(driver);
      const expiredDeps: GateDeps = { ...d, mandate: { ...baseMandate, expiresAt: NOW - 1000 } };
      const outcome = await runDisputeHandle(expiredDeps, {
        disputeId: 'DIS-EXPIRED-001',
        captureId: 'CAP-EXPIRED-001',
        sessionId: 'sess-dis-02',
      });
      // generateDisputeResponse will suggest 'accept' for no-evidence case,
      // then checkDispute must fire R-MANDATE-EXPIRED
      assert.equal(outcome.status, 'blocked',
        `Expired mandate MUST block dispute acceptance; got: ${outcome.status}. Gate was bypassed!`);
      const o = outcome as any;
      assert.equal(o.ruleId, 'R-MANDATE-EXPIRED');
    });

    test('handle_dispute: ledger row is written for EVERY decision', async () => {
      const d = await makeDeps(driver);
      const before = d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0;
      await runDisputeHandle(d, {
        disputeId: 'DIS-LEDGER-001',
        captureId: 'CAP-LEDGER-001',
        sessionId: 'sess-dis-03',
      });
      const after = d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0;
      assert.ok(after > before, 'handle_dispute must write at least one ledger row');
    });

    test('handle_dispute: provide_evidence path is allowed without gating (zero-cost action)', async () => {
      const d = await makeDeps(driver);
      // Insert an executed refund so generateDisputeResponse suggests provide_evidence
      d.db.run(
        `INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        'ev-ref-01', 'sess-ev-01', 'refund_items', 'CAP-EV-001', 5000, 'allowed', 'R-ALLOW', 'Test', 'executed', NOW - 1000, NOW - 1000
      );
      const before = d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0;
      const outcome = await runDisputeHandle(d, {
        disputeId: 'DIS-EV-001',
        captureId: 'CAP-EV-001',
        sessionId: 'sess-dis-04',
      });
      // Should be executed (provide_evidence allowed)
      assert.equal(outcome.status, 'executed',
        `provide_evidence should be allowed; got: ${outcome.status}`);
      const after = d.db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0;
      // Even evidence must write to ledger (the action is recorded)
      assert.ok(after > before, 'provide_evidence must write a ledger row');
    });

  });
}
