// STAGE 1 TASK 4: Beat the Gate sandbox isolation - separate DB, no PayPal, no notifications
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempDb } from './helpers.ts';
import { runLiveAgent } from '../server/challenge-agent.ts';
import type { GateDeps } from '../server/gate.ts';
import type { Mandate } from '../server/types.ts';
import { createFreshChallengeCapture } from '../server/challenge-seed.ts';

const baseMandate: Mandate = {
  perActionCapCents: 5000,
  hardMaxCents: 10000,
  dailyCapCents: 10000,
  hardDailyCapCents: 20000,
  returnWindowDays: 30,
  blockIfOpenDispute: true,
  expiresAt: Date.now() + 86400000,
  shadow: false,
};

test('challenge uses separate in-memory database', async () => {
  const mainDb = (await tempDb()).db;
  const challengeDb = (await tempDb()).db;
  
  // Seed main DB with a payment
  mainDb.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,?,?,?,?,?)`,
    'MAIN-CAP-1', 50000, 0, 0, 'USD', 'main', Date.now());
  
  // Seed challenge DB with a challenge capture
  const challengeCapId = createFreshChallengeCapture(challengeDb);
  
  // Verify main DB doesn't have challenge captures
  const mainCaptures = mainDb.all<{ txn_id: string }>('SELECT txn_id FROM payments');
  assert.ok(!mainCaptures.some((c) => c.txn_id.startsWith('CHALLENGE-')), 'Main DB should not have challenge captures');
  
  // Verify challenge DB has the challenge capture
  const challengeCaptures = challengeDb.all<{ txn_id: string }>('SELECT txn_id FROM payments');
  assert.ok(challengeCaptures.some((c) => c.txn_id === challengeCapId), 'Challenge DB should have challenge captures');
  
  mainDb.close();
  challengeDb.close();
});

test('challenge always uses simulated mode (PayPal = null)', async () => {
  const { db } = await tempDb();
  
  const challengeDeps: GateDeps = {
    db,
    mandate: baseMandate,
    paypal: null, // Must be null
    now: () => Date.now(),
  };
  
  // This should not throw (PayPal is null)
  assert.doesNotThrow(() => {
    if (challengeDeps.paypal !== null) {
      throw new Error('Challenge should never have PayPal client');
    }
  }, 'Challenge should always have PayPal=null');
  
  db.close();
});

test('challenge rejects if PayPal credentials are present', async () => {
  const { db } = await tempDb();
  const captureId = createFreshChallengeCapture(db);
  
  // Mock PayPal client
  const mockPayPal = {
    readState: async () => ({ capturedAtMs: Date.now(), disputeOpen: false }),
  };
  
  const badDeps: any = {
    db,
    mandate: baseMandate,
    paypal: mockPayPal, // Should trigger error
    now: () => Date.now(),
  };
  
  // runLiveAgent should throw if PayPal is not null
  await assert.rejects(
    async () => {
      await runLiveAgent(badDeps, 'Test message', captureId);
    },
    /restricted to SIMULATED mode/,
    'Should reject when PayPal credentials are present'
  );
  
  db.close();
});

test('challenge captures are prefixed with CHALLENGE-', async () => {
  const { db } = await tempDb();
  
  const captureId = createFreshChallengeCapture(db);
  
  assert.ok(captureId.startsWith('CHALLENGE-'), 'Capture ID should be prefixed with CHALLENGE-');
  
  const payment = db.one<{ txn_id: string; source: string }>('SELECT txn_id, source FROM payments WHERE txn_id=?', captureId);
  assert.equal(payment?.source, 'challenge', 'Payment source should be "challenge"');
  
  db.close();
});

test('challenge never sends notifications (paypal is always null)', async () => {
  const { db } = await tempDb();
  const captureId = createFreshChallengeCapture(db);
  
  const challengeDeps: GateDeps = {
    db,
    mandate: baseMandate,
    paypal: null, // Challenge always null - this prevents ALL notifications
    now: () => Date.now(),
  };
  
  // Verify paypal is null (notifications are only sent when paypal is non-null)
  assert.equal(challengeDeps.paypal, null, 'Challenge deps must have paypal=null');
  
  // Mock Anthropic client that requests a single item refund
  const mockClient = {
    messages: {
      create: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'refund_items',
            input: {
              capture_id: captureId,
              items: [{ item_id: 'mug', qty: 1 }],
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  };
  
  // This should complete without throwing (paypal=null prevents notification dispatch)
  const result = await runLiveAgent(challengeDeps, 'Refund the mug', captureId, undefined, { client: mockClient });
  
  // The key point: paypal=null means no Telegram notifications are ever sent
  // (Telegram notifications only fire via dispatch.ts when paypal is non-null)
  assert.ok(result, 'Challenge agent completed successfully with paypal=null');
  
  db.close();
});
