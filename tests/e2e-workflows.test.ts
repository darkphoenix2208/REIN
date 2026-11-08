// E2E WORKFLOWS - Complete user journeys from start to finish
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tempDb } from './helpers.ts';
import { check, approve, result } from '../server/dispatch.ts';
import type { PayPalClient } from '../server/paypal.ts';

describe('E2E Workflows', () => {
  test('complete refund workflow: check → approve → execute → settle', async () => {
    const { db, mandate } = await tempDb();
    const now = Date.now();
    const sessionId = 'e2e-refund-session';
    
    // Setup: Create a payment
    db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency) VALUES (?,?,?,?,?)`,
      'CAP-E2E-001', 50000, 0, 0, 'USD');
    
    // Step 1: Check refund (simulated mode)
    const checkRes = await check(db, {
      sessionId,
      tool: 'refund_items',
      args: { captureId: 'CAP-E2E-001', amount: 10000, items: [{ itemId: 'item1', qty: 1 }] },
      mandate,
      timestamp: now,
    });
    
    assert.equal(checkRes.decision, 'allowed', 'Should allow refund within limits');
    assert.ok(checkRes.actionId, 'Should create action ID');
    assert.ok(checkRes.grantId, 'Should create grant ID');
    
    // Step 2: Approve with grant
    const approveRes = await approve(db, {
      sessionId,
      grantId: checkRes.grantId!,
      tool: 'refund_items',
      args: { captureId: 'CAP-E2E-001', amount: 10000, items: [{ itemId: 'item1', qty: 1 }] },
      mandate,
      timestamp: now + 1000,
    });
    
    assert.equal(approveRes.status, 'reserved', 'Should reserve action');
    
    // Step 3: Execute (simulated)
    const executeRes = await result(db, null as unknown as PayPalClient, {
      actionId: checkRes.actionId!,
      success: true,
      captureId: 'CAP-E2E-001',
      timestamp: now + 2000,
    });
    
    assert.equal(executeRes.status, 'executed', 'Should mark as executed');
    
    // Verify payment record updated
    const payment = db.one<{ refunded_cents: number; reserved_cents: number }>(
      'SELECT refunded_cents, reserved_cents FROM payments WHERE txn_id=?',
      'CAP-E2E-001'
    );
    
    assert.equal(payment?.reserved_cents, 0, 'Reserved amount should be cleared');
    assert.equal(payment?.refunded_cents, 10000, 'Refunded amount should be updated');
    
    db.close();
  });

  test('complete payout workflow: check → approve → execute', async () => {
    const { db, mandate } = await tempDb();
    const now = Date.now();
    
    // Add payee to allowlist
    db.run(`INSERT INTO payee_allowlist(payee_email,added_at) VALUES (?,?)`,
      'contractor@example.com', now);
    
    // Check payout
    const checkRes = await check(db, {
      sessionId: 'payout-session',
      tool: 'create_payout',
      args: { payee_email: 'contractor@example.com', amount_cents: 25000, note: 'Monthly payment' },
      mandate,
      timestamp: now,
    });
    
    assert.equal(checkRes.decision, 'allowed', 'Should allow payout');
    
    // Approve
    const approveRes = await approve(db, {
      sessionId: 'payout-session',
      grantId: checkRes.grantId!,
      tool: 'create_payout',
      args: { payee_email: 'contractor@example.com', amount_cents: 25000, note: 'Monthly payment' },
      mandate,
      timestamp: now + 1000,
    });
    
    assert.equal(approveRes.status, 'reserved', 'Payout should be reserved');
    
    // Execute (simulated)
    const executeRes = await result(db, null as unknown as PayPalClient, {
      actionId: checkRes.actionId!,
      success: true,
      timestamp: now + 2000,
    });
    
    assert.equal(executeRes.status, 'executed', 'Payout should be executed');
    
    // Verify action record
    const action = db.one<{ action_type: string; payee_email: string; amount_cents: number }>(
      'SELECT action_type, payee_email, amount_cents FROM actions WHERE id=?',
      checkRes.actionId
    );
    
    assert.equal(action?.action_type, 'payout', 'Action type should be payout');
    assert.equal(action?.payee_email, 'contractor@example.com', 'Payee email should match');
    assert.equal(action?.amount_cents, 25000, 'Amount should match');
    
    db.close();
  });

  test('complete subscription workflow: check → approve → execute', async () => {
    const { db, mandate } = await tempDb();
    const { checkSubscription } = await import('../server/dispatch.ts');
    const now = Date.now();
    
    // Check subscription cancellation
    const checkRes = await checkSubscription(db, {
      sessionId: 'sub-session',
      args: { subscription_id: 'SUB123', reason: 'Customer requested' },
      mandate,
      timestamp: now,
    });
    
    assert.equal(checkRes.decision, 'allowed', 'Should allow subscription cancel');
    
    // Approve
    const approveRes = await approve(db, {
      sessionId: 'sub-session',
      grantId: checkRes.grantId!,
      tool: 'cancel_subscription',
      args: { subscription_id: 'SUB123', reason: 'Customer requested' },
      mandate,
      timestamp: now + 1000,
    });
    
    assert.equal(approveRes.status, 'reserved', 'Subscription should be reserved');
    
    // Execute
    const executeRes = await result(db, null as unknown as PayPalClient, {
      actionId: checkRes.actionId!,
      success: true,
      timestamp: now + 2000,
    });
    
    assert.equal(executeRes.status, 'executed', 'Subscription should be executed');
    
    // Verify action record
    const action = db.one<{ action_type: string; subscription_id: string | null }>(
      'SELECT action_type, subscription_id FROM actions WHERE id=?',
      checkRes.actionId
    );
    
    assert.equal(action?.action_type, 'subscription', 'Action type should be subscription');
    assert.equal(action?.subscription_id, 'SUB123', 'Subscription ID should match');
    
    db.close();
  });

  test('blocked refund workflow: exceeds cap', async () => {
    const { db, mandate } = await tempDb();
    const now = Date.now();
    
    // Create payment
    db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency) VALUES (?,?,?,?,?)`,
      'CAP-BLOCKED', 20000, 0, 0, 'USD');
    
    // Try to refund more than hard max (default is $100 = 10000 cents)
    const checkRes = await check(db, {
      sessionId: 'blocked-session',
      tool: 'refund_items',
      args: { captureId: 'CAP-BLOCKED', amount: 15000, items: [{ itemId: 'item1', qty: 1 }] },
      mandate,
      timestamp: now,
    });
    
    assert.equal(checkRes.decision, 'blocked', 'Should block refund over hard max');
    assert.ok(checkRes.ruleId?.includes('R-HARD-MAX'), 'Should trigger hard max rule');
    assert.equal(checkRes.grantId, undefined, 'Should not create grant for blocked action');
    
    db.close();
  });

  test('multi-action workflow: multiple refunds respect cumulative caps', async () => {
    const { db, mandate } = await tempDb();
    const now = Date.now();
    
    // Create payment with $1000
    db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency) VALUES (?,?,?,?,?)`,
      'CAP-MULTI', 100000, 0, 0, 'USD');
    
    // First refund: $30 (using basic refund, not items)
    const check1 = await check(db, {
      sessionId: 'multi-1',
      tool: 'refund',
      args: { captureId: 'CAP-MULTI', amount: 3000 },
      mandate,
      timestamp: now,
    });
    assert.equal(check1.decision, 'allowed');
    
    await approve(db, {
      sessionId: 'multi-1',
      grantId: check1.grantId!,
      tool: 'refund',
      args: { captureId: 'CAP-MULTI', amount: 3000 },
      mandate,
      timestamp: now + 100,
    });
    
    await result(db, null as unknown as PayPalClient, {
      actionId: check1.actionId!,
      success: true,
      captureId: 'CAP-MULTI',
      timestamp: now + 200,
    });
    
    // Second refund: $40
    const check2 = await check(db, {
      sessionId: 'multi-2',
      tool: 'refund',
      args: { captureId: 'CAP-MULTI', amount: 4000 },
      mandate,
      timestamp: now + 1000,
    });
    assert.equal(check2.decision, 'allowed');
    
    // Verify cumulative tracking
    const payment = db.one<{ refunded_cents: number }>(
      'SELECT refunded_cents FROM payments WHERE txn_id=?',
      'CAP-MULTI'
    );
    assert.equal(payment?.refunded_cents, 3000, 'First refund should be recorded');
    
    db.close();
  });
});