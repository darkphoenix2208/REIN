// Signed ledger checkpoints using Ed25519
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Db } from './db.ts';
import { canon, GENESIS, sha, verifyChain } from './ledger.ts';

export interface Checkpoint {
  seq: number;
  head: string;
  timestamp: number;
  signature: string;
  publicKey: string;
}

export interface VerificationResult {
  chainValid: boolean;
  signatureValid: boolean;
  seq: number;
  head: string;
  timestamp: number;
  timestampReadable: string;
  error?: string;
}

export interface KeypairInfo {
  privateKey: KeyObject;
  publicKey: KeyObject;
  rawPublicKeyBase64: string;
  spkiPublicKeyBase64: string;
}

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const KEY_FILE = process.env.REIN_CHECKPOINT_KEY_FILE || join(tmpdir(), 'rein-checkpoint-key.json');

/**
 * Convert a 32-byte raw seed or existing PKCS#8 key to an Ed25519 KeyObject.
 */
function createEd25519PrivateKey(rawOrPkcs8: Buffer | string): KeyObject {
  if (typeof rawOrPkcs8 === 'string' && rawOrPkcs8.includes('BEGIN PRIVATE KEY')) {
    return createPrivateKey(rawOrPkcs8);
  }
  const buf = typeof rawOrPkcs8 === 'string' ? Buffer.from(rawOrPkcs8, 'base64') : rawOrPkcs8;
  if (buf.length === 32) {
    const pkcs8Der = Buffer.concat([PKCS8_ED25519_PREFIX, buf]);
    return createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  }
  return createPrivateKey({ key: buf, format: 'der', type: 'pkcs8' });
}

/**
 * Extract raw 32-byte public key buffer from an Ed25519 public KeyObject.
 */
function getRawPublicKey(publicKey: KeyObject): Buffer {
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return spki.subarray(-32);
}

/**
 * Load or retrieve the Ed25519 keypair.
 * Precedence:
 * 1. Env REIN_CHECKPOINT_KEY or ED25519_PRIVATE_KEY
 * 2. File outside git (if REIN_CHECKPOINT_KEY_FILE is set or allowGenerate is requested)
 * 3. If allowGenerate is true, generate a new key and persist outside git
 */
export function getKeypair(options?: { allowGenerate?: boolean }): KeypairInfo | null {
  const envKey = process.env.REIN_CHECKPOINT_KEY || process.env.ED25519_PRIVATE_KEY;
  if (envKey) {
    try {
      const privateKey = createEd25519PrivateKey(envKey);
      const publicKey = createPublicKey(privateKey);
      const rawPub = getRawPublicKey(publicKey);
      const spkiPub = publicKey.export({ type: 'spki', format: 'der' });
      return {
        privateKey,
        publicKey,
        rawPublicKeyBase64: rawPub.toString('base64'),
        spkiPublicKeyBase64: spkiPub.toString('base64'),
      };
    } catch (e) {
      console.error('Failed to parse checkpoint key from environment:', e);
      return null;
    }
  }

  // Check persistent key file outside git if explicitly configured or allowGenerate requested
  const shouldCheckFile = Boolean(process.env.REIN_CHECKPOINT_KEY_FILE) || Boolean(options?.allowGenerate);
  if (shouldCheckFile && existsSync(KEY_FILE)) {
    try {
      const data = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
      if (data.privateKey) {
        const privateKey = createEd25519PrivateKey(data.privateKey);
        const publicKey = createPublicKey(privateKey);
        const rawPub = getRawPublicKey(publicKey);
        const spkiPub = publicKey.export({ type: 'spki', format: 'der' });
        return {
          privateKey,
          publicKey,
          rawPublicKeyBase64: rawPub.toString('base64'),
          spkiPublicKeyBase64: spkiPub.toString('base64'),
        };
      }
    } catch (e) {
      console.error('Failed to read key from', KEY_FILE, e);
    }
  }

  if (options?.allowGenerate) {
    try {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const pkcs8Der = privateKey.export({ type: 'pkcs8', format: 'der' });
      const rawPub = getRawPublicKey(publicKey);
      const spkiPub = publicKey.export({ type: 'spki', format: 'der' });
      const privB64 = pkcs8Der.toString('base64');
      const rawPubB64 = rawPub.toString('base64');

      writeFileSync(
        KEY_FILE,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            algorithm: 'Ed25519',
            privateKey: privB64,
            publicKey: rawPubB64,
          },
          null,
          2
        ),
        { mode: 0o600 }
      );

      return {
        privateKey,
        publicKey,
        rawPublicKeyBase64: rawPubB64,
        spkiPublicKeyBase64: spkiPub.toString('base64'),
      };
    } catch (e) {
      console.error('Failed to generate Ed25519 keypair:', e);
      return null;
    }
  }

  return null;
}

/**
 * Returns public key info if available, without exposing private keys.
 */
export function getPublicKeyInfo(): { publicKey: string; spki: string; algorithm: 'Ed25519' } | null {
  const kp = getKeypair({ allowGenerate: true });
  if (!kp) return null;
  return {
    publicKey: kp.rawPublicKeyBase64,
    spki: kp.spkiPublicKeyBase64,
    algorithm: 'Ed25519',
  };
}

/**
 * Canonical string representation to sign for a checkpoint.
 */
export function checkpointMessage(seq: number, head: string, timestamp: number): string {
  return `${seq}:${head}:${timestamp}`;
}

/**
 * Sign the current ledger head using Ed25519.
 */
export function signCheckpoint(db: Db, options?: { allowGenerateKey?: boolean }): Checkpoint | null {
  const keypair = getKeypair(options ? { allowGenerate: options.allowGenerateKey } : undefined);
  if (!keypair) {
    return null;
  }

  const chain = verifyChain(db);
  if (!chain.ok) {
    throw new Error(`Cannot sign a broken chain: broken at row ${chain.brokenAt}`);
  }

  const timestamp = Date.now();
  const message = checkpointMessage(chain.rows, chain.head, timestamp);
  const signature = cryptoSign(null, Buffer.from(message), keypair.privateKey);

  return {
    seq: chain.rows,
    head: chain.head,
    timestamp,
    signature: signature.toString('base64'),
    publicKey: keypair.rawPublicKeyBase64,
  };
}

/**
 * Verify a checkpoint signature and ledger chain integrity up to the checkpoint sequence.
 * Accurately detects:
 * - valid checkpoints
 * - wrong key or invalid signature
 * - middle-edit tampering
 * - middle-delete tampering
 * - tail truncation (where ledger has fewer rows than the checkpoint commits to)
 */
export function verifyCheckpoint(
  db: Db,
  checkpoint: Checkpoint,
  trustedPublicKey?: string
): VerificationResult {
  const baseResult: VerificationResult = {
    chainValid: false,
    signatureValid: false,
    seq: checkpoint.seq,
    head: checkpoint.head,
    timestamp: checkpoint.timestamp,
    timestampReadable: new Date(checkpoint.timestamp).toISOString(),
  };

  // 1. Verify Ed25519 signature
  try {
    const pubKeyToUse = trustedPublicKey || checkpoint.publicKey;
    if (trustedPublicKey && checkpoint.publicKey !== trustedPublicKey) {
      return { ...baseResult, error: 'Public key mismatch' };
    }

    const pubKeyBuf = Buffer.from(pubKeyToUse, 'base64');
    let pubKeyObj: KeyObject;
    if (pubKeyBuf.length === 32) {
      const spkiDer = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pubKeyBuf]);
      pubKeyObj = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    } else {
      pubKeyObj = createPublicKey({ key: pubKeyBuf, format: 'der', type: 'spki' });
    }

    const message = checkpointMessage(checkpoint.seq, checkpoint.head, checkpoint.timestamp);
    const sigBuf = Buffer.from(checkpoint.signature, 'base64');
    const sigOk = cryptoVerify(null, Buffer.from(message), pubKeyObj, sigBuf);

    if (!sigOk) {
      return { ...baseResult, error: 'Invalid Ed25519 signature' };
    }
    baseResult.signatureValid = true;
  } catch (err: any) {
    return { ...baseResult, error: `Signature verification failed: ${err.message}` };
  }

  // 2. Check for tail truncation: total ledger rows must be at least checkpoint.seq
  const totalRows = db.val<number>('SELECT COUNT(*) FROM ledger') ?? 0;
  if (totalRows < checkpoint.seq) {
    return {
      ...baseResult,
      chainValid: false,
      error: `Tail truncated: checkpoint references seq ${checkpoint.seq} but ledger only has ${totalRows} rows`,
    };
  }

  // 3. Verify ledger rows up to checkpoint.seq
  let prev = GENESIS;
  let count = 0;
  let headAtSeq = '';

  const rows = db.all<any>('SELECT * FROM ledger ORDER BY seq ASC');
  for (const r of rows) {
    if (r.seq > checkpoint.seq) break;
    const want = sha(
      prev +
        canon({
          actionId: r.action_id,
          event: r.event,
          payload: JSON.parse(r.payload_json),
          ts: r.created_at,
        })
    );
    if (r.prev_hash !== prev || r.hash !== want) {
      return {
        ...baseResult,
        chainValid: false,
        error: `Chain broken at seq ${r.seq}: middle edit or deletion detected`,
      };
    }
    prev = r.hash;
    headAtSeq = r.hash;
    count++;
  }

  if (count !== checkpoint.seq) {
    return {
      ...baseResult,
      chainValid: false,
      error: `Row count mismatch: expected ${checkpoint.seq} consecutive rows, found ${count}`,
    };
  }

  if (checkpoint.seq > 0 && headAtSeq !== checkpoint.head) {
    return {
      ...baseResult,
      chainValid: false,
      error: `Head mismatch at seq ${checkpoint.seq}: expected ${checkpoint.head}, got ${headAtSeq}`,
    };
  }

  baseResult.chainValid = true;
  return baseResult;
}

/**
 * Store a checkpoint in the database
 */
export function storeCheckpoint(db: Db, checkpoint: Checkpoint): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS checkpoints (
      seq INTEGER PRIMARY KEY,
      head TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      signature TEXT NOT NULL,
      public_key TEXT NOT NULL
    )`
  );

  db.run(
    `INSERT OR REPLACE INTO checkpoints (seq, head, timestamp, signature, public_key) VALUES (?, ?, ?, ?, ?)`,
    checkpoint.seq,
    checkpoint.head,
    checkpoint.timestamp,
    checkpoint.signature,
    checkpoint.publicKey
  );
}

/**
 * Get the latest checkpoint from the database
 */
export function getLatestCheckpoint(db: Db): Checkpoint | null {
  db.run(
    `CREATE TABLE IF NOT EXISTS checkpoints (
      seq INTEGER PRIMARY KEY,
      head TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      signature TEXT NOT NULL,
      public_key TEXT NOT NULL
    )`
  );

  const row = db.one<any>('SELECT * FROM checkpoints ORDER BY seq DESC LIMIT 1');
  if (!row) return null;

  return {
    seq: row.seq,
    head: row.head,
    timestamp: row.timestamp,
    signature: row.signature,
    publicKey: row.public_key,
  };
}
