// Multi-instance support tests
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SingleInstanceLock,
  createDistributedLock,
  isMultiInstanceEnabled,
  withDistributedLock,
} from '../server/multi-instance.ts';

describe('Multi-instance support', () => {
  test('SingleInstanceLock always acquires successfully', async () => {
    const lock = new SingleInstanceLock();

    const acquired = await lock.acquire('test-resource', 5000);
    assert.equal(acquired, true);

    await lock.release('test-resource');
    // No error should be thrown
  });

  test('SingleInstanceLock extend always succeeds', async () => {
    const lock = new SingleInstanceLock();

    await lock.acquire('test-resource', 5000);
    const extended = await lock.extend('test-resource', 10000);
    assert.equal(extended, true);

    await lock.release('test-resource');
  });

  test('isMultiInstanceEnabled returns false without DATABASE_URL', () => {
    const oldUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const result = isMultiInstanceEnabled();
    assert.equal(result, false);

    if (oldUrl) process.env.DATABASE_URL = oldUrl;
  });

  test('isMultiInstanceEnabled returns true with postgres DATABASE_URL', () => {
    const oldUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://localhost/test';

    const result = isMultiInstanceEnabled();
    assert.equal(result, true);

    if (oldUrl) process.env.DATABASE_URL = oldUrl;
    else delete process.env.DATABASE_URL;
  });

  test('createDistributedLock returns SingleInstanceLock for SQLite', () => {
    const oldUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const lock = createDistributedLock();
    assert.ok(lock instanceof SingleInstanceLock);

    if (oldUrl) process.env.DATABASE_URL = oldUrl;
  });

  test('withDistributedLock executes function and returns result', async () => {
    let executed = false;

    const result = await withDistributedLock('test-resource', 5000, async () => {
      executed = true;
      return 'success';
    });

    assert.equal(executed, true);
    assert.equal(result, 'success');
  });

  test('withDistributedLock handles errors gracefully', async () => {
    let errorThrown = false;

    try {
      await withDistributedLock('test-resource', 5000, async () => {
        throw new Error('Test error');
      });
    } catch (error: any) {
      errorThrown = true;
      assert.equal(error.message, 'Test error');
    }

    assert.equal(errorThrown, true);
  });

  test('multiple lock acquisitions on same resource succeed in single-instance mode', async () => {
    const lock = new SingleInstanceLock();

    // In single-instance mode, "locks" are handled by SQLite BEGIN IMMEDIATE
    // So this test verifies the API works correctly
    const lock1 = await lock.acquire('resource-1', 5000);
    const lock2 = await lock.acquire('resource-1', 5000);

    assert.equal(lock1, true);
    assert.equal(lock2, true);

    await lock.release('resource-1');
  });
});
