// Signed checkpoint and verification tests
import { strictEqual as eq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { ledger } from '../server/ledger.ts';
import { createApp } from '../server/app.ts';
import { loadMandate } from '../server/config.ts';
import { fileURLToPath } from 'node:url';
import {
  getKeypair,
  signCheckpoint,
  verifyCheckpoint,
  storeCheckpoint,
  getLatestCheckpoint,
  getPublicKeyInfo,
} from '../server/checkpoint.ts';

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
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
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
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          srv.close();
          const raw = Buffer.concat(chunks);
          const text = raw.toString('utf8');
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(text), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode!, body: raw, headers: res.headers });
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

describe('Signed checkpoints (unit)', () => {
  test('keypair loading from env', () => {
    const orig = process.env.ED25519_PRIVATE_KEY;
    delete process.env.ED25519_PRIVATE_KEY;
    const origRein = process.env.REIN_CHECKPOINT_KEY;
    delete process.env.REIN_CHECKPOINT_KEY;

    // With no env and allowGenerate false, returns null
    const noKey = getKeypair();
    eq(noKey, null, 'Returns null when key not set and allowGenerate is false');

    // Set a test key (32 bytes base64)
    const testKey = Buffer.alloc(32, 0x42);
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const keypair = getKeypair();
    ok(keypair !== null, 'Keypair loaded');
    ok(Buffer.from(keypair!.rawPublicKeyBase64, 'base64').length === 32, 'Raw public key is 32 bytes');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;
    if (origRein) process.env.REIN_CHECKPOINT_KEY = origRein;
  });

  test('sign checkpoint with valid chain', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());
    ledger(db, 'action-1', 'executed', { test: true }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null, 'Checkpoint created');
    eq(checkpoint!.seq, 2, 'Has sequence number 2');
    ok(checkpoint!.head.length > 0, 'Has head hash');
    ok(checkpoint!.signature.length > 0, 'Has signature');
    ok(checkpoint!.publicKey.length > 0, 'Has public key');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('cannot sign broken chain', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());

    // Break the chain
    db.run('UPDATE ledger SET hash = ? WHERE seq = 1', 'BROKEN');

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    try {
      signCheckpoint(db);
      ok(false, 'Should throw on broken chain');
    } catch (e: any) {
      ok(e.message.includes('broken chain'), 'Throws error for broken chain');
    }

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('verify valid checkpoint', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null);

    const verification = verifyCheckpoint(db, checkpoint!);
    eq(verification.chainValid, true, 'Chain is valid');
    eq(verification.signatureValid, true, 'Signature is valid');
    eq(verification.seq, checkpoint!.seq, 'Seq matches');
    eq(verification.head, checkpoint!.head, 'Head matches');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('edit-middle detected after checkpoint', async () => {
    const { db, close } = await tempDb();

    // 4 rows
    ledger(db, 'act-1', 'reserved', { n: 1 }, Date.now());
    ledger(db, 'act-1', 'executed', { n: 2 }, Date.now());
    ledger(db, 'act-2', 'reserved', { n: 3 }, Date.now());
    ledger(db, 'act-2', 'executed', { n: 4 }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null);
    eq(checkpoint!.seq, 4);

    // Edit row 2 (middle edit)
    db.run("UPDATE ledger SET payload_json = '{\"n\":999}' WHERE seq = 2");

    const verification = verifyCheckpoint(db, checkpoint!);
    eq(verification.chainValid, false, 'Middle edit detected: chainValid must be false');
    eq(verification.signatureValid, true, 'Original signature is intact');
    ok(verification.error?.includes('Chain broken') || verification.error?.includes('Middle edit'), 'Reports broken chain');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('delete-middle detected after checkpoint', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'act-1', 'reserved', { n: 1 }, Date.now());
    ledger(db, 'act-1', 'executed', { n: 2 }, Date.now());
    ledger(db, 'act-2', 'reserved', { n: 3 }, Date.now());
    ledger(db, 'act-2', 'executed', { n: 4 }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null);
    eq(checkpoint!.seq, 4);

    // Delete row 2 (delete middle)
    db.run('DELETE FROM ledger WHERE seq = 2');

    const verification = verifyCheckpoint(db, checkpoint!);
    eq(verification.chainValid, false, 'Delete middle detected');
    ok(verification.error?.includes('Tail truncated') || verification.error?.includes('Chain broken') || verification.error?.includes('mismatch'));

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('tail truncation detected after checkpoint', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'act-1', 'reserved', { n: 1 }, Date.now());
    ledger(db, 'act-1', 'executed', { n: 2 }, Date.now());
    ledger(db, 'act-2', 'reserved', { n: 3 }, Date.now());
    ledger(db, 'act-2', 'executed', { n: 4 }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null);
    eq(checkpoint!.seq, 4);

    // Truncate tail: delete rows 3 and 4
    db.run('DELETE FROM ledger WHERE seq >= 3');

    const verification = verifyCheckpoint(db, checkpoint!);
    eq(verification.chainValid, false, 'Tail truncation detected');
    ok(verification.error?.includes('Tail truncated'), 'Mentions tail truncation');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('wrong key fails signature verification', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'act-1', 'reserved', { n: 1 }, Date.now());

    const key1 = Buffer.alloc(32, 0x42);
    const key2 = Buffer.alloc(32, 0x99);

    process.env.ED25519_PRIVATE_KEY = key1.toString('base64');
    const checkpoint = signCheckpoint(db)!;

    // Now try to verify checkpoint against key2's public key
    process.env.ED25519_PRIVATE_KEY = key2.toString('base64');
    const kp2 = getKeypair()!;

    const verification = verifyCheckpoint(db, checkpoint, kp2.rawPublicKeyBase64);
    eq(verification.signatureValid, false, 'Must fail signature verification when wrong key is expected');

    delete process.env.ED25519_PRIVATE_KEY;
    close();
  });

  test('store and retrieve latest checkpoint', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db)!;
    storeCheckpoint(db, checkpoint);

    const retrieved = getLatestCheckpoint(db);
    ok(retrieved !== null, 'Checkpoint retrieved');
    eq(retrieved!.seq, checkpoint.seq);
    eq(retrieved!.head, checkpoint.head);
    eq(retrieved!.signature, checkpoint.signature);

    delete process.env.ED25519_PRIVATE_KEY;
    close();
  });

  test('timestamp tampering fails signature verification', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'act-1', 'reserved', { n: 1 }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db)!;
    ok(checkpoint !== null);

    // Tamper with timestamp only (keep seq and head same)
    const tamperedCheckpoint = {
      ...checkpoint,
      timestamp: checkpoint.timestamp + 60000, // Add 1 minute
    };

    const verification = verifyCheckpoint(db, tamperedCheckpoint);
    eq(verification.signatureValid, false, 'Signature must fail when timestamp is changed');
    ok(verification.error?.includes('Invalid Ed25519 signature'), 'Reports invalid signature');

    delete process.env.ED25519_PRIVATE_KEY;
    close();
  });

  test('browser and server verifiers agree', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'act-1', 'reserved', { n: 1 }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db)!;

    // Server verification
    const serverResult = verifyCheckpoint(db, checkpoint);
    eq(serverResult.signatureValid, true, 'Server verifies signature');
    eq(serverResult.chainValid, true, 'Server verifies chain');

    // Browser-like verification using Node's WebCrypto (same as web/src/Verify.tsx)
    const { webcrypto } = await import('node:crypto');
    const subtle = webcrypto.subtle as SubtleCrypto;

    const pubBytes = Uint8Array.from(Buffer.from(checkpoint.publicKey, 'base64'));
    const message = `${checkpoint.seq}:${checkpoint.head}:${checkpoint.timestamp}`;
    const messageBytes = new TextEncoder().encode(message);
    const sigBytes = Uint8Array.from(Buffer.from(checkpoint.signature, 'base64'));

    const key = await subtle.importKey('raw', pubBytes, { name: 'Ed25519' }, false, ['verify']);
    const browserSigValid = await subtle.verify({ name: 'Ed25519' }, key, sigBytes, messageBytes);

    eq(browserSigValid, true, 'Browser WebCrypto verifies signature');
    eq(browserSigValid, serverResult.signatureValid, 'Browser and server agree on signature');

    delete process.env.ED25519_PRIVATE_KEY;
    close();
  });
});

for (const driver of ['better-sqlite3', 'node:sqlite'] as const) {
  describe(`Signed checkpoint HTTP routes (${driver})`, () => {
    test('GET /v1/ledger/pubkey, GET /v1/ledger/checkpoint, GET /v1/ledger/checkpoint/latest, POST /v1/ledger/verify', async () => {
      const { db, close } = await tempDb(driver);
      ledger(db, 'http-act-1', 'reserved', { cents: 1800 }, Date.now());
      ledger(db, 'http-act-1', 'executed', { cents: 1800 }, Date.now());

      const testKey = Buffer.alloc(32, 0x55);
      process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

      const app = createApp({ db, mandate: MANDATE, paypal: null }, { production: false });

      // 1. GET /v1/ledger/pubkey
      const pubkeyRes = await request(app, 'GET', '/v1/ledger/pubkey');
      eq(pubkeyRes.status, 200);
      eq(pubkeyRes.body.algorithm, 'Ed25519');
      ok(pubkeyRes.body.publicKey);

      // 2. GET /v1/ledger/checkpoint (signs & stores)
      const cpRes = await request(app, 'GET', '/v1/ledger/checkpoint');
      eq(cpRes.status, 200);
      eq(cpRes.body.seq, 2);
      ok(cpRes.body.signature);

      // 3. GET /v1/ledger/checkpoint/latest
      const latestRes = await request(app, 'GET', '/v1/ledger/checkpoint/latest');
      eq(latestRes.status, 200);
      eq(latestRes.body.seq, 2);
      eq(latestRes.body.head, cpRes.body.head);

      // 4. POST /v1/ledger/verify with valid checkpoint
      const verifyRes = await request(app, 'POST', '/v1/ledger/verify', cpRes.body);
      eq(verifyRes.status, 200);
      eq(verifyRes.body.valid, true);
      eq(verifyRes.body.signatureValid, true);
      eq(verifyRes.body.chainValid, true);

      // 5. POST /v1/ledger/verify with tampered checkpoint (bad signature)
      const badCp = { ...cpRes.body, signature: Buffer.alloc(64, 0x01).toString('base64') };
      const badVerify = await request(app, 'POST', '/v1/ledger/verify', badCp);
      eq(badVerify.status, 200);
      eq(badVerify.body.valid, false);
      eq(badVerify.body.signatureValid, false);

      // 6. GET /v1/ledger/evidence-pack?format=csv
      const csvRes = await request(app, 'GET', '/v1/ledger/evidence-pack?format=csv');
      eq(csvRes.status, 200);
      ok(csvRes.headers['content-type']?.includes('text/csv'), 'Content type includes text/csv');
      ok(csvRes.body.toString().includes('seq,created_at,event'));

      // 7. GET /v1/ledger/evidence-pack?format=pdf
      const pdfRes = await request(app, 'GET', '/v1/ledger/evidence-pack?format=pdf');
      eq(pdfRes.status, 200);
      eq(pdfRes.headers['content-type'], 'application/pdf');
      const pdfBuf = Buffer.isBuffer(pdfRes.body) ? pdfRes.body : Buffer.from(pdfRes.body);
      ok(pdfBuf.subarray(0, 5).toString('utf8').startsWith('%PDF-'), 'Returns valid PDF binary');

      delete process.env.ED25519_PRIVATE_KEY;
      close();
    });
  });
}
