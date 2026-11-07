// Signed checkpoint tests
import { strictEqual as eq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { ledger } from '../server/ledger.ts';
import {
  getKeypair,
  signCheckpoint,
  verifyCheckpoint,
  storeCheckpoint,
  getLatestCheckpoint,
} from '../server/checkpoint.ts';

const tempDb = async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
  const db = await openDb(path);
  applySchema(db);
  return { db, close: () => db.close() };
};

describe('Signed checkpoints', () => {
  test('keypair loading from env', () => {
    const orig = process.env.ED25519_PRIVATE_KEY;
    delete process.env.ED25519_PRIVATE_KEY;

    const noKey = getKeypair();
    eq(noKey, null, 'Returns null when key not set');

    // Set a test key (32 bytes base64)
    const testKey = Buffer.alloc(32, 0x42);
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const keypair = getKeypair();
    ok(keypair !== null, 'Keypair loaded');
    ok(keypair!.privateKey.length === 32, 'Private key is 32 bytes');
    ok(keypair!.publicKey.length === 32, 'Public key is 32 bytes');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;
  });

  test('sign checkpoint with valid chain', async () => {
    const { db, close } = await tempDb();

    // Create some ledger entries
    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());
    ledger(db, 'action-1', 'executed', { test: true }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null, 'Checkpoint created');
    ok(checkpoint!.seq > 0, 'Has sequence number');
    ok(checkpoint!.head.length > 0, 'Has head hash');
    ok(checkpoint!.signature.length > 0, 'Has signature');
    ok(checkpoint!.publicKey.length > 0, 'Has public key');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('cannot sign broken chain', async () => {
    const { db, close } = await tempDb();

    // Create ledger entries
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

  test('verify checkpoint', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null);

    const verification = verifyCheckpoint(db, checkpoint!);
    eq(verification.chainValid, true, 'Chain is valid');
    eq(verification.seq, checkpoint!.seq, 'Seq matches');
    eq(verification.head, checkpoint!.head, 'Head matches');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('store and retrieve checkpoint', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null);

    storeCheckpoint(db, checkpoint!);

    const retrieved = getLatestCheckpoint(db);
    ok(retrieved !== null, 'Checkpoint retrieved');
    eq(retrieved!.seq, checkpoint!.seq, 'Seq matches');
    eq(retrieved!.head, checkpoint!.head, 'Head matches');
    eq(retrieved!.signature, checkpoint!.signature, 'Signature matches');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('no checkpoint returns null', async () => {
    const { db, close } = await tempDb();

    const checkpoint = getLatestCheckpoint(db);
    eq(checkpoint, null, 'Returns null when no checkpoint exists');

    close();
  });

  test('verify fails for tampered chain', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null);

    // Tamper with the chain
    db.run('UPDATE ledger SET hash = ? WHERE seq = 1', 'TAMPERED');

    const verification = verifyCheckpoint(db, checkpoint!);
    eq(verification.chainValid, false, 'Chain tampering detected');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });

  test('timestamp is readable', async () => {
    const { db, close } = await tempDb();

    ledger(db, 'action-1', 'reserved', { test: true }, Date.now());

    const testKey = Buffer.alloc(32, 0x42);
    const orig = process.env.ED25519_PRIVATE_KEY;
    process.env.ED25519_PRIVATE_KEY = testKey.toString('base64');

    const checkpoint = signCheckpoint(db);
    ok(checkpoint !== null);

    const verification = verifyCheckpoint(db, checkpoint!);
    ok(verification.timestampReadable.includes('T'), 'Timestamp is ISO format');
    ok(verification.timestampReadable.includes('Z'), 'Timestamp is UTC');

    if (orig) process.env.ED25519_PRIVATE_KEY = orig;
    else delete process.env.ED25519_PRIVATE_KEY;

    close();
  });
});
