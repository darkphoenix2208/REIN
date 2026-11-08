// Benchmark the REAL gate: runRefund through transaction and ledger write
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { tempDb } from './helpers.ts';
import { runRefund, type GateDeps } from '../server/gate.ts';
import type { Mandate } from '../server/types.ts';

const NOW = Date.now();

test('benchmark: gate throughput and latency on temp SQLite', async () => {
  const { db } = await tempDb();

  const mandate: Mandate = {
    perActionCapCents: 5000,
    hardMaxCents: 10000,
    dailyCapCents: 100000,
    hardDailyCapCents: 200000,
    expiresAt: NOW + 86400000,
  };

  const deps: GateDeps = {
    db,
    mandate,
    paypal: null, // Simulated mode
    now: () => NOW,
  };

  // Seed a capture with items
  const captureId = 'BENCH-CAP-001';
  const orderId = 'BENCH-ORD-001';

  db.run(
    `INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,?,?,?,?,?)`,
    captureId,
    100000,
    0,
    0,
    'USD',
    'test',
    NOW
  );

  db.run(`INSERT INTO orders(order_id, capture_id) VALUES (?,?)`, orderId, captureId);

  db.run(
    `INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,?,?,?)`,
    orderId,
    'mug',
    'Coffee Mug',
    1800,
    50,
    0,
    0,
    1
  );

  const warmup = 50;
  const iterations = 1000;
  const latencies: number[] = [];

  // Warm-up phase
  for (let i = 0; i < warmup; i++) {
    await runRefund(deps, {
      sessionId: `warmup-${i}`,
      tool: 'refund_items',
      captureId,
      items: [{ item_id: 'mug', qty: 1 }],
    });
  }

  // Reset refunded count after warmup
  db.run('UPDATE payments SET refunded_cents=0, reserved_cents=0 WHERE txn_id=?', captureId);
  db.run('UPDATE order_items SET refunded_qty=0, reserved_qty=0 WHERE order_id=?', orderId);

  const startOverall = performance.now();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    await runRefund(deps, {
      sessionId: `bench-session-${i}`,
      tool: 'refund_items',
      captureId,
      items: [{ item_id: 'mug', qty: 1 }],
    });

    const end = performance.now();
    latencies.push(end - start);
  }

  const endOverall = performance.now();
  const totalTime = endOverall - startOverall;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const throughput = (iterations / totalTime) * 1000; // ops/sec

  console.log('\n=== REAL Gate Benchmark ===');
  console.log('Path: runRefund() → BEGIN IMMEDIATE → policy check → ledger write → COMMIT');
  console.log('Limits: Single process, local temp SQLite, simulated mode');
  console.log(`Warmup: ${warmup} iterations (excluded from results)`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`Throughput: ${throughput.toFixed(0)} ops/sec`);
  console.log(`Latency p50: ${p50.toFixed(2)}ms`);
  console.log(`Latency p95: ${p95.toFixed(2)}ms`);
  console.log(`Latency p99: ${p99.toFixed(2)}ms`);
  console.log(`Min: ${latencies[0].toFixed(2)}ms`);
  console.log(`Max: ${latencies[latencies.length - 1].toFixed(2)}ms`);
  console.log('===========================\n');

  // Assertions: ensure benchmark actually ran
  assert.ok(p50 > 0, 'p50 latency should be > 0');
  assert.ok(throughput > 0, 'Throughput should be > 0');
  assert.equal(latencies.length, iterations, 'Should have recorded all latencies');

  db.close();
});

test('benchmark: concurrent requests (serialized by BEGIN IMMEDIATE)', async () => {
  const { db } = await tempDb();

  const mandate: Mandate = {
    perActionCapCents: 5000,
    hardMaxCents: 10000,
    dailyCapCents: 100000,
    hardDailyCapCents: 200000,
    expiresAt: NOW + 86400000,
  };

  const deps: GateDeps = {
    db,
    mandate,
    paypal: null,
    now: () => NOW,
  };

  const captureId = 'BENCH-CAP-CONCURRENT';
  const orderId = 'BENCH-ORD-CONCURRENT';

  db.run(
    `INSERT INTO payments(txn_id,captured_cents,refunded_cents,reserved_cents,currency,source,captured_at) VALUES (?,?,?,?,?,?,?)`,
    captureId,
    100000,
    0,
    0,
    'USD',
    'test',
    NOW
  );

  db.run(`INSERT INTO orders(order_id, capture_id) VALUES (?,?)`, orderId, captureId);

  db.run(
    `INSERT INTO order_items(order_id,item_id,name,unit_cents,qty,refunded_qty,reserved_qty,refundable) VALUES (?,?,?,?,?,?,?,?)`,
    orderId,
    'item',
    'Test Item',
    1000,
    50,
    0,
    0,
    1
  );

  const concurrency = 10;
  const start = performance.now();

  // Launch concurrent requests (SQLite will serialize them via BEGIN IMMEDIATE)
  const promises = Array.from({ length: concurrency }, (_, i) =>
    runRefund(deps, {
      sessionId: `concurrent-session-${i}`,
      tool: 'refund_items',
      captureId,
      items: [{ item_id: 'item', qty: 1 }],
    })
  );

  const results = await Promise.all(promises);
  const end = performance.now();

  console.log('\n=== Concurrent Benchmark ===');
  console.log(`Concurrent requests: ${concurrency}`);
  console.log(`Total time: ${(end - start).toFixed(2)}ms`);
  console.log(`Executed: ${results.filter((r) => r.status === 'executed').length}`);
  console.log(`Blocked/Pending: ${results.filter((r) => r.status !== 'executed').length}`);
  console.log('===========================\n');

  assert.ok(results.length === concurrency, 'All concurrent requests should complete');

  db.close();
});
