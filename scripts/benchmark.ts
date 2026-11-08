// Benchmark the REAL gate: runRefund through database transaction and ledger write
import { performance } from 'node:perf_hooks';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { runRefund, type GateDeps } from '../server/gate.ts';
import type { Mandate } from '../server/types.ts';

const NOW = Date.now();

async function benchmark() {
  // Create temp database
  const dbPath = join(mkdtempSync(join(tmpdir(), 'rein-bench-')), 'bench.db');
  const db = await openDb(dbPath);
  applySchema(db);

  const mandate: Mandate = {
    perActionCapCents: 5000,
    hardMaxCents: 10000,
    dailyCapCents: 100000,
    hardDailyCapCents: 200000,
    expiresAt: NOW + 86400000,
    returnWindowDays: 30,
    blockIfOpenDispute: true,
    shadow: false,
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

  console.log('=== Rein Gate Benchmark ===');
  console.log('Path: runRefund() → BEGIN IMMEDIATE → policy check → ledger write → COMMIT');
  console.log('Limits: Single process, local temp SQLite, simulated mode\n');

  // Warm-up phase
  console.log(`Warming up (${warmup} iterations)...`);
  for (let i = 0; i < warmup; i++) {
    await runRefund(deps, {
      sessionId: `warmup-${i}`,
      tool: 'refund_items',
      captureId,
      amountCents: null,
      items: [{ itemId: 'mug', qty: 1 }],
    });
  }

  // Reset refunded count after warmup
  db.run('UPDATE payments SET refunded_cents=0, reserved_cents=0 WHERE txn_id=?', captureId);
  db.run('UPDATE order_items SET refunded_qty=0, reserved_qty=0 WHERE order_id=?', orderId);

  console.log(`Running benchmark (${iterations} iterations)...\n`);

  const startOverall = performance.now();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    await runRefund(deps, {
      sessionId: `bench-session-${i}`,
      tool: 'refund_items',
      captureId,
      amountCents: null,
      items: [{ itemId: 'mug', qty: 1 }],
    });

    const end = performance.now();
    latencies.push(end - start);
  }

  const endOverall = performance.now();
  const totalTime = endOverall - startOverall;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const throughput = (iterations / totalTime) * 1000; // ops/sec

  console.log('=== Results ===');
  console.log(`Iterations: ${iterations}`);
  console.log(`Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`Throughput: ${throughput.toFixed(0)} ops/sec`);
  console.log(`Latency p50: ${p50.toFixed(2)}ms`);
  console.log(`Latency p99: ${p99.toFixed(2)}ms`);
  console.log('===============\n');

  db.close();
}

benchmark().catch(console.error);
