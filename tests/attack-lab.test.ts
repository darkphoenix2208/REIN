// Attack lab execution tests
import { strictEqual as eq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { parseMandate } from '../server/config.ts';
import { runAttackVector, seedAttackLabData } from '../server/attack-lab.ts';
import { MANDATE_JSON } from './helpers.ts';

const mandate = parseMandate(MANDATE_JSON);

describe('attack lab', () => {
  const tempDb = async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    return { db, path, close: () => db.close() };
  };

  test('Vector 1: Over-capture blocks (R-OVER-CAPTURE)', async () => {
    const { db, close } = await tempDb();
    const { captureIds } = seedAttackLabData(db);

    const deps = { db, mandate, paypal: null };

    const result = await runAttackVector(deps, 1, captureIds[1]);

    ok(result.blocked, 'Vector 1 blocked');
    eq(result.gateRuleId, 'R-OVER-CAPTURE', 'Triggered R-OVER-CAPTURE');
    eq(result.refundedCents, 0, 'No refund granted');
    ok(result.testPassed, 'Test passed');
    close();
  });

  test('Vector 2: Duplicate request (R-DUP or R-ITEMS-REFUNDED)', async () => {
    const { db, close } = await tempDb();
    const { captureIds } = seedAttackLabData(db);

    const deps = { db, mandate, paypal: null };

    // runAttackVector for vector 2 already does the first refund + duplicate
    const result = await runAttackVector(deps, 2, captureIds[2]);
    ok(result.blocked, 'Duplicate blocked');
    ok(['R-DUP', 'R-ITEMS-REFUNDED'].includes(result.gateRuleId), `Blocked by ${result.gateRuleId}`);
    ok(result.testPassed, 'Test passed');
    close();
  });

  test('Vector 3: Item-not-in-order blocks (R-ITEMS-UNKNOWN)', async () => {
    const { db, close } = await tempDb();
    const { captureIds } = seedAttackLabData(db);

    const deps = { db, mandate, paypal: null };

    const result = await runAttackVector(deps, 3, captureIds[3]);

    ok(result.blocked, 'Vector 3 blocked');
    eq(result.gateRuleId, 'R-ITEMS-UNKNOWN', 'Triggered R-ITEMS-UNKNOWN');
    eq(result.refundedCents, 0, 'No refund granted');
    ok(result.testPassed, 'Test passed');
    close();
  });

  test('Vector 4: Return window blocks (R-WINDOW)', async () => {
    const { db, close } = await tempDb();
    const { captureIds } = seedAttackLabData(db);

    const deps = { db, mandate, paypal: null };

    const result = await runAttackVector(deps, 4, captureIds[4]);

    ok(result.blocked, 'Vector 4 blocked (100 days old)');
    eq(result.gateRuleId, 'R-WINDOW', 'Triggered R-WINDOW');
    ok(result.testPassed, 'Test passed');
    close();
  });

  test('All 8 vectors execute and return results', async () => {
    const { db, close } = await tempDb();
    const { captureIds } = seedAttackLabData(db);

    const deps = { db, mandate, paypal: null };

    const results: Awaited<ReturnType<typeof runAttackVector>>[] = [];
    for (let vid = 1; vid <= 8; vid++) {
      const result = await runAttackVector(deps, vid, captureIds[vid]);
      results.push(result);
    }

    eq(results.length, 8, 'All 8 vectors executed');

    // Check each returned required fields
    for (const r of results) {
      ok(typeof r.vectorId === 'number', 'Has vectorId');
      ok(typeof r.vector === 'string', 'Has vector description');
      ok(typeof r.gateStatus === 'string', 'Has gateStatus');
      ok(typeof r.requestedCents === 'number', 'Has requestedCents');
      ok(typeof r.refundedCents === 'number', 'Has refundedCents');
      ok(typeof r.blocked === 'boolean', 'Has blocked flag');
      ok(typeof r.escalated === 'boolean', 'Has escalated flag');
      ok(typeof r.testPassed === 'boolean', 'Has testPassed flag');
    }

    close();
  });
});
