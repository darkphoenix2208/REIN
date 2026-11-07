// Subscription cancellation tests
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSubscriptionCancel, type SubscriptionPolicyState } from '../server/policy.ts';
import type { Mandate } from '../server/types.ts';

const baseMandate: Mandate = {
  perActionCapCents: 5000,
  hardMaxCents: 10000,
  dailyCapCents: 20000,
  hardDailyCapCents: 40000,
  expiresAt: Date.now() + 86400000,
};

describe('Subscription cancellation policy', () => {
  test('allows cancellation of low-value active subscription', () => {
    const state: SubscriptionPolicyState = {
      subscriptionStatus: 'ACTIVE',
      subscriptionValue: 1500, // $15/month
      now: Date.now(),
    };

    const decision = decideSubscriptionCancel('SUB-123', baseMandate, state);
    assert.equal(decision.status, 'allowed');
    assert.equal(decision.ruleId, 'R-ALLOW');
  });

  test('escalates high-value subscription cancellation', () => {
    const state: SubscriptionPolicyState = {
      subscriptionStatus: 'ACTIVE',
      subscriptionValue: 25000, // $250/month (exceeds $200 daily cap threshold)
      now: Date.now(),
    };

    const decision = decideSubscriptionCancel('SUB-123', baseMandate, state);
    assert.equal(decision.status, 'pending_approval');
    assert.equal(decision.ruleId, 'R-SUBSCRIPTION-HIGH-VALUE');
    assert.ok(decision.reason.includes('$250.00'));
  });

  test('blocks cancellation of already-cancelled subscription', () => {
    const state: SubscriptionPolicyState = {
      subscriptionStatus: 'CANCELLED',
      subscriptionValue: 1500,
      now: Date.now(),
    };

    const decision = decideSubscriptionCancel('SUB-123', baseMandate, state);
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.ruleId, 'R-SUBSCRIPTION-ALREADY-CANCELLED');
  });

  test('blocks cancellation if subscription in invalid state', () => {
    const state: SubscriptionPolicyState = {
      subscriptionStatus: 'EXPIRED',
      subscriptionValue: 1500,
      now: Date.now(),
    };

    const decision = decideSubscriptionCancel('SUB-123', baseMandate, state);
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.ruleId, 'R-SUBSCRIPTION-INVALID-STATE');
    assert.ok(decision.reason.includes('EXPIRED'));
  });

  test('allows suspended subscription to be cancelled', () => {
    const state: SubscriptionPolicyState = {
      subscriptionStatus: 'SUSPENDED',
      subscriptionValue: 1500,
      now: Date.now(),
    };

    const decision = decideSubscriptionCancel('SUB-123', baseMandate, state);
    assert.equal(decision.status, 'allowed');
  });

  test('approval waives high-value threshold', () => {
    const state: SubscriptionPolicyState = {
      subscriptionStatus: 'ACTIVE',
      subscriptionValue: 50000, // $500/month
      now: Date.now(),
      approved: true,
    };

    const decision = decideSubscriptionCancel('SUB-123', baseMandate, state);
    assert.equal(decision.status, 'allowed');
    assert.equal(decision.ruleId, 'R-APPROVED');
  });

  test('blocks if mandate expired', () => {
    const expiredMandate = { ...baseMandate, expiresAt: Date.now() - 1000 };
    const state: SubscriptionPolicyState = {
      subscriptionStatus: 'ACTIVE',
      subscriptionValue: 1500,
      now: Date.now(),
    };

    const decision = decideSubscriptionCancel('SUB-123', expiredMandate, state);
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.ruleId, 'R-MANDATE-EXPIRED');
  });
});
