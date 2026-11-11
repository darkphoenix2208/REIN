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
