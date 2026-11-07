import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';

async function seed(driver: 'better-sqlite3' | 'node:sqlite') {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-')), 't.db');
  const db = await openDb(path, { driver });
  applySchema(db);

  // Seed some test data
  db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source) VALUES ('DEMO-001',6000,0,0,'USD','seed')`);

  return { path, db };
}

for (const driver of ['better-sqlite3', 'node:sqlite'] as const) {
  describe(`HTTP endpoints (${driver})`, () => {
    test('GET /v1/ledger/checkpoint - creates and returns signed checkpoint', async () => {
      const { db } = await seed(driver);

      // Set up ED25519 key for signing
      process.env.ED25519_PRIVATE_KEY = Buffer.from('a'.repeat(32)).toString('base64');

      const { signCheckpoint, storeCheckpoint } = await import('../server/checkpoint.ts');
      const checkpoint = signCheckpoint(db);

      assert.ok(checkpoint, 'Checkpoint should be created');
      assert.ok(checkpoint.signature, 'Checkpoint should have signature');
      assert.ok(checkpoint.publicKey, 'Checkpoint should have publicKey');
      assert.equal(typeof checkpoint.seq, 'number', 'Checkpoint should have seq');
      assert.equal(typeof checkpoint.head, 'string', 'Checkpoint should have head');
      assert.equal(typeof checkpoint.timestamp, 'number', 'Checkpoint should have timestamp');

      // Store and verify we can retrieve it
      storeCheckpoint(db, checkpoint);

      delete process.env.ED25519_PRIVATE_KEY;
    });

    test('GET /v1/ledger/checkpoint - returns null when ED25519_PRIVATE_KEY not set', async () => {
      const { db } = await seed(driver);

      delete process.env.ED25519_PRIVATE_KEY;

      const { signCheckpoint } = await import('../server/checkpoint.ts');
      const checkpoint = signCheckpoint(db);

      assert.equal(checkpoint, null, 'Should return null when key not configured');
    });

    test('GET /v1/ledger/verify - verifies checkpoint and returns verification result', async () => {
      const { db } = await seed(driver);

      process.env.ED25519_PRIVATE_KEY = Buffer.from('a'.repeat(32)).toString('base64');

      const { signCheckpoint, storeCheckpoint, getLatestCheckpoint, verifyCheckpoint } = await import('../server/checkpoint.ts');

      // Create and store a checkpoint first
      const checkpoint = signCheckpoint(db);
      assert.ok(checkpoint, 'Checkpoint should be created');
      storeCheckpoint(db, checkpoint);

      // Verify it
      const retrieved = getLatestCheckpoint(db);
      assert.ok(retrieved, 'Should retrieve stored checkpoint');
      assert.deepEqual(retrieved, checkpoint, 'Retrieved checkpoint should match original');

      const verification = verifyCheckpoint(db, retrieved);
      assert.ok(verification, 'Verification result should exist');
      assert.equal(typeof verification.chainValid, 'boolean', 'Should have chainValid');
      assert.equal(typeof verification.signatureValid, 'boolean', 'Should have signatureValid');
      assert.equal(verification.seq, checkpoint.seq, 'Seq should match');
      assert.equal(verification.head, checkpoint.head, 'Head should match');

      delete process.env.ED25519_PRIVATE_KEY;
    });

    test('GET /v1/ledger/verify - returns null when no checkpoint exists', async () => {
      const { db } = await seed(driver);

      const { getLatestCheckpoint } = await import('../server/checkpoint.ts');
      const checkpoint = getLatestCheckpoint(db);

      assert.equal(checkpoint, null, 'Should return null when no checkpoint exists');
    });

    test('GET /v1/challenge/leaderboard - returns leaderboard structure', async () => {
      const { db } = await seed(driver);

      const { initChallengeSchema, getLeaderboard } = await import('../server/beat-the-gate.ts');

      initChallengeSchema(db);
      const leaderboard = getLeaderboard(db, 50);

      assert.ok(leaderboard, 'Leaderboard should exist');
      assert.equal(typeof leaderboard.totalAttempts, 'number', 'Should have totalAttempts');
      assert.equal(typeof leaderboard.totalSaved, 'number', 'Should have totalSaved');
      assert.equal(typeof leaderboard.totalLost, 'number', 'Should have totalLost');
      assert.ok(Array.isArray(leaderboard.recentAttempts), 'Should have recentAttempts array');
      assert.equal(leaderboard.totalAttempts, 0, 'Should start with 0 attempts');
    });

    test('POST /v1/challenge/attempt - kill switch detection works', async () => {
      process.env.REIN_DISABLE_CHALLENGE = '1';

      const { isKillSwitchActive } = await import('../server/beat-the-gate.ts');
      const active = isKillSwitchActive();

      assert.equal(active, true, 'Kill switch should be active');

      delete process.env.REIN_DISABLE_CHALLENGE;
    });

    test('POST /v1/challenge/attempt - returns recorded attempt when no API key', async () => {
      const { db } = await seed(driver);

      delete process.env.ANTHROPIC_API_KEY;

      const { initChallengeSchema, hasApiKey, getRecordedAttempt, recordAttempt } = await import('../server/beat-the-gate.ts');

      initChallengeSchema(db);

      assert.equal(hasApiKey(), false, 'Should not have API key');

      const recorded = getRecordedAttempt(0);
      assert.ok(recorded, 'Should get recorded attempt');
      assert.ok(recorded.message, 'Recorded attempt should have message');
      assert.ok(recorded.agentResponse, 'Recorded attempt should have agentResponse');
      assert.ok(Array.isArray(recorded.toolCalls), 'Recorded attempt should have toolCalls array');
      assert.equal(typeof recorded.gateDecision, 'string', 'Should have gateDecision');
      assert.equal(typeof recorded.savedCents, 'number', 'Should have savedCents');

      const id = recordAttempt(db, {
        ip: '127.0.0.1',
        message: 'Test message',
        agentResponse: recorded.agentResponse,
        toolCalls: recorded.toolCalls,
        gateDecision: recorded.gateDecision,
        gateRule: recorded.gateRule,
        requestedCents: recorded.requestedCents,
        refundedCents: recorded.refundedCents,
        savedCents: recorded.savedCents,
        lostCents: recorded.lostCents,
        mode: 'recorded',
      });

      assert.ok(id, 'Should return attempt ID');
      assert.ok(id.startsWith('challenge-'), 'ID should have correct prefix');
    });

    test('POST /v1/challenge/attempt - respects rate limit', async () => {
      const { db } = await seed(driver);

      const { initChallengeSchema, checkRateLimit } = await import('../server/beat-the-gate.ts');

      initChallengeSchema(db);

      const ip = '127.0.0.1';
      const now = Date.now();

      // First check should be allowed
      const check1 = checkRateLimit(db, ip, now);
      assert.equal(check1.allowed, true, 'First attempt should be allowed');
      assert.equal(check1.remaining, 3, 'Should have 3 remaining');
    });
  });
}
