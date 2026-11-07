// Dispute automation tests
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { generateDisputeResponse } from '../server/disputes.ts';

const tempDb = async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
  const db = await openDb(path);
  applySchema(db);
  return { db, close: () => db.close() };
};

describe('Dispute automation', () => {
  test('suggests providing evidence when refund already issued', async () => {
    const { db, close } = await tempDb();

    // Simulate a refund was already processed
    db.run(
      `INSERT INTO actions(id, session_id, tool, capture_id, amount_cents, decision, rule_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'refund-123', 'session-1', 'refund_items', 'CAP-001', 5000, 'allowed', 'R-ALLOW', 'Test', 'executed', Date.now(), Date.now()
    );

    const response = generateDisputeResponse(db, 'CAP-001', 'ITEM_NOT_RECEIVED');

    assert.equal(response.suggestedAction, 'provide_evidence');
    assert.ok(response.evidence);
    assert.ok(response.evidence.refundIds);
    assert.equal(response.evidence.refundIds!.length, 1);
    assert.equal(response.evidence.refundIds![0], 'refund-123');
    assert.ok(response.evidence.notes);
    assert.ok(response.evidence.notes!.includes('50.00'));
    assert.ok(response.reasoning.includes('Found 1 refund'));

    close();
  });

  test('suggests evidence for item not received without prior refund', async () => {
    const { db, close } = await tempDb();

    const response = generateDisputeResponse(db, 'CAP-002', 'ITEM_NOT_RECEIVED');

    assert.equal(response.suggestedAction, 'provide_evidence');
    assert.ok(response.evidence);
    assert.ok(response.evidence.notes);
    assert.ok(response.evidence.notes!.includes('tracking'));
    assert.ok(response.reasoning.includes('tracking evidence'));

    close();
  });

  test('suggests accepting unauthorized transaction claims', async () => {
    const { db, close } = await tempDb();

    const response = generateDisputeResponse(db, 'CAP-003', 'UNAUTHORIZED_TRANSACTION');

    assert.equal(response.suggestedAction, 'accept');
    assert.ok(response.reasoning.includes('Unauthorized'));
    assert.ok(response.reasoning.includes('fraud team'));

    close();
  });

  test('defaults to accepting claim for unknown dispute reasons', async () => {
    const { db, close } = await tempDb();

    const response = generateDisputeResponse(db, 'CAP-004', 'UNKNOWN_REASON');

    assert.equal(response.suggestedAction, 'accept');
    assert.ok(response.reasoning.includes('No automated evidence'));

    close();
  });

  test('aggregates multiple refunds in evidence', async () => {
    const { db, close } = await tempDb();

    // Multiple refunds for same capture
    db.run(
      `INSERT INTO actions(id, session_id, tool, capture_id, amount_cents, decision, rule_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'refund-1', 'session-1', 'refund_items', 'CAP-005', 2000, 'allowed', 'R-ALLOW', 'Test', 'executed', Date.now(), Date.now()
    );

    db.run(
      `INSERT INTO actions(id, session_id, tool, capture_id, amount_cents, decision, rule_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'refund-2', 'session-1', 'refund_items', 'CAP-005', 3000, 'allowed', 'R-ALLOW', 'Test', 'executed', Date.now() + 1000, Date.now() + 1000
    );

    const response = generateDisputeResponse(db, 'CAP-005', 'ITEM_NOT_RECEIVED');

    assert.equal(response.suggestedAction, 'provide_evidence');
    assert.ok(response.evidence);
    assert.equal(response.evidence.refundIds!.length, 2);
    assert.ok(response.evidence.notes!.includes('50.00')); // $20 + $30
    assert.ok(response.reasoning.includes('Found 2 refund'));

    close();
  });

  test('ignores blocked or pending refunds', async () => {
    const { db, close } = await tempDb();

    // Blocked refund should not count
    db.run(
      `INSERT INTO actions(id, session_id, tool, capture_id, amount_cents, decision, rule_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'refund-blocked', 'session-1', 'refund_items', 'CAP-006', 5000, 'blocked', 'R-HARD-MAX', 'Test', 'blocked', Date.now(), Date.now()
    );

    const response = generateDisputeResponse(db, 'CAP-006', 'ITEM_NOT_RECEIVED');

    // Should not find the blocked refund
    assert.ok(!response.evidence?.refundIds || response.evidence.refundIds.length === 0);

    close();
  });
});
