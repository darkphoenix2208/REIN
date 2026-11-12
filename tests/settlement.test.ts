// Non-refund actions persist as "reserved" and settle properly
import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { tempDb } from './helpers.ts';
import { checkSubscription, checkDispute, result, check, checkPayout } from '../server/dispatch.ts';
import type { Mandate } from '../server/types.ts';

const NOW = Date.now();
const baseMandate: Mandate = {
  perActionCapCents: 10000,
  hardMaxCents: 20000,
  dailyCapCents: 50000,
  hardDailyCapCents: 100000,
  expiresAt: NOW + 86400000,
};

describe('Settle non-refund actions', () => {
  test('subscription cancel persists as reserved, settles to executed', async () => {
    const { db } = await tempDb();
    const cr = checkSubscription(db, baseMandate, {
      actionId: 'sub1', sessionId: 'sess1', tool: 'cancel_subscription',
      subscriptionId: 'SUB-TEST-1', subscriptionStatus: 'ACTIVE', subscriptionValue: 1500,
    }, NOW, 'sim');
    assert.equal(cr.status, 'reserved', 'Should be reserved (not allowed)');
    const action = db.one<any>('SELECT status, decision FROM actions WHERE id=?', 'sub1');
    assert.equal(action.status, 'reserved', 'DB status should be reserved');
    assert.equal(action.decision, 'allowed', 'DB decision should be allowed');
    result(db, { actionId: 'sub1', outcome: 'executed' }, NOW + 1000, 'sim');
    const settled = db.one<any>('SELECT status FROM actions WHERE id=?', 'sub1');
    assert.equal(settled.status, 'executed', 'Should settle to executed');
    const ledgerRow = db.one<any>('SELECT event FROM ledger WHERE action_id=? AND event=?', 'sub1', 'executed');
    assert.ok(ledgerRow, 'Ledger should have executed event');
    db.close();
  });

  test('payouts/subscriptions do not count toward refund windowSum', async () => {
    // This test verifies the windowSum filtering by action_type='refund'
    const { db } = await tempDb();
    // Get the current windowSum count
    const ws = db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND action_type='refund' AND created_at>=? AND status IN ('reserved','executed','approved_executed','unknown_outcome')`, 'sess1', NOW - 86400000) ?? 0;
    assert.equal(ws, 0, 'Window sum should start at 0');
    
    // Add payout and subscription - should NOT be counted
    checkPayout(db, baseMandate, {
      actionId: 'pay1', sessionId: 'sess1', tool: 'create_payout',
      payeeEmail: 'v@ex.com', amountCents: 30000,
    }, NOW - 1000, 'sim');
    result(db, { actionId: 'pay1', outcome: 'executed' }, NOW - 500, 'sim');
    
    checkSubscription(db, baseMandate, {
      actionId: 'sub1', sessionId: 'sess1', tool: 'cancel_subscription',
      subscriptionId: 'SUB1', subscriptionStatus: 'ACTIVE', subscriptionValue: 5000,
    }, NOW - 2000, 'sim');
    result(db, { actionId: 'sub1', outcome: 'executed' }, NOW - 1500, 'sim');
    
    // Window sum should still be 0 (payout + subscription don't count)
    const ws2 = db.val<number>(`SELECT COALESCE(SUM(amount_cents),0) FROM actions WHERE session_id=? AND action_type='refund' AND created_at>=? AND status IN ('reserved','executed','approved_executed','unknown_outcome')`, 'sess1', NOW - 86400000) ?? 0;
    assert.equal(ws2, 0, 'Window sum should not include payouts or subscriptions');
    
    db.close();
  });

  test('failed subscription execution settles to execution_failed', async () => {
    const { db } = await tempDb();
    const cr = checkSubscription(db, baseMandate, {
      actionId: 'sub2', sessionId: 'sess2', tool: 'cancel_subscription',
      subscriptionId: 'SUB-TEST-2', subscriptionStatus: 'ACTIVE', subscriptionValue: 2000,
    }, NOW, 'sim');
    assert.equal(cr.status, 'reserved');
    result(db, { actionId: 'sub2', outcome: 'failed' }, NOW + 1000, 'sim');
    const settled = db.one<any>('SELECT status FROM actions WHERE id=?', 'sub2');
    assert.equal(settled.status, 'execution_failed', 'Should settle to execution_failed');
    db.close();
  });
});

