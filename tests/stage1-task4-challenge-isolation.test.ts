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

test('challenge escalation sends ZERO Telegram requests (via silenceNotifications)', async () => {
  // This test requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to be set
  // Mark as NOT VERIFIED if these env vars are missing
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log('⚠️  Telegram test marked NOT VERIFIED (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    return;
  }

  const { db, close } = await tempDb();
  const { checkRefund } = await import('../server/gate.ts');

  // Track fetch calls to Telegram API
  const originalFetch = global.fetch;
  let telegramRequestCount = 0;

  global.fetch = async (url: any, ...args: any[]) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('api.telegram.org')) {
      telegramRequestCount++;
    }
    return originalFetch(url, ...args);
  };

  try {
    // Seed challenge DB with items that will trigger escalation
    const captureId = createFreshChallengeCapture(db);

    // Set up mandate that will escalate when refunding all items
    const escalatingMandate: Mandate = {
      ...baseMandate,
      itemAllEscalates: true, // Escalate when all items requested
    };

    // Silence notifications for this database (this is what runLiveAgent does)
    const { silenceNotifications } = await import('../server/dispatch.ts');
    silenceNotifications(db);

    // Request refund that will escalate
    const result = checkRefund(
      {
        db,
        mandate: escalatingMandate,
        paypal: null,
        now: () => Date.now(),
      },
      {
        actionId: 'test-challenge-' + Date.now(),
        tool: 'refund_items',
        sessionId: 'challenge-session',
        captureId,
        items: [{ item_id: 'mug', qty: 1 }], // All items = escalation
        noteToPayer: 'Test escalation',
      },
      Date.now()
    );

    // Verify the action escalated
    assert.equal(result.status, 'pending_approval', 'Should escalate to approval');

    // Verify ZERO Telegram requests were made
    assert.equal(telegramRequestCount, 0, 'Challenge escalation should send ZERO Telegram requests');

    close();
  } finally {
    global.fetch = originalFetch;
  }
});

test('normal (non-challenge) escalation sends exactly ONE Telegram request', async () => {
  // This test requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to be set
  // Mark as NOT VERIFIED if these env vars are missing
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log('⚠️  Telegram test marked NOT VERIFIED (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
    return;
  }

  const { db, close } = await tempDb();
  const { checkRefund } = await import('../server/gate.ts');

  // Track fetch calls to Telegram API
  const originalFetch = global.fetch;
  let telegramRequestCount = 0;
  const telegramCalls: any[] = [];

  global.fetch = async (url: any, ...args: any[]) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('api.telegram.org')) {
      telegramRequestCount++;
      telegramCalls.push({ url: urlStr, args });
      // Return mock success response
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      } as any;
    }
    return originalFetch(url, ...args);
  };

  try {
    // Seed normal DB with items that will trigger escalation
    db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,?,?,?,?,?)`,
      'NORMAL-CAP-1', 5000, 0, 0, 'USD', 'normal', Date.now());
    db.run(`INSERT INTO orders(order_id,capture_id) VALUES (?,?)`, 'ORDER-1', 'NORMAL-CAP-1');
    db.run(`INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty) VALUES (?,?,?,?,?,?,?)`,
      'ORDER-1', 'mug', 'Coffee Mug', 1800, 1, 0, 0);

    // Set up mandate that will escalate when refunding all items
    const escalatingMandate: Mandate = {
      ...baseMandate,
      itemAllEscalates: true, // Escalate when all items requested
    };

    // DO NOT silence notifications for this normal database

    // Request refund that will escalate
    const result = checkRefund(
      {
        db,
        mandate: escalatingMandate,
        paypal: null,
        now: () => Date.now(),
      },
      {
        actionId: 'test-normal-' + Date.now(),
        tool: 'refund_items',
        sessionId: 'normal-session',
        captureId: 'NORMAL-CAP-1',
        items: [{ item_id: 'mug', qty: 1 }], // All items = escalation
        noteToPayer: 'Test normal escalation',
      },
      Date.now()
    );

    // Verify the action escalated
    assert.equal(result.status, 'pending_approval', 'Should escalate to approval');

    // Give Telegram notification async call time to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify exactly ONE Telegram request was made
    assert.equal(telegramRequestCount, 1, 'Normal escalation should send exactly ONE Telegram request');
    assert.equal(telegramCalls.length, 1, 'Should have exactly one Telegram API call');
    assert.ok(telegramCalls[0].url.includes('sendMessage'), 'Should call Telegram sendMessage API');

    close();
  } finally {
    global.fetch = originalFetch;
  }
});
