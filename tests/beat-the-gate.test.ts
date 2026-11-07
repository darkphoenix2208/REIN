// Beat the Gate challenge tests
import { strictEqual as eq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import {
  initChallengeSchema,
  checkRateLimit,
  getTotalSpent,
  recordAttempt,
  getLeaderboard,
  getRecordedAttempt,
  isKillSwitchActive,
  hasApiKey,
} from '../server/beat-the-gate.ts';

const tempDb = async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
  const db = await openDb(path);
  applySchema(db);
  initChallengeSchema(db);
  return { db, close: () => db.close() };
};

describe('Beat the Gate challenge', () => {
  test('initChallengeSchema creates tables', async () => {
    const { db, close } = await tempDb();
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='challenge_attempts'"
    );
    ok(tables.length > 0, 'challenge_attempts table created');
    close();
  });

  test('rate limit checks work', async () => {
    const { db, close } = await tempDb();
    const now = Date.now();

    // First attempt should be allowed
    const check1 = checkRateLimit(db, '127.0.0.1', now);
    eq(check1.allowed, true);
    eq(check1.remaining, 3);

    // Record attempts
    for (let i = 0; i < 3; i++) {
      recordAttempt(db, {
        ip: '127.0.0.1',
        message: `Test ${i}`,
        agentResponse: 'Response',
        toolCalls: [],
        gateDecision: 'allowed',
        gateRule: 'R-ALLOW',
        requestedCents: 1800,
        refundedCents: 1800,
        savedCents: 0,
        lostCents: 1800,
        mode: 'recorded',
      });
    }

    // Fourth attempt should be rate limited
    const check2 = checkRateLimit(db, '127.0.0.1', now);
    eq(check2.allowed, false);
    eq(check2.remaining, 0);

    close();
  });

  test('total spent calculation', async () => {
    const { db, close } = await tempDb();

    recordAttempt(db, {
      ip: '127.0.0.1',
      message: 'Test 1',
      agentResponse: 'Response',
      toolCalls: [],
      gateDecision: 'allowed',
      gateRule: 'R-ALLOW',
      requestedCents: 1800,
      refundedCents: 1800,
      savedCents: 0,
      lostCents: 1800,
      mode: 'recorded',
    });

    recordAttempt(db, {
      ip: '127.0.0.2',
      message: 'Test 2',
      agentResponse: 'Response',
      toolCalls: [],
      gateDecision: 'blocked',
      gateRule: 'R-OVER-CAPTURE',
      requestedCents: 5000,
      refundedCents: 0,
      savedCents: 5000,
      lostCents: 0,
      mode: 'recorded',
    });

    const spent = getTotalSpent(db);
    eq(spent, 1800, 'Only lost cents counted');

    close();
  });

  test('leaderboard shows attempts', async () => {
    const { db, close } = await tempDb();

    for (let i = 0; i < 5; i++) {
      recordAttempt(db, {
        ip: `127.0.0.${i}`,
        message: `Attempt ${i}`,
        agentResponse: 'Response',
        toolCalls: [],
        gateDecision: i % 2 === 0 ? 'blocked' : 'allowed',
        gateRule: i % 2 === 0 ? 'R-DUP' : 'R-ALLOW',
        requestedCents: 1800,
        refundedCents: i % 2 === 0 ? 0 : 1800,
        savedCents: i % 2 === 0 ? 1800 : 0,
        lostCents: i % 2 === 0 ? 0 : 1800,
        mode: 'recorded',
      });
    }

    const leaderboard = getLeaderboard(db, 10);
    eq(leaderboard.totalAttempts, 5);
    eq(leaderboard.totalSaved, 5400); // 3 blocked * 1800
    eq(leaderboard.totalLost, 3600); // 2 allowed * 1800
    ok(leaderboard.recentAttempts.length > 0);

    close();
  });

  test('recorded attempts work', () => {
    const attempt1 = getRecordedAttempt(0);
    ok(attempt1.id.startsWith('recorded-'));
    ok(attempt1.message.length > 0);
    eq(attempt1.mode, 'recorded');

    const attempt2 = getRecordedAttempt(1);
    ok(attempt2.id !== attempt1.id);
  });

  test('kill switch detection', () => {
    const orig = process.env.REIN_DISABLE_CHALLENGE;
    delete process.env.REIN_DISABLE_CHALLENGE;
    eq(isKillSwitchActive(), false);

    process.env.REIN_DISABLE_CHALLENGE = '1';
    eq(isKillSwitchActive(), true);

    if (orig) process.env.REIN_DISABLE_CHALLENGE = orig;
    else delete process.env.REIN_DISABLE_CHALLENGE;
  });

  test('API key detection', () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    eq(hasApiKey(), false);

    process.env.ANTHROPIC_API_KEY = 'sk-test';
    eq(hasApiKey(), true);

    if (orig) process.env.ANTHROPIC_API_KEY = orig;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  test('IP anonymization in leaderboard', async () => {
    const { db, close } = await tempDb();

    recordAttempt(db, {
      ip: '192.168.1.100',
      message: 'Test',
      agentResponse: 'Response',
      toolCalls: [],
      gateDecision: 'allowed',
      gateRule: 'R-ALLOW',
      requestedCents: 1800,
      refundedCents: 1800,
      savedCents: 0,
      lostCents: 1800,
      mode: 'recorded',
    });

    const leaderboard = getLeaderboard(db, 10);
    const attempt = leaderboard.recentAttempts[0];
    ok(attempt.ip.includes('***'), 'IP anonymized');
    ok(!attempt.ip.includes('192.168.1.100'), 'Full IP not exposed');

    close();
  });
});
