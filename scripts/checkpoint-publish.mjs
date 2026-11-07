// Sign the ledger head and write to checkpoint-published.json
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { signCheckpoint, storeCheckpoint } from '../server/checkpoint.ts';
import { verifyChain } from '../server/ledger.ts';

const dbPath = process.env.REIN_DB_PATH || join(process.cwd(), 'rein.db');
const targetFile = join(process.cwd(), 'checkpoint-published.json');

console.log(`[checkpoint-publish] Opening DB: ${dbPath}`);
const db = await openDb(dbPath);
applySchema(db);

const chain = verifyChain(db);
if (!chain.ok) {
  console.error(`[checkpoint-publish] ERROR: Cannot publish checkpoint for broken chain (broken at row ${chain.brokenAt})`);
  db.close();
  process.exit(1);
}

const checkpoint = signCheckpoint(db, { allowGenerateKey: true });
if (!checkpoint) {
  console.error('[checkpoint-publish] ERROR: Failed to sign checkpoint (no key available and generation disabled)');
  db.close();
  process.exit(1);
}

storeCheckpoint(db, checkpoint);
db.close();

const payload = {
  publishedAt: new Date().toISOString(),
  algorithm: 'Ed25519',
  checkpoint,
  honestBoundary: 'Checkpoints detect post-publication tampering. They do not prevent a malicious database administrator with keys from modifying history prior to publication.',
};

writeFileSync(targetFile, JSON.stringify(payload, null, 2), 'utf8');
console.log(`[checkpoint-publish] Successfully published checkpoint to ${targetFile}`);
console.log(`  Seq:       ${checkpoint.seq}`);
console.log(`  Head:      ${checkpoint.head}`);
console.log(`  Signature: ${checkpoint.signature.slice(0, 32)}...`);
console.log(`  PublicKey: ${checkpoint.publicKey.slice(0, 32)}...`);
