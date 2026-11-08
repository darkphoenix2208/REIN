// Property-based tests for policy: never refund more than captured, deterministic decisions
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { decide, type PolicyState } from '../server/policy.ts';
import type { Mandate } from '../server/types.ts';

const NOW = Date.now();

test('property: decide never allows refunding more than captured', () => {
  fc.assert(
    fc.property(
      fc.record({
        captured: fc.integer({ min: 1, max: 1000000 }),
        refunded: fc.integer({ min: 0, max: 1000000 }),
        requestedCents: fc.integer({ min: 1, max: 1000000 }),
        windowSum: fc.integer({ min: 0, max: 1000000 }),
      }),
      ({ captured, refunded, requestedCents, windowSum }) => {
        const mandate: Mandate = {
          perActionCapCents: 1000000,
          hardMaxCents: 1000000,
          dailyCapCents: 1000000,
          hardDailyCapCents: 1000000,
          expiresAt: NOW + 86400000,
        };

        const state: PolicyState = {
          pay: { c: captured, f: refunded, r: 0 },
          windowSum,
          dup: false,
          now: NOW,
        };

        const decision = decide({ amountCents: requestedCents }, mandate, state);

        // Hard rule: never allow refunding more than remains
        if (refunded + requestedCents > captured) {
          assert.notEqual(decision.status, 'allowed', 'Must not allow refund exceeding captured amount');
        }
      }
    ),
    { numRuns: 1000 }
  );
});

test('property: decisions are deterministic for same inputs', () => {
  fc.assert(
    fc.property(
      fc.record({
        captured: fc.integer({ min: 1, max: 100000 }),
        refunded: fc.integer({ min: 0, max: 100000 }),
        requestedCents: fc.integer({ min: 1, max: 100000 }),
        perActionCapCents: fc.integer({ min: 1000, max: 100000 }),
        hardMaxCents: fc.integer({ min: 5000, max: 100000 }),
        dailyCapCents: fc.integer({ min: 10000, max: 200000 }),
        hardDailyCapCents: fc.integer({ min: 20000, max: 300000 }),
      }),
      ({ captured, refunded, requestedCents, perActionCapCents, hardMaxCents, dailyCapCents, hardDailyCapCents }) => {
        const mandate: Mandate = {
          perActionCapCents,
          hardMaxCents,
          dailyCapCents,
          hardDailyCapCents,
          expiresAt: NOW + 86400000,
        };

        const state: PolicyState = {
          pay: { c: captured, f: refunded, r: 0 },
          windowSum: 0,
          dup: false,
          now: NOW,
        };

        const decision1 = decide({ amountCents: requestedCents }, mandate, state);
        const decision2 = decide({ amountCents: requestedCents }, mandate, state);

        // Same inputs = same outputs (deterministic)
        assert.equal(decision1.status, decision2.status);
        assert.equal(decision1.ruleId, decision2.ruleId);
        assert.equal(decision1.reason, decision2.reason);
      }
    ),
    { numRuns: 500 }
  );
});

test('property: hard caps are never bypassed regardless of approval', () => {
  fc.assert(
    fc.property(
      fc.record({
        captured: fc.integer({ min: 1, max: 1000000 }),
        requestedCents: fc.integer({ min: 1, max: 1000000 }),
        hardMaxCents: fc.integer({ min: 1000, max: 500000 }),
        hardDailyCapCents: fc.integer({ min: 10000, max: 500000 }),
        windowSum: fc.integer({ min: 0, max: 500000 }),
        approved: fc.boolean(),
      }),
      ({ captured, requestedCents, hardMaxCents, hardDailyCapCents, windowSum, approved }) => {
        const mandate: Mandate = {
          perActionCapCents: 50000,
          hardMaxCents,
          dailyCapCents: 100000,
          hardDailyCapCents,
          expiresAt: NOW + 86400000,
        };

        const state: PolicyState = {
          pay: { c: captured, f: 0, r: 0 },
          windowSum,
          dup: false,
          now: NOW,
          approved, // Even with approval
        };

        const decision = decide({ amountCents: requestedCents }, mandate, state);

        // Hard limits are NEVER bypassed, even with approval
        if (requestedCents > hardMaxCents) {
          assert.notEqual(decision.status, 'allowed', 'Hard max must block regardless of approval');
          assert.equal(decision.status, 'blocked');
        }

        if (windowSum + requestedCents > hardDailyCapCents) {
          assert.notEqual(decision.status, 'allowed', 'Hard daily cap must block regardless of approval');
          assert.equal(decision.status, 'blocked');
        }
      }
    ),
    { numRuns: 1000 }
  );
});
