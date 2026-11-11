import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { checkVelocity } from '../server/velocity.ts';

test('velocity check: within limits', async () => {
  const db = await openDb(':memory:');
  applySchema(db);

  const rule = { maxActions: 3, maxAmountCents: 50000, windowHours: 24 };
  const result = checkVelocity(db, 'customer-1', 1000, rule, Date.now());

  assert.equal(result.status, 'allowed');
  assert.equal(result.currentActions, 0);
  assert.equal(result.currentAmountCents, 0);

  db.close();
});

test('velocity check: action limit exceeded', async () => {
  const db = await openDb(':memory:');
  applySchema(db);

  const nowMs = Date.now();
  const rule = { maxActions: 2, maxAmountCents: 100000, windowHours: 24 };

  // Insert 2 executed actions in ledger within window
  db.run(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`, nowMs - 1000, JSON.stringify({ customerId: 'customer-1', amountCents: 1000 }));
  db.run(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (2, ?, 'executed', 'hash2', 'hash1', ?)`, nowMs - 2000, JSON.stringify({ customerId: 'customer-1', amountCents: 2000 }));

  const result = checkVelocity(db, 'customer-1', 500, rule, nowMs);

  assert.equal(result.status, 'exceeded');
  assert.equal(result.currentActions, 2);
  assert.match(result.message!, /has 2 refunds/);

  db.close();
});

test('velocity check: amount limit exceeded', async () => {
  const db = await openDb(':memory:');
  applySchema(db);

  const nowMs = Date.now();
  const rule = { maxActions: 10, maxAmountCents: 10000, windowHours: 24 };

  // Insert action with $90 within window
  db.run(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`, nowMs - 1000, JSON.stringify({ customerId: 'customer-1', amountCents: 9000 }));

  // Try to add $20 more (would exceed $100 limit)
  const result = checkVelocity(db, 'customer-1', 2000, rule, nowMs);

  assert.equal(result.status, 'exceeded');
  assert.equal(result.currentAmountCents, 9000);
  assert.match(result.message!, /\$90\.00.*\$100\.00/);

  db.close();
});

test('velocity check: approaching limits', async () => {
  const db = await openDb(':memory:');
  applySchema(db);

  const nowMs = Date.now();
  const rule = { maxActions: 5, maxAmountCents: 50000, windowHours: 24 };

  // Insert 3 actions (4th would be 80% of 5)
  for (let i = 1; i <= 3; i++) {
    db.run(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
      VALUES (?, ?, 'executed', ?, ?, ?)`, i, nowMs - i * 1000, `hash${i}`, i === 1 ? '0' : `hash${i-1}`, JSON.stringify({ customerId: 'customer-1', amountCents: 5000 }));
  }

  // This would be 4th action (80% of 5) - should trigger approaching
  const result = checkVelocity(db, 'customer-1', 5000, rule, nowMs);

  assert.equal(result.status, 'approaching');
  assert.equal(result.currentActions, 3);
  assert.match(result.message!, /approaching velocity limits/);

  db.close();
});

test('velocity check: window boundary - old actions excluded', async () => {
  const db = await openDb(':memory:');
  applySchema(db);

  const nowMs = Date.now();
  const rule = { maxActions: 2, maxAmountCents: 10000, windowHours: 24 };
  const windowMs = 24 * 60 * 60 * 1000;

  // Insert action just outside window (24h 1ms ago) - should NOT count
  db.run(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`, nowMs - windowMs - 1, JSON.stringify({ customerId: 'customer-1', amountCents: 5000 }));

  // Insert action just inside window (24h 0ms ago) - should count
  db.run(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (2, ?, 'executed', 'hash2', 'hash1', ?)`, nowMs - windowMs, JSON.stringify({ customerId: 'customer-1', amountCents: 3000 }));

  const result = checkVelocity(db, 'customer-1', 1000, rule, nowMs);

  assert.equal(result.currentActions, 1); // Only the second action counts
  assert.equal(result.currentAmountCents, 3000);
  assert.equal(result.status, 'approaching'); // 2 projected actions = 100% of maxActions=2

  db.close();
});

test('velocity check: different customers isolated', async () => {
  const db = await openDb(':memory:');
  applySchema(db);

  const nowMs = Date.now();
  const rule = { maxActions: 2, maxAmountCents: 10000, windowHours: 24 };

  // Customer 1 has 2 actions
  db.run(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (1, ?, 'executed', 'hash1', '0', ?)`, nowMs - 1000, JSON.stringify({ customerId: 'customer-1', amountCents: 5000 }));
  db.run(`INSERT INTO ledger (seq, created_at, event, hash, prev_hash, payload_json)
    VALUES (2, ?, 'executed', 'hash2', 'hash1', ?)`, nowMs - 2000, JSON.stringify({ customerId: 'customer-1', amountCents: 4000 }));

  // Customer 2 checks velocity - should see 0 actions
  const result = checkVelocity(db, 'customer-2', 1000, rule, nowMs);

  assert.equal(result.currentActions, 0);
  assert.equal(result.currentAmountCents, 0);
  assert.equal(result.status, 'allowed');

  db.close();
});
