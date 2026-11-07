// Payout action tests
import { strictEqual as eq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { decidePayout, usd, type PayoutPolicyState } from '../server/policy.ts';
import type { Mandate } from '../server/types.ts';

const tempDb = async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
  const db = await openDb(path);
  applySchema(db);
  return { db, close: () => db.close() };
};

const baseMandate: Mandate = {
  perActionCapCents: 5000,
  hardMaxCents: 10000,
  dailyCapCents: 20000,
  hardDailyCapCents: 40000,
  expiresAt: Date.now() + 86400000,
  payoutPerPayeeCapCents: 10000,
  payoutDailyCapCents: 50000,
  payoutHardMaxCents: 20000,
  payoutEscalateNewPayee: true,
  payoutAllowlist: [],
};

describe('Payout policy (deterministic, both drivers)', () => {
  test('valid payout to new payee escalates when escalateNewPayee=true', () => {
    const state: PayoutPolicyState = {
      payeeWindowSum: 0,
      totalWindowSum: 0,
      isNewPayee: true,
      isAllowlisted: false,
      now: Date.now(),
    };
    const decision = decidePayout('vendor@example.com', 5000, 'USD', baseMandate, state);
    eq(decision.status, 'pending_approval');
    eq(decision.ruleId, 'R-PAYOUT-NEW-PAYEE');
  });

  test('payout to allowlisted payee auto-allows even if new', () => {
    const mandate = { ...baseMandate, payoutAllowlist: ['trusted@example.com'] };
    const state: PayoutPolicyState = {
      payeeWindowSum: 0,
      totalWindowSum: 0,
      isNewPayee: true,
      isAllowlisted: true,
      now: Date.now(),
    };
    const decision = decidePayout('trusted@example.com', 5000, 'USD', mandate, state);
    eq(decision.status, 'allowed');
    eq(decision.ruleId, 'R-ALLOW');
  });

  test('payout exceeding per-payee cap escalates', () => {
    const state: PayoutPolicyState = {
      payeeWindowSum: 8000,
      totalWindowSum: 8000,
      isNewPayee: false,
      isAllowlisted: false,
      now: Date.now(),
    };
    const decision = decidePayout('vendor@example.com', 3000, 'USD', baseMandate, state);
    eq(decision.status, 'pending_approval');
    eq(decision.ruleId, 'R-PAYOUT-PAYEE-CAP');
  });

  test('payout exceeding daily hard cap blocks', () => {
    const state: PayoutPolicyState = {
      payeeWindowSum: 0,
      totalWindowSum: 48000,
      isNewPayee: false,
      isAllowlisted: false,
      now: Date.now(),
    };
    const decision = decidePayout('vendor@example.com', 3000, 'USD', baseMandate, state);
    eq(decision.status, 'blocked');
    eq(decision.ruleId, 'R-PAYOUT-DAILY-HARD');
  });

  test('payout exceeding hard max blocks', () => {
    const state: PayoutPolicyState = {
      payeeWindowSum: 0,
      totalWindowSum: 0,
      isNewPayee: false,
      isAllowlisted: false,
      now: Date.now(),
    };
    const decision = decidePayout('vendor@example.com', 25000, 'USD', baseMandate, state);
    eq(decision.status, 'blocked');
    eq(decision.ruleId, 'R-PAYOUT-HARD-MAX');
  });

  test('invalid payee email blocks', () => {
    const state: PayoutPolicyState = {
      payeeWindowSum: 0,
      totalWindowSum: 0,
      isNewPayee: false,
      isAllowlisted: false,
      now: Date.now(),
    };
    const decision = decidePayout('not-an-email', 1000, 'USD', baseMandate, state);
    eq(decision.status, 'blocked');
    eq(decision.ruleId, 'R-INVALID-PAYEE');
  });

  test('negative or zero amount blocks', () => {
    const state: PayoutPolicyState = {
      payeeWindowSum: 0,
      totalWindowSum: 0,
      isNewPayee: false,
      isAllowlisted: false,
      now: Date.now(),
    };
    const decision = decidePayout('vendor@example.com', 0, 'USD', baseMandate, state);
    eq(decision.status, 'blocked');
    eq(decision.ruleId, 'R-INVALID');
  });

  test('approved payout waives soft rules', () => {
    const state: PayoutPolicyState = {
      payeeWindowSum: 15000, // exceeds per-payee cap
      totalWindowSum: 15000,
      isNewPayee: true, // new payee
      isAllowlisted: false,
      now: Date.now(),
      approved: true,
    };
    const decision = decidePayout('vendor@example.com', 3000, 'USD', baseMandate, state);
    eq(decision.status, 'allowed');
    eq(decision.ruleId, 'R-APPROVED');
  });

  test('non-allowlisted payee escalates when allowlist is non-empty', () => {
    const mandate = { ...baseMandate, payoutAllowlist: ['trusted@example.com'] };
    const state: PayoutPolicyState = {
      payeeWindowSum: 0,
      totalWindowSum: 0,
      isNewPayee: false,
      isAllowlisted: false,
      now: Date.now(),
    };
    const decision = decidePayout('other@example.com', 1000, 'USD', mandate, state);
    eq(decision.status, 'pending_approval');
    eq(decision.ruleId, 'R-PAYOUT-NOT-ALLOWLISTED');
  });

  test('escalateNewPayee=false allows new payees', () => {
    const mandate = { ...baseMandate, payoutEscalateNewPayee: false };
    const state: PayoutPolicyState = {
      payeeWindowSum: 0,
      totalWindowSum: 0,
      isNewPayee: true,
      isAllowlisted: false,
      now: Date.now(),
    };
    const decision = decidePayout('newvendor@example.com', 2000, 'USD', mandate, state);
    eq(decision.status, 'allowed');
    eq(decision.ruleId, 'R-ALLOW');
  });
});

describe('Payout integration with dispatch (better-sqlite3)', () => {
  test('payout reserves capacity and records in ledger', async () => {
    const { db, close } = await tempDb();
    const now = Date.now();
    const sessionId = 'payout-session-1';

    // Insert a payout action
    db.run(
      `INSERT INTO actions (id, session_id, tool, action_type, payee_email, amount_cents, decision, rule_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'payout-1',
      sessionId,
      'create_payout',
      'payout',
      'vendor@example.com',
      5000,
      'allowed',
      'R-ALLOW',
      'Within the mandate.',
      'reserved',
      now,
      now
    );

    const action = db.one<{ amount_cents: number; payee_email: string; action_type: string }>(
      `SELECT amount_cents, payee_email, action_type FROM actions WHERE id = ?`,
      'payout-1'
    );
    ok(action);
    eq(action.amount_cents, 5000);
    eq(action.payee_email, 'vendor@example.com');
    eq(action.action_type, 'payout');

    close();
  });

  test('per-payee window sum calculation', async () => {
    const { db, close } = await tempDb();
    const now = Date.now();
    const sessionId = 'payout-session-2';
    const payee = 'contractor@example.com';

    // Insert multiple payouts to same payee
    for (let i = 0; i < 3; i++) {
      db.run(
        `INSERT INTO actions (id, session_id, tool, action_type, payee_email, amount_cents, decision, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `payout-${i}`,
        sessionId,
        'create_payout',
        'payout',
        payee,
        2000,
        'allowed',
        'executed',
        now - i * 1000,
        now - i * 1000
      );
    }

    // Calculate window sum for this payee
    const sum = db.val<number>(
      `SELECT COALESCE(SUM(amount_cents), 0) FROM actions
       WHERE session_id = ? AND payee_email = ? AND action_type = 'payout'
       AND status IN ('reserved', 'executed', 'approved_executed', 'unknown_outcome')
       AND created_at >= ?`,
      sessionId,
      payee,
      now - 86400000
    );
    eq(sum, 6000);

    close();
  });

  test('allowlist lookup', async () => {
    const { db, close } = await tempDb();
    const sessionId = 'payout-session-3';

    // Add to allowlist
    db.run(
      `INSERT INTO payee_allowlist (session_id, payee_email, added_at) VALUES (?, ?, ?)`,
      sessionId,
      'trusted@example.com',
      Date.now()
    );

    const isAllowlisted = db.val<number>(
      `SELECT COUNT(*) FROM payee_allowlist WHERE session_id = ? AND payee_email = ?`,
      sessionId,
      'trusted@example.com'
    );
    eq(isAllowlisted, 1);

    const notAllowlisted = db.val<number>(
      `SELECT COUNT(*) FROM payee_allowlist WHERE session_id = ? AND payee_email = ?`,
      sessionId,
      'untrusted@example.com'
    );
    eq(notAllowlisted, 0);

    close();
  });

  test('new payee detection', async () => {
    const { db, close } = await tempDb();
    const sessionId = 'payout-session-4';
    const now = Date.now();

    // Check new payee
    const newPayeeCount = db.val<number>(
      `SELECT COUNT(*) FROM actions WHERE session_id = ? AND payee_email = ? AND action_type = 'payout' AND status IN ('executed', 'approved_executed')`,
      sessionId,
      'newvendor@example.com'
    );
    eq(newPayeeCount, 0); // New payee

    // Add a payout
    db.run(
      `INSERT INTO actions (id, session_id, tool, action_type, payee_email, amount_cents, decision, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'payout-first',
      sessionId,
      'create_payout',
      'payout',
      'newvendor@example.com',
      1000,
      'allowed',
      'executed',
      now,
      now
    );

    // Now not new
    const existingPayeeCount = db.val<number>(
      `SELECT COUNT(*) FROM actions WHERE session_id = ? AND payee_email = ? AND action_type = 'payout' AND status IN ('executed', 'approved_executed')`,
      sessionId,
      'newvendor@example.com'
    );
    eq(existingPayeeCount, 1);

    close();
  });
});

describe('Payout integration with dispatch (node:sqlite)', () => {
  test('payout reserves capacity and records in ledger', async () => {
    const origDriver = process.env.REIN_DB_DRIVER;
    process.env.REIN_DB_DRIVER = 'node:sqlite';

    const { db, close } = await tempDb();
    const now = Date.now();
    const sessionId = 'payout-session-node-1';

    db.run(
      `INSERT INTO actions (id, session_id, tool, action_type, payee_email, amount_cents, decision, rule_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'payout-node-1',
      sessionId,
      'create_payout',
      'payout',
      'vendor@example.com',
      5000,
      'allowed',
      'R-ALLOW',
      'Within the mandate.',
      'reserved',
      now,
      now
    );

    const action = db.one<{ amount_cents: number; payee_email: string; action_type: string }>(
      `SELECT amount_cents, payee_email, action_type FROM actions WHERE id = ?`,
      'payout-node-1'
    );
    ok(action);
    eq(action.amount_cents, 5000);
    eq(action.payee_email, 'vendor@example.com');
    eq(action.action_type, 'payout');

    close();

    if (origDriver) process.env.REIN_DB_DRIVER = origDriver;
    else delete process.env.REIN_DB_DRIVER;
  });

  test('per-payee window sum calculation works on node:sqlite', async () => {
    const origDriver = process.env.REIN_DB_DRIVER;
    process.env.REIN_DB_DRIVER = 'node:sqlite';

    const { db, close } = await tempDb();
    const now = Date.now();
    const sessionId = 'payout-session-node-2';
    const payee = 'contractor@example.com';

    for (let i = 0; i < 3; i++) {
      db.run(
        `INSERT INTO actions (id, session_id, tool, action_type, payee_email, amount_cents, decision, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `payout-node-${i}`,
        sessionId,
        'create_payout',
        'payout',
        payee,
        2000,
        'allowed',
        'executed',
        now - i * 1000,
        now - i * 1000
      );
    }

    const sum = db.val<number>(
      `SELECT COALESCE(SUM(amount_cents), 0) FROM actions
       WHERE session_id = ? AND payee_email = ? AND action_type = 'payout'
       AND status IN ('reserved', 'executed', 'approved_executed', 'unknown_outcome')
       AND created_at >= ?`,
      sessionId,
      payee,
      now - 86400000
    );
    eq(sum, 6000);

    close();

    if (origDriver) process.env.REIN_DB_DRIVER = origDriver;
    else delete process.env.REIN_DB_DRIVER;
  });
});
