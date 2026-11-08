// STAGE 1 TASK 1: Payout approval tests
import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { tempDb } from './helpers.ts';
import { checkPayout, approve } from '../server/dispatch.ts';
import type { Mandate } from '../server/types.ts';

const NOW = Date.now();
const baseMandate: Mandate = {
  perActionCapCents: 5000,
  hardMaxCents: 10000,
  dailyCapCents: 20000,
  hardDailyCapCents: 30000,
  expiresAt: NOW + 86400000,
  payoutPerPayeeCapCents: 8000,
  payoutDailyCapCents: 15000,
  payoutHardMaxCents: 12000,
  payoutEscalateNewPayee: true,
};

describe('STAGE 1 TASK 1: Payout approval', () => {
  test('approve then retry executes once', async () => {
    const { db } = await tempDb();
    const check1 = checkPayout(db, baseMandate, {
      actionId: 'act1', sessionId: 'sess1', tool: 'create_payout',
      payeeEmail: 'vendor@example.com', amountCents: 5000,
    }, NOW, 'sim');
    assert.equal(check1.status, 'pending_approval');
    const appr = approve(db, baseMandate, { actionId: 'act1', token: check1.token!, decision: 'approve' }, NOW, undefined, 'sim');
    assert.ok(appr.ok);
    const check2 = checkPayout(db, baseMandate, {
      actionId: 'act2', sessionId: 'sess1', tool: 'create_payout',
      payeeEmail: 'vendor@example.com', amountCents: 5000,
    }, NOW + 1000, 'sim');
    assert.equal(check2.status, 'reserved');
    db.close();
  });

  test('approval for payee A cannot pay payee B', async () => {
    const { db } = await tempDb();
    const c1 = checkPayout(db, baseMandate, {
      actionId: 'a1', sessionId: 's1', tool: 'create_payout',
      payeeEmail: 'A@ex.com', amountCents: 5000,
    }, NOW, 'sim');
    approve(db, baseMandate, { actionId: 'a1', token: c1.token!, decision: 'approve' }, NOW, undefined, 'sim');
    const c2 = checkPayout(db, baseMandate, {
      actionId: 'a2', sessionId: 's1', tool: 'create_payout',
      payeeEmail: 'B@ex.com', amountCents: 5000,
    }, NOW + 1000, 'sim');
    assert.equal(c2.status, 'pending_approval', 'Grant should not work for different payee');
    db.close();
  });

  test('second use of grant escalates again (single-use grants)', async () => {
    const { db } = await tempDb();
    const c1 = checkPayout(db, baseMandate, {
      actionId: 'a1', sessionId: 's1', tool: 'create_payout',
      payeeEmail: 'v@ex.com', amountCents: 5000,
    }, NOW, 'sim');
    approve(db, baseMandate, { actionId: 'a1', token: c1.token!, decision: 'approve' }, NOW, undefined, 'sim');
    const c2 = checkPayout(db, baseMandate, {
      actionId: 'a2', sessionId: 's1', tool: 'create_payout',
      payeeEmail: 'v@ex.com', amountCents: 5000,
    }, NOW + 1000, 'sim');
    assert.equal(c2.status, 'reserved', 'First retry with grant succeeds');
    // Grant is now consumed (used=1), third attempt should escalate again
    const c3 = checkPayout(db, baseMandate, {
      actionId: 'a3', sessionId: 's1', tool: 'create_payout',
      payeeEmail: 'v@ex.com', amountCents: 5000,
    }, NOW + 2000, 'sim');
    assert.equal(c3.status, 'pending_approval', 'Grant consumed, must re-approve');
    db.close();
  });

  test('expired mandate between approve and retry blocks', async () => {
    const { db } = await tempDb();
    const soon: Mandate = { ...baseMandate, expiresAt: NOW + 5000 };
    const c1 = checkPayout(db, soon, {
      actionId: 'a1', sessionId: 's1', tool: 'create_payout',
      payeeEmail: 'v@ex.com', amountCents: 5000,
    }, NOW, 'sim');
    approve(db, soon, { actionId: 'a1', token: c1.token!, decision: 'approve' }, NOW + 2000, undefined, 'sim');
    const expired: Mandate = { ...baseMandate, expiresAt: NOW + 5000 };
    const c2 = checkPayout(db, expired, {
      actionId: 'a2', sessionId: 's1', tool: 'create_payout',
      payeeEmail: 'v@ex.com', amountCents: 5000,
    }, NOW + 10000, 'sim');
    assert.equal(c2.status, 'blocked');
    assert.equal(c2.ruleId, 'R-MANDATE-EXPIRED');
    db.close();
  });
});

