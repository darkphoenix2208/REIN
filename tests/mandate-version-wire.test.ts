// Tests for Task 3: mandate versioning and agent_id wired into gate and ledger
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { check, result } from '../server/dispatch.ts';
import { runRefund, type GateDeps } from '../server/gate.ts';
import { verifyChain } from '../server/ledger.ts';
import { mandateHash } from '../server/mandate-version.ts';
import type { Mandate } from '../server/types.ts';

const baseMandate: Mandate = {
  perActionCapCents: 5000,
  hardMaxCents: 10000,
  dailyCapCents: 20000,
  hardDailyCapCents: 40000,
  expiresAt: Date.now() + 86400000,
};

for (const driver of ['better-sqlite3', 'node:sqlite'] as const) {
  describe(`Mandate version & agent_id in gate & ledger (${driver})`, () => {
    test('records mandate_version (hash) and agent_id on action and ledger row', async () => {
      const path = join(mkdtempSync(join(tmpdir(), 'rein-mv-')), 't.db');
      const db = await openDb(path, { driver });
      applySchema(db);

      db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source) VALUES ('CAP-01',10000,0,0,'USD','test')`);

      const expectedHash = mandateHash(baseMandate);
      const testAgentId = 'agent-support-42';

      const cr = check(db, baseMandate, {
        actionId: 'act-mv-01',
        sessionId: 'sess-01',
        agentId: testAgentId,
        tool: 'refund',
        captureId: 'CAP-01',
        amountCents: 2500,
      });

      assert.equal(cr.status, 'allowed');

      // Check actions row
      const action = db.one<any>('SELECT mandate_version, agent_id FROM actions WHERE id=?', 'act-mv-01');
      assert.ok(action, 'Action row must exist');
      assert.equal(action.mandate_version, expectedHash, 'Action must record mandate_version hash');
      assert.equal(action.agent_id, testAgentId, 'Action must record agent_id');

      // Check ledger row
      const ledgerRow = db.one<any>('SELECT mandate_version, agent_id, payload_json FROM ledger WHERE action_id=?', 'act-mv-01');
      assert.ok(ledgerRow, 'Ledger row must exist');
      assert.equal(ledgerRow.mandate_version, expectedHash, 'Ledger must record mandate_version column');
      assert.equal(ledgerRow.agent_id, testAgentId, 'Ledger must record agent_id column');

      const payload = JSON.parse(ledgerRow.payload_json);
      assert.equal(payload.mandate_version, expectedHash, 'Ledger payload must include mandate_version');
      assert.equal(payload.agent_id, testAgentId, 'Ledger payload must include agent_id');

      // Check chain verification still passes
      const chain = verifyChain(db);
      assert.equal(chain.ok, true, 'Hash chain must be valid');
    });

    test('backward compatibility: ledger with legacy rows (no mandate_version/agent_id) still verifies', async () => {
      const path = join(mkdtempSync(join(tmpdir(), 'rein-compat-')), 't.db');
      const db = await openDb(path, { driver });
      applySchema(db);

      // Simulate a legacy ledger row inserted before this feature
      const legacyPayload = { mode: 'sim', ruleId: 'R-ALLOW', amountCents: 1000 };
      const { sha, canon, GENESIS } = await import('../server/ledger.ts');
      const ts = Date.now();
      const legacyHash = sha(GENESIS + canon({ actionId: 'act-legacy-01', event: 'reserved', payload: legacyPayload, ts }));

      db.run(
        'INSERT INTO ledger(action_id,event,payload_json,prev_hash,hash,created_at) VALUES (?,?,?,?,?,?)',
        'act-legacy-01', 'reserved', canon(legacyPayload), GENESIS, legacyHash, ts
      );

      // Verify the legacy row alone
      assert.equal(verifyChain(db).ok, true, 'Legacy row alone must verify');

      // Now add a modern row using check()
      db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source) VALUES ('CAP-02',10000,0,0,'USD','test')`);
      check(db, baseMandate, {
        actionId: 'act-modern-02',
        sessionId: 'sess-02',
        tool: 'refund',
        captureId: 'CAP-02',
        amountCents: 2000,
      });

      // Both rows together must still verify!
      const chain = verifyChain(db);
      assert.equal(chain.ok, true, 'Chain containing both legacy and new rows must verify');
      assert.equal(chain.rows, 2);
    });

    test('runRefund end-to-end records mandate_version and agent_id through execution', async () => {
      const path = join(mkdtempSync(join(tmpdir(), 'rein-e2e-mv-')), 't.db');
      const db = await openDb(path, { driver });
      applySchema(db);

      db.run(`INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source) VALUES ('CAP-03',10000,0,0,'USD','test')`);
      const deps: GateDeps = { db, mandate: baseMandate, paypal: null };

      const outcome = await runRefund(deps, {
        sessionId: 'sess-refund-03',
        agentId: 'agent-bot-99',
        tool: 'refund',
        captureId: 'CAP-03',
        amountCents: 1500,
      });

      assert.equal(outcome.status, 'executed');
      const action = db.one<any>('SELECT mandate_version, agent_id FROM actions WHERE id=?', outcome.actionId);
      assert.equal(action.mandate_version, mandateHash(baseMandate));
      assert.equal(action.agent_id, 'agent-bot-99');

      // Both decided/reserved and executed ledger rows should have mandate_version & agent_id
      const rows = db.all<any>('SELECT event, mandate_version, agent_id FROM ledger WHERE action_id=? ORDER BY seq', outcome.actionId);
      assert.ok(rows.length >= 2, 'Should have reserved and executed ledger rows');
      for (const r of rows) {
        assert.equal(r.mandate_version, mandateHash(baseMandate));
        assert.equal(r.agent_id, 'agent-bot-99');
      }

      assert.equal(verifyChain(db).ok, true);
    });
  });
}
