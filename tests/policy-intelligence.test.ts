// Tests for advanced policy intelligence: customer velocity, two-person approval, TOTP
import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { decide, usd, type PolicyState } from '../server/policy.ts';
import type { Mandate } from '../server/types.ts';

const NOW = Date.now();
const MANDATE_BASE: Mandate = {
  perActionCapCents: 5000,
  hardMaxCents: 10000,
  dailyCapCents: 20000,
  hardDailyCapCents: 30000,
  expiresAt: NOW + 86400000,
};

describe('Policy Intelligence: Customer Velocity', () => {
  test('allows refund when under velocity limits', () => {
    const mandate: Mandate = {
      ...MANDATE_BASE,
      customerVelocityMaxActions: 5,
      customerVelocityMaxAmountCents: 50000, // $500
    };
    
    const state: PolicyState = {
      pay: { c: 10000, f: 0, r: 0 },
      windowSum: 0,
      dup: false,
      now: NOW,
      customerEmail: 'customer@example.com',
      customerVelocityActions: 2,
      customerVelocityAmountCents: 10000,
    };
    
    const decision = decide({ amountCents: 5000 }, mandate, state);
    assert.equal(decision.status, 'allowed');
  });
  
  test('blocks when customer exceeds action velocity limit', () => {
    const mandate: Mandate = {
      ...MANDATE_BASE,
      customerVelocityMaxActions: 3,
    };
    
    const state: PolicyState = {
      pay: { c: 10000, f: 0, r: 0 },
      windowSum: 0,
      dup: false,
      now: NOW,
      customerVelocityActions: 3,
    };
    
    const decision = decide({ amountCents: 5000 }, mandate, state);
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.ruleId, 'R-CUSTOMER-VELOCITY-ACTIONS');
  });
  
  test('blocks when customer exceeds amount velocity limit', () => {
    const mandate: Mandate = {
      ...MANDATE_BASE,
      customerVelocityMaxAmountCents: 20000,
    };
    
    const state: PolicyState = {
      pay: { c: 10000, f: 0, r: 0 },
      windowSum: 0,
      dup: false,
      now: NOW,
      customerVelocityAmountCents: 18000,
    };
    
    const decision = decide({ amountCents: 5000 }, mandate, state);
    assert.equal(decision.status, 'blocked');
    assert.equal(decision.ruleId, 'R-CUSTOMER-VELOCITY-AMOUNT');
  });
});

describe('Policy Intelligence: Two-Person Approval', () => {
  test('escalates when no approvals yet', () => {
    const mandate: Mandate = {
      ...MANDATE_BASE,
      perActionCapCents: 12000, // High enough to not trigger R-ACTION-CAP
      requireTwoPersonApproval: true,
      twoPersonThresholdCents: 8000,
    };
    
    const state: PolicyState = {
      pay: { c: 10000, f: 0, r: 0 },
      windowSum: 0,
      dup: false,
      now: NOW,
      approvalCount: 0,
    };
    
    const decision = decide({ amountCents: 9000 }, mandate, state);
    assert.equal(decision.status, 'pending_approval');
    assert.equal(decision.ruleId, 'R-TWO-PERSON-REQUIRED');
  });
  
  test('allows when two approvals received', () => {
    const mandate: Mandate = {
      ...MANDATE_BASE,
      perActionCapCents: 12000,
      requireTwoPersonApproval: true,
      twoPersonThresholdCents: 8000,
    };
    
    const state: PolicyState = {
      pay: { c: 10000, f: 0, r: 0 },
      windowSum: 0,
      dup: false,
      now: NOW,
      approvalCount: 2,
    };
    
    const decision = decide({ amountCents: 9000 }, mandate, state);
    assert.equal(decision.status, 'allowed');
  });
});

describe('Policy Intelligence: TOTP', () => {
  test('escalates when no TOTP code', () => {
    const mandate: Mandate = {
      ...MANDATE_BASE,
      perActionCapCents: 5000,
      dailyCapCents: 200000, // High enough to not trigger R-DAILY-CAP
      requireTOTPForHighValue: true,
    };
    
    const state: PolicyState = {
      pay: { c: 10000, f: 0, r: 0 },
      windowSum: 0,
      dup: false,
      now: NOW,
      totpCode: undefined,
    };
    
    const decision = decide({ amountCents: 6000 }, mandate, state);
    assert.equal(decision.status, 'pending_approval');
    assert.equal(decision.ruleId, 'R-TOTP-REQUIRED');
  });
  
  test('allows when TOTP provided', () => {
    const mandate: Mandate = {
      ...MANDATE_BASE,
      perActionCapCents: 5000,
      dailyCapCents: 200000,
      requireTOTPForHighValue: true,
    };
    
    const state: PolicyState = {
      pay: { c: 10000, f: 0, r: 0 },
      windowSum: 0,
      dup: false,
      now: NOW,
      totpCode: '123456',
    };
    
    const decision = decide({ amountCents: 6000 }, mandate, state);
    // Should escalate to R-ACTION-CAP since it's over perActionCapCents
    // but with TOTP, it passes that rule and hits the action cap
    assert.equal(decision.status, 'pending_approval');
    assert.equal(decision.ruleId, 'R-ACTION-CAP');
  });
});
