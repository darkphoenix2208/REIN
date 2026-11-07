import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.ts';
import { parseMandate } from '../server/config.ts';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { runReconcilerWorkflow, runAttackLabWorkflow } from '../server/render-workflow.ts';

const MANDATE_JSON = {
  schema_version: 1,
  perActionCapCents: 5000,
  hardMaxCents: 20000,
  dailyCapCents: 20000,
  hardDailyCapCents: 40000,
  expiresAt: '2099-01-01T00:00:00Z',
};

const mandate = parseMandate(MANDATE_JSON);

const tempDb = async (driver: 'better-sqlite3' | 'node:sqlite' = 'better-sqlite3') => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-wf-test-')), 't.db');
  const db = await openDb(path, { driver });
  applySchema(db);
  return { db, close: () => db.close() };
};

const startServer = async (app: any) => {
  const srv = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => srv.once('listening', resolve));
  const addr = srv.address() as any;
  return { server: srv, base: `http://127.0.0.1:${addr.port}` };
};

for (const driver of ['better-sqlite3', 'node:sqlite'] as const) {
  describe(`Health checks and Render Workflows (${driver})`, () => {
    test('/healthz and /readyz return 200 and correct status', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const app = createApp({ db, mandate, paypal: null });
        const { server, base } = await startServer(app);

        // Root healthz
        const rRootHealth = await fetch(`${base}/healthz`);
        assert.equal(rRootHealth.status, 200);
        const jRootHealth = await rRootHealth.json() as any;
        assert.equal(jRootHealth.status, 'ok');

        // Root readyz
        const rRootReady = await fetch(`${base}/readyz`);
        assert.equal(rRootReady.status, 200);
        const jRootReady = await rRootReady.json() as any;
        assert.equal(jRootReady.status, 'ready');
        assert.equal(jRootReady.db, 'ok');

        // API healthz & readyz
        const rApiHealth = await fetch(`${base}/v1/healthz`);
        assert.equal(rApiHealth.status, 200);

        const rApiReady = await fetch(`${base}/v1/readyz`);
        assert.equal(rApiReady.status, 200);

        server.close();
      } finally {
        close();
      }
    });

    test('workflow endpoints reject unauthorized requests with 401', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const app = createApp({ db, mandate, paypal: null }, { token: 'SECRET-SERVICE-TOKEN' });
        const { server, base } = await startServer(app);

        // Missing token
        const rNoToken = await fetch(`${base}/v1/workflow/reconcile`, { method: 'POST' });
        assert.equal(rNoToken.status, 401);

        // Wrong token
        const rWrong = await fetch(`${base}/v1/workflow/reconcile`, {
          method: 'POST',
          headers: { Authorization: 'Bearer WRONG-TOKEN' },
        });
        assert.equal(rWrong.status, 401);

        // Attack lab missing token
        const rAlNoToken = await fetch(`${base}/v1/workflow/attack-lab/run`, { method: 'POST' });
        assert.equal(rAlNoToken.status, 401);

        server.close();
      } finally {
        close();
      }
    });

    test('reconcile endpoint is authenticated and idempotent', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const token = 'REIN-WORKFLOW-TOKEN-1';
        const app = createApp({ db, mandate, paypal: null }, { token });
        const { server, base } = await startServer(app);

        // Seed an unknown_outcome row
        const now = Date.now();
        db.run(
          `INSERT INTO actions(id, session_id, tool, capture_id, amount_cents, decision, rule_id, reason, status, created_at, updated_at)
           VALUES ('act_unknown_1', 's1', 'refund', 'CAP_UNK_1', 1500, 'allowed', 'R-ALLOW', 'Simulated unknown', 'unknown_outcome', ?, ?)`,
          now - 200_000, now - 200_000
        );

        // First call: reconciles the unknown row
        const res1 = await fetch(`${base}/v1/workflow/reconcile`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res1.status, 200);
        const data1 = await res1.json() as any;
        assert.equal(data1.ok, true);
        assert.equal(data1.idempotent, true);
        assert.equal(data1.reconciled, 1);
        assert.equal(data1.unknownCount, 0);

        // Second call: idempotent, nothing left to reconcile
        const res2 = await fetch(`${base}/v1/workflow/reconcile`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res2.status, 200);
        const data2 = await res2.json() as any;
        assert.equal(data2.ok, true);
        assert.equal(data2.idempotent, true);
        assert.equal(data2.reconciled, 0);
        assert.equal(data2.unknownCount, 0);

        server.close();
      } finally {
        close();
      }
    });

    test('attack-lab workflow endpoint runs vectors idempotently', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const token = 'REIN-WORKFLOW-TOKEN-2';
        const app = createApp({ db, mandate, paypal: null }, { token });
        const { server, base } = await startServer(app);

        // First run
        const res1 = await fetch(`${base}/v1/workflow/attack-lab/run`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res1.status, 200);
        const data1 = await res1.json() as any;
        assert.equal(data1.ok, true);
        assert.equal(data1.vectorsRun, 8);
        assert.equal(data1.idempotent, true);
        assert.equal(data1.blockedCount + data1.escalatedCount, 8);

        // Second run: idempotent, succeeds identically
        const res2 = await fetch(`${base}/v1/workflow/attack-lab/run`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res2.status, 200);
        const data2 = await res2.json() as any;
        assert.equal(data2.ok, true);
        assert.equal(data2.vectorsRun, 8);
        assert.equal(data2.idempotent, true);

        server.close();
      } finally {
        close();
      }
    });

    test('render-workflow SDK helpers use local fallback when RENDER_API_KEY is absent', async () => {
      const { db, close } = await tempDb(driver);
      try {
        const token = 'REIN-WORKFLOW-TOKEN-3';
        const app = createApp({ db, mandate, paypal: null }, { token });
        const { server, base } = await startServer(app);

        const recRes = await runReconcilerWorkflow({
          apiUrl: base,
          serviceToken: token,
        });
        assert.equal(recRes.ok, true);
        assert.equal(recRes.executedVia, 'local_fallback');
        assert.equal(recRes.status, 'VERIFIED_LOCAL');

        const alRes = await runAttackLabWorkflow({
          apiUrl: base,
          serviceToken: token,
        });
        assert.equal(alRes.ok, true);
        assert.equal(alRes.vectorsRun, 8);
        assert.equal(alRes.executedVia, 'local_fallback');
        assert.equal(alRes.status, 'VERIFIED_LOCAL');

        server.close();
      } finally {
        close();
      }
    });
  });
}
