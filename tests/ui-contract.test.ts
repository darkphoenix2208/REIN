// Regression tests for bugs found by actually opening the pages in a browser:
//  - /verify called a route that did not exist, then reported a HEALTHY ledger as broken (the API it used has no prev_hash/payload_json)
//  - /ops read field names the API does not return ($NaN)
//  - /ledger used an AG Grid option that needs an Enterprise module (console error #200)
//  - a fresh install had no checkpoint key, so GET /v1/ledger/checkpoint answered 503
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { parseMandate } from '../server/config.ts';
import { runRefund } from '../server/gate.ts';
import { verifyChainRows, verifyCheckpointSignature, type Checkpoint, type LedgerRow } from '../web/src/ledgerVerify.ts';
import { MANDATE_JSON, seedOrder, tempDb } from './helpers.ts';

const mandate = parseMandate(MANDATE_JSON);
const servers: Server[] = [];
afterEach(() => { while (servers.length) servers.pop()!.close(); });

async function boot(opts: Record<string, unknown> = {}) {
  const { db } = await tempDb();
  const dir = mkdtempSync(join(tmpdir(), 'rein-ui-'));
  const keep = { f: process.env.REIN_CHECKPOINT_KEY_FILE, k: process.env.REIN_CHECKPOINT_KEY, e: process.env.ED25519_PRIVATE_KEY };
  delete process.env.REIN_CHECKPOINT_KEY; delete process.env.ED25519_PRIVATE_KEY;
  process.env.REIN_CHECKPOINT_KEY_FILE = join(dir, 'k.json');
  const app = createApp({ db, mandate, paypal: null } as any, { rateLimitPerMin: 100_000, ...opts } as any);
  const srv: Server = await new Promise((r) => { const s = createServer(app).listen(0, '127.0.0.1', () => r(s)); });
  servers.push(srv);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const restore = () => { for (const [k, v] of [['REIN_CHECKPOINT_KEY_FILE', keep.f], ['REIN_CHECKPOINT_KEY', keep.k], ['ED25519_PRIVATE_KEY', keep.e]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  return { db, base, dir, restore, get: async (p: string) => { const r = await fetch(base + p); const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* */ } return { status: r.status, json: j, text: t }; } };
}
async function withHistory(db: any) {
  seedOrder(db, 'CAP-A'); seedOrder(db, 'CAP-B');
  const d = { db, mandate, paypal: null, publicUrl: 'http://x' } as any;
  await runRefund(d, { sessionId: 's1', tool: 'refund_items', captureId: 'CAP-A', amountCents: null, items: [{ itemId: 'mug', qty: 1 }] });
  await runRefund(d, { sessionId: 's2', tool: 'refund', captureId: 'CAP-B', amountCents: 6500 }); // escalates
  await runRefund(d, { sessionId: 's2', tool: 'refund', captureId: 'CAP-B', amountCents: 20_000 }); // hard max
}

describe('the pages only call routes that exist', () => {
  test('every plain GET the UI makes is answered by the server (not 404)', async () => {
    const { base, get, restore } = await boot();
    try {
      const paths = new Set<string>();
      for (const f of readdirSync('web/src').filter((x) => x.endsWith('.tsx'))) {
        const src = readFileSync(join('web/src', f), 'utf8');
        for (const m of src.matchAll(/(?:api|fetch)\(\s*'(\/[^'?]+)'\s*\)/g)) if (m[1]!.startsWith('/v1/') || m[1] === '/health') paths.add(m[1]!);
      }
      assert.ok(paths.size >= 8, `expected the UI to call several routes, found ${[...paths]}`);
      for (const p of paths) assert.notEqual((await get(p)).status, 404, `${p} is called by the UI but the server has no such route`);
      void base;
    } finally { restore(); }
  });
});

describe('/verify: the browser recomputes the chain and agrees with the server', () => {
  test('a fresh install can produce a checkpoint (key is generated once, kept outside git, mode 0600) and the browser verifies chain + signature', async () => {
    const { db, get, dir, restore } = await boot();
    try {
      await withHistory(db);
      const cp = await get('/v1/ledger/checkpoint');
      assert.equal(cp.status, 200, cp.text);
      assert.ok(existsSync(join(dir, 'k.json')), 'key file created outside the repo');
      assert.equal((await get('/v1/ledger/checkpoint')).json.publicKey, cp.json.publicKey, 'same key on the next call');
      const exp = await get('/v1/ledger/export');
      assert.equal(exp.status, 200);
      const rows: LedgerRow[] = exp.json.rows;
      assert.ok(rows.length >= 4); assert.ok(rows.every((r) => typeof r.prev_hash === 'string' && typeof r.payload_json === 'string'), 'export rows carry prev_hash and payload_json');
      assert.deepEqual(rows.map((r) => r.seq), [...rows.map((r) => r.seq)].sort((a, b) => a - b));
      const c = cp.json as Checkpoint;
      assert.equal(await verifyCheckpointSignature(c), true);
      const v = await verifyChainRows(rows, c);
      assert.equal(v.chainOk, true, JSON.stringify(v.rows.filter((r) => !r.ok)));
      assert.ok(v.rows.every((r) => r.ok));
    } finally { restore(); }
  });

  test('the lightweight /v1/ledger rows can NOT be verified and are reported as failed, never assumed fine', async () => {
    const { db, get, restore } = await boot();
    try {
      await withHistory(db);
      const cp = (await get('/v1/ledger/checkpoint')).json as Checkpoint;
      const light = (await get('/v1/ledger?limit=50')).json.rows as LedgerRow[];
      assert.equal((await verifyChainRows(light, cp)).chainOk, false);
    } finally { restore(); }
  });

  test('edit-middle, delete-middle, tail truncation, forged signature and a changed timestamp are all caught in the browser verifier', async () => {
    const { db, get, restore } = await boot();
    try {
      await withHistory(db);
      const cp = (await get('/v1/ledger/checkpoint')).json as Checkpoint;
      const rows = (await get('/v1/ledger/export')).json.rows as LedgerRow[];
      const edited = rows.map((r) => ({ ...r })); edited[2]!.payload_json = edited[2]!.payload_json!.replace(/\d/, (d) => String((Number(d) + 1) % 10));
      const e = await verifyChainRows(edited, cp); assert.equal(e.chainOk, false); assert.equal(e.rows.find((r) => !r.ok)?.seq, edited[2]!.seq);
      assert.equal((await verifyChainRows(rows.filter((_, i) => i !== 2), cp)).chainOk, false);
      assert.equal((await verifyChainRows(rows.slice(0, -2), cp)).chainOk, false, 'tail truncation after the checkpoint');
      assert.equal(await verifyCheckpointSignature({ ...cp, signature: Buffer.alloc(64, 1).toString('base64') }), false);
      assert.equal(await verifyCheckpointSignature({ ...cp, timestamp: cp.timestamp + 1 }), false);
      assert.equal(await verifyCheckpointSignature({ ...cp, seq: cp.seq + 1 }), false);
    } finally { restore(); }
  });

  test('a checkpoint refuses to be signed over a broken chain (409, not a fake success)', async () => {
    const { db, get, restore } = await boot();
    try {
      await withHistory(db);
      db.run(`UPDATE ledger SET hash='BAD' WHERE seq=2`);
      const r = await get('/v1/ledger/checkpoint');
      assert.equal(r.status, 409); assert.equal(r.json.error, 'chain_broken');
    } finally { restore(); }
  });
});

describe('/ops reads fields the API really returns', () => {
  test('every exposure.* field the page reads exists and is a number (was $NaN)', async () => {
    const { db, get, restore } = await boot();
    try {
      await withHistory(db);
      const ex = (await get('/v1/exposure')).json;
      const fields = [...new Set([...readFileSync('web/src/Ops.tsx', 'utf8').matchAll(/exposure\.(\w+)/g)].map((m) => m[1]!))];
      assert.ok(fields.length >= 3);
      for (const f of fields) assert.equal(typeof ex[f], 'number', `Ops.tsx reads exposure.${f} but the API returns ${JSON.stringify(ex[f])}`);
    } finally { restore(); }
  });
  test('with no sessionId the exposure spend is the total across sessions; with one it is that session only', async () => {
    const { db, get, restore } = await boot();
    try {
      await withHistory(db); // s1 executed $18; s2 only escalated/blocked
      assert.equal((await get('/v1/exposure')).json.spentCents, 1800);
      assert.equal((await get('/v1/exposure?sessionId=s1')).json.spentCents, 1800);
      assert.equal((await get('/v1/exposure?sessionId=s2')).json.spentCents, 0);
      const ex = (await get('/v1/exposure')).json;
      assert.equal(ex.blockedCents, 20_000, 'what the gate actually blocked (enforce mode) is reported, not only shadow-mode amounts');
      assert.equal(ex.escalatedCents, 6500);
    } finally { restore(); }
  });
});

describe('UI source guards for bugs the browser console caught', () => {
  test('Ledger does not use aggFunc (needs an Enterprise module: AG Grid error #200) and its totals row never shows a date or an invalid number', () => {
    const src = readFileSync('web/src/Ledger.tsx', 'utf8');
    assert.equal(/aggFunc/.test(src), false);
    assert.ok(/value == null \? ''/.test(src), 'the Time formatter must tolerate a null (the totals row)');
  });
  test('only Layout renders the brand, and it is not an h1 (each page owns its h1)', () => {
    assert.equal(/<h1[^>]*className="logo"/.test(readFileSync('web/src/Layout.tsx', 'utf8')), false);
  });
});
