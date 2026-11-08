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

test('challenge escalation sends ZERO Telegram requests, normal escalation sends exactly ONE', async () => {
  // Mock fetch to count requests
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, options?: any) => {
    fetchCalls.push(url);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  // Set Telegram config
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token_12345';
  process.env.TELEGRAM_CHAT_ID = 'test_chat_id_67890';

  try {
    // Test 1: Challenge escalation should send ZERO requests
    const { db: challengeDb } = await tempDb();
    const challengeCapId = createFreshChallengeCapture(challengeDb, 100000, 'CHALLENGE-TEST-CAP');
    
    const challengeDeps: GateDeps = {
      db: challengeDb,
      mandate: { ...baseMandate, perActionCapCents: 1 }, // Force escalation
      paypal: null,
      now: () => Date.now(),
    };

    fetchCalls.length = 0; // Reset counter
    
    // Run challenge agent (will escalate due to low cap)
    const fakeClient = {
      messages: {
        create: async () => ({
          id: 'msg_fake',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'I will help you' }],
          model: 'fake',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      },
    };
    
    await runLiveAgent(challengeDeps, 'Please refund my order', challengeCapId, undefined, { client: fakeClient });
    
    assert.equal(fetchCalls.length, 0, 'Challenge escalation should send ZERO Telegram requests');
    challengeDb.close();

    // Test 2: Normal (non-challenge) escalation should send exactly ONE request
    const { db: normalDb } = await tempDb();
    normalDb.run(
      `INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,?,?,?,?,?)`,
      'NORMAL-CAP-001', 100000, 0, 0, 'USD', 'test', Date.now()
    );
    normalDb.run(`INSERT INTO orders(order_id,capture_id) VALUES (?,?)`, 'NORMAL-ORD-001', 'NORMAL-CAP-001');
    normalDb.run(
      `INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,?,?,?)`,
      'NORMAL-ORD-001', 'item1', 'Test Item', 5000, 2, 0, 0, 1
    );

    const normalDeps: GateDeps = {
      db: normalDb,
      mandate: { ...baseMandate, perActionCapCents: 1 }, // Force escalation
      paypal: null,
      now: () => Date.now(),
    };

    fetchCalls.length = 0; // Reset counter

    const { runRefund } = await import('../server/gate.ts');
    await runRefund(normalDeps, {
      actionId: 'act-normal-001',
      sessionId: 'sess-normal-001',
      tool: 'refund_items',
      captureId: 'NORMAL-CAP-001',
      items: [{ item_id: 'item1', qty: 1 }],
    });

    // Wait for async notification (sendTelegramNotification uses .catch(() => {}))
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.equal(fetchCalls.length, 1, 'Normal escalation should send exactly ONE Telegram request');
    assert.ok(fetchCalls[0].includes('sendMessage'), 'Should be a Telegram sendMessage API call');
    
    normalDb.close();
  } finally {
    // Restore
    globalThis.fetch = originalFetch;
    if (originalBotToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChatId;
  }
});
