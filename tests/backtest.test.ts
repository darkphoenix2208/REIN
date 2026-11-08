// Mandate backtest and replay tests
import { strictEqual as eq, deepStrictEqual as deq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { createApp } from '../server/app.ts';
import { loadMandate } from '../server/config.ts';
import { fileURLToPath } from 'node:url';
import {
  replayMandate,
  backtestMandate,
  BacktestRequestSchema,
  SaveMandateVersionSchema,
  type RecordedAction,
} from '../server/backtest.ts';
import type { Mandate, PayRow } from '../server/types.ts';

const __dir = fileURLToPath(new URL('.', import.meta.url));
const MANDATE = loadMandate(join(__dir, '..', 'mandate.json'));

const tempDb = async (driver: 'better-sqlite3' | 'node:sqlite' = 'better-sqlite3') => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
  const db = await openDb(path, { driver });
  applySchema(db);
  return { db, close: () => db.close() };
};

function request(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: object
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(app);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as any).port as number;
      const payload = body ? JSON.stringify(body) : undefined;
      const opts: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload).toString() } : {}),
        },
      };
      const req = http.request(opts, (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          srv.close();
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode!, body: text });
          }
        });
      });
      req.on('error', (e) => {
        srv.close();
        reject(e);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

describe('Mandate backtest (pure functions)', () => {
  const sampleOrders: Record<string, PayRow> = {
    'CAP-1': { c: 10000, f: 0, r: 0, cur: 'USD', capturedAt: 1000 },
    'CAP-2': { c: 20000, f: 0, r: 0, cur: 'USD', capturedAt: 2000 },
  };

  const sampleActions: RecordedAction[] = [
    {
      id: 'act-1',
      sessionId: 'sess-1',
      tool: 'refund_items',
      captureId: 'CAP-1',
      amountCents: 1800, // $18
      decision: 'allowed',
      ruleId: 'R-ALLOW',
      createdAt: 5000,
    },
    {
      id: 'act-2',
      sessionId: 'sess-1',
      tool: 'refund_items',
      captureId: 'CAP-1',
      amountCents: 3500, // $35
      decision: 'allowed',
      ruleId: 'R-ALLOW',
      createdAt: 10000,
    },
    {
      id: 'act-3',
      sessionId: 'sess-2',
      tool: 'refund_items',
      captureId: 'CAP-2',
      amountCents: 7500, // $75
      decision: 'pending_approval',
      ruleId: 'R-ACTION-CAP',
      createdAt: 15000,
    },
  ];

  test('determinism: calling replayMandate twice yields strictly identical results', () => {
    const candidate: Mandate = {
      ...MANDATE,
      perActionCapCents: 2000, // $20
    };

    const res1 = replayMandate(sampleActions, candidate, sampleOrders);
    const res2 = replayMandate(sampleActions, candidate, sampleOrders);

    deq(res1, res2, 'Replay mandate must be 100% deterministic with zero variance');
  });

  test('tightened cap changes exactly the expected decisions', () => {
    // Current mandate cap is $50. Candidate mandate cap is $20.
    // $18: stays allowed
    // $35: changes from allowed to pending_approval (R-ACTION-CAP)
    // $75: was pending_approval, stays pending_approval
    const candidate: Mandate = {
      ...MANDATE,
      perActionCapCents: 2000, // $20
    };

    const res = replayMandate(sampleActions, candidate, sampleOrders);

    eq(res.totalActions, 3);
    eq(res.changedDecisions, 1, 'Exactly one decision changed');
    eq(res.stricterCount, 1, 'Exactly one decision became stricter');
    eq(res.looserCount, 0, 'No decisions became looser');
    eq(res.dollarsEscalatedDifferently, 3500, '$35 was escalated differently');

    const act2Diff = res.results.find((r) => r.actionId === 'act-2');
    ok(act2Diff);
    eq(act2Diff.changed, true);
    eq(act2Diff.originalDecision, 'allowed');
    eq(act2Diff.candidateDecision, 'pending_approval');
    eq(act2Diff.candidateRule, 'R-ACTION-CAP');
    eq(act2Diff.impact, 'stricter');

    const act1Diff = res.results.find((r) => r.actionId === 'act-1');
    ok(act1Diff);
    eq(act1Diff.changed, false);
    eq(act1Diff.candidateDecision, 'allowed');
  });

  test('invalid mandates rejected by schema', () => {
    // Negative cap
    const neg = BacktestRequestSchema.safeParse({
      candidate: { perActionCapCents: -500, hardMaxCents: 100, dailyCapCents: 200, hardDailyCapCents: 300 },
    });
    eq(neg.success, false, 'Negative cap rejected');

    // Missing required fields
    const missing = BacktestRequestSchema.safeParse({
      candidate: { perActionCapCents: 1000 },
    });
    eq(missing.success, false, 'Missing required caps rejected');

    // Empty approver for mandate version save
    const noApprover = SaveMandateVersionSchema.safeParse({
      mandate: MANDATE,
      approver: '',
    });
    eq(noApprover.success, false, 'Empty approver rejected');
  });

  test('IDENTITY: replaying under SAME mandate changes nothing', () => {
    const actions: RecordedAction[] = [
      {
        id: 'act-1',
        sessionId: 'sess-1',
        tool: 'refund_items',
        captureId: 'CAP-1',
        amountCents: 1800,
        decision: 'allowed',
        ruleId: 'R-ALLOW',
        createdAt: 5000,
      },
      {
        id: 'act-2',
        sessionId: 'sess-1',
        tool: 'refund_items',
        captureId: 'CAP-1',
        amountCents: 7500,
        decision: 'pending_approval',
        ruleId: 'R-ACTION-CAP',
        createdAt: 10000,
      },
      {
        id: 'act-3',
        sessionId: 'sess-2',
        tool: 'refund_items',
        captureId: 'CAP-2',
        amountCents: 15000,
        decision: 'blocked',
        ruleId: 'R-HARD-MAX',
        createdAt: 15000,
      },
    ];

    const orders: Record<string, PayRow> = {
      'CAP-1': { c: 10000, f: 0, r: 0, cur: 'USD', capturedAt: 1000 },
      'CAP-2': { c: 20000, f: 0, r: 0, cur: 'USD', capturedAt: 2000 },
    };

    // Replay under the SAME mandate
    const result = replayMandate(actions, MANDATE, orders);

    eq(result.totalActions, 3, 'Processed all 3 actions');
    eq(result.changedDecisions, 0, 'IDENTITY: no decisions should change');
    eq(result.stricterCount, 0, 'No stricter decisions');
    eq(result.looserCount, 0, 'No looser decisions');
    eq(result.dollarsBlockedDifferently, 0, 'No change in blocked dollars');
    eq(result.dollarsEscalatedDifferently, 0, 'No change in escalated dollars');
    eq(result.dollarsAllowedDifferently, 0, 'No change in allowed dollars');

    // Verify each action's decision matches original
    for (const detail of result.results) {
      eq(detail.changed, false, `Action ${detail.actionId} should not change`);
      eq(detail.candidateDecision, detail.originalDecision, `Decision should match original`);
      eq(detail.candidateRule, detail.originalRule, `Rule should match original`);
      eq(detail.impact, 'same', `Impact should be 'same'`);
      eq(detail.dollarEffect, 0, `Dollar effect should be 0`);
    }
  });

  test('TIGHTENED CAP: exactly which decisions and dollars change', () => {
    const actions: RecordedAction[] = [
      {
        id: 'act-1',
        sessionId: 'sess-1',
        tool: 'refund_items',
        captureId: 'CAP-1',
        amountCents: 1800, // $18 - was allowed
        decision: 'allowed',
        ruleId: 'R-ALLOW',
        createdAt: 5000,
      },
      {
        id: 'act-2',
        sessionId: 'sess-1',
        tool: 'refund_items',
        captureId: 'CAP-1',
        amountCents: 3500, // $35 - was allowed, will escalate with $20 cap
        decision: 'allowed',
        ruleId: 'R-ALLOW',
        createdAt: 10000,
      },
      {
        id: 'act-3',
        sessionId: 'sess-2',
        tool: 'refund_items',
        captureId: 'CAP-2',
        amountCents: 7500, // $75 - was escalated, stays escalated
        decision: 'pending_approval',
        ruleId: 'R-ACTION-CAP',
        createdAt: 15000,
      },
    ];

    const orders: Record<string, PayRow> = {
      'CAP-1': { c: 10000, f: 0, r: 0, cur: 'USD', capturedAt: 1000 },
      'CAP-2': { c: 20000, f: 0, r: 0, cur: 'USD', capturedAt: 2000 },
    };

    const tightenedMandate: Mandate = {
      ...MANDATE,
      perActionCapCents: 2000, // Tightened from $60 to $20
    };

    const result = replayMandate(actions, tightenedMandate, orders);

    eq(result.totalActions, 3, 'Processed all 3 actions');
    eq(result.changedDecisions, 1, 'Exactly 1 decision changed');
    eq(result.stricterCount, 1, 'Exactly 1 stricter decision');
    eq(result.looserCount, 0, 'No looser decisions');

    // act-2 should be the only change: allowed -> pending_approval
    const act2 = result.results.find((r) => r.actionId === 'act-2');
    ok(act2, 'act-2 exists in results');
    eq(act2!.changed, true, 'act-2 changed');
    eq(act2!.originalDecision, 'allowed', 'act-2 was allowed');
    eq(act2!.candidateDecision, 'pending_approval', 'act-2 now escalates');
    eq(act2!.impact, 'stricter', 'Impact is stricter');
    eq(act2!.dollarEffect, 3500, 'Dollar effect is $35');

    eq(result.dollarsEscalatedDifferently, 3500, 'Exactly $35 escalated differently');
    eq(result.dollarsAllowedDifferently, 0, 'No additional dollars allowed');
    eq(result.dollarsBlockedDifferently, 0, 'No change in blocked dollars');

    // act-1 and act-3 should NOT change
    const act1 = result.results.find((r) => r.actionId === 'act-1');
    eq(act1!.changed, false, 'act-1 unchanged');
    eq(act1!.candidateDecision, 'allowed', 'act-1 still allowed');

    const act3 = result.results.find((r) => r.actionId === 'act-3');
    eq(act3!.changed, false, 'act-3 unchanged');
    eq(act3!.candidateDecision, 'pending_approval', 'act-3 still escalated');
  });

  test('LOOSENED CAP: stricter to looser changes', () => {
    const actions: RecordedAction[] = [
      {
        id: 'act-1',
        sessionId: 'sess-1',
        tool: 'refund_items',
        captureId: 'CAP-1',
        amountCents: 7500, // $75 - was escalated due to $50 cap
        decision: 'pending_approval',
        ruleId: 'R-ACTION-CAP',
        createdAt: 5000,
      },
    ];

    const orders: Record<string, PayRow> = {
      'CAP-1': { c: 10000, f: 0, r: 0, cur: 'USD', capturedAt: 1000 },
    };

    const loosenedMandate: Mandate = {
      ...MANDATE,
      perActionCapCents: 10000, // Loosened from $50 to $100
    };

    const result = replayMandate(actions, loosenedMandate, orders);

    eq(result.totalActions, 1, 'Processed 1 action');
    eq(result.changedDecisions, 1, 'Decision changed');
    eq(result.stricterCount, 0, 'No stricter decisions');
    eq(result.looserCount, 1, 'One looser decision');

    // act-1: escalated -> allowed
    const act1 = result.results.find((r) => r.actionId === 'act-1');
    eq(act1!.changed, true, 'act-1 changed');
    eq(act1!.originalDecision, 'pending_approval', 'Was escalated');
    eq(act1!.candidateDecision, 'allowed', 'Now allowed');
    eq(act1!.impact, 'looser', 'Impact is looser');

    eq(result.dollarsAllowedDifferently, 7500, '$75 allowed differently');
    eq(result.dollarsEscalatedDifferently, 0, 'No additional dollars escalated');
    eq(result.dollarsBlockedDifferently, 0, 'No additional dollars blocked');
  });

  test('capture missing from snapshot triggers state unavailable', () => {
    const actions: RecordedAction[] = [
      {
        id: 'act-1',
        sessionId: 'sess-1',
        tool: 'refund_items',
        captureId: 'CAP-MISSING', // Capture not in snapshot
        amountCents: 2000,
        decision: 'pending_approval',
        ruleId: 'R-STATE-UNAVAILABLE',
        createdAt: 5000,
      },
      {
        id: 'act-2',
        sessionId: 'sess-2',
        tool: 'refund_items',
        captureId: 'CAP-MISSING2',
        amountCents: 1500,
        decision: 'allowed', // Was allowed, but capture missing in backtest
        ruleId: 'R-ALLOW',
        createdAt: 10000,
      },
    ];

    const orders: Record<string, PayRow> = {
      // CAP-MISSING and CAP-MISSING2 are NOT in the snapshot
    };

    const result = replayMandate(actions, MANDATE, orders);

    eq(result.totalActions, 2, 'Both actions processed');

    // Act-1: already escalated, stays escalated (no change)
    const act1 = result.results.find((r) => r.actionId === 'act-1');
    ok(act1, 'act-1 found');
    eq(act1!.changed, false, 'act-1 already escalated, unchanged');
    eq(act1!.candidateDecision, 'pending_approval', 'Still escalated');
    eq(act1!.candidateRule, 'R-STATE-UNAVAILABLE', 'Rule is state unavailable');

    // Act-2: was allowed, but capture missing in backtest → now escalates (stricter)
    const act2 = result.results.find((r) => r.actionId === 'act-2');
    ok(act2, 'act-2 found');
    eq(act2!.changed, true, 'act-2 changed from allowed to escalate');
    eq(act2!.originalDecision, 'allowed', 'Was allowed');
    eq(act2!.candidateDecision, 'pending_approval', 'Now escalated due to missing capture');
    eq(act2!.candidateRule, 'R-STATE-UNAVAILABLE', 'Rule is state unavailable');
    eq(act2!.impact, 'stricter', 'Impact is stricter');

    // If both original and candidate have same decision+rule, no change is counted
    // But act-2 went from 'allowed'/'R-ALLOW' to 'pending_approval'/'R-STATE-UNAVAILABLE'
    // Only if the original rule was also R-STATE-UNAVAILABLE would it be unchanged
    // Since act-1's original was already R-STATE-UNAVAILABLE→pending_approval, it's unchanged
    // Since act-2's original was R-ALLOW→allowed, it IS changed
    const changes = result.results.filter((r) => r.changed).length;
    ok(changes >= 1, `At least 1 action changed (actual: ${changes})`);
  });
});

for (const driver of ['better-sqlite3', 'node:sqlite'] as const) {
  describe(`Mandate backtest HTTP routes (${driver})`, () => {
    test('POST /v1/mandate/backtest with valid and invalid payloads', async () => {
      const { db, close } = await tempDb(driver);

      // Seed capture and actions
      db.run("INSERT INTO payments(txn_id,captured_cents,currency,source,captured_at) VALUES ('CAP-100',10000,'USD','test',1000)");
      db.run(`INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at)
              VALUES ('act-101','sess-1','refund_items','CAP-100',1800,'allowed','R-ALLOW','ok','executed',5000,5000)`);
      db.run(`INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at)
              VALUES ('act-102','sess-1','refund_items','CAP-100',3500,'allowed','R-ALLOW','ok','executed',10000,10000)`);

      const app = createApp({ db, mandate: MANDATE, paypal: null }, { production: false });

      // 1. Invalid payload -> 400
      const badRes = await request(app, 'POST', '/v1/mandate/backtest', {
        candidate: { perActionCapCents: 'not-a-number' },
      });
      eq(badRes.status, 400);
      eq(badRes.body.error, 'invalid_candidate_mandate');

      // 2. Valid candidate with tightened cap -> 200
      const goodRes = await request(app, 'POST', '/v1/mandate/backtest', {
        candidate: {
          perActionCapCents: 2000, // $20
          hardMaxCents: 12000,
          dailyCapCents: 20000,
          hardDailyCapCents: 30000,
        },
      });
      eq(goodRes.status, 200);
      eq(goodRes.body.totalActions, 2);
      eq(goodRes.body.changedDecisions, 1);
      eq(goodRes.body.stricterCount, 1);
      eq(goodRes.body.dollarsEscalatedDifferently, 3500);
      ok(Array.isArray(goodRes.body.topChangedRules));

      // 3. POST /v1/mandate/version
      const versionBad = await request(app, 'POST', '/v1/mandate/version', {
        mandate: MANDATE,
        approver: '', // Empty approver rejected
      });
      eq(versionBad.status, 400);

      const versionGood = await request(app, 'POST', '/v1/mandate/version', {
        mandate: MANDATE,
        approver: 'secops-alice',
        notes: 'Tightened caps for testing',
      });
      eq(versionGood.status, 200);
      eq(versionGood.body.ok, true);
      eq(versionGood.body.activatedBy, 'secops-alice');
      ok(versionGood.body.versionId > 0);
      ok(versionGood.body.hash.length > 0);

      // 4. POST /v1/mandate/copilot
      const copilotEmpty = await request(app, 'POST', '/v1/mandate/copilot', { goal: '' });
      eq(copilotEmpty.status, 400);

      const copilotRes = await request(app, 'POST', '/v1/mandate/copilot', {
        goal: 'Reduce fraud risk by lowering per-action cap to $20',
      });
      eq(copilotRes.status, 200);
      ok(copilotRes.body.candidate);
      ok(copilotRes.body.reasoning);
      ok(copilotRes.body.mode === 'RECORDED' || copilotRes.body.mode === 'LIVE');

      close();
    });
  });
}
