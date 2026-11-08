// Rein Performance Benchmark
import { performance } from "node:perf_hooks";
import { createDb } from "../server/db.ts";
import { decide } from "../server/policy.ts";
import { loadMandate } from "../server/mandate.ts";

const ITERATIONS = 1000;
const mandate = loadMandate("mandate.json");
const db = createDb(":memory:");

const NOW = Date.now();
db.run(`INSERT INTO payments(txn_id,captured_cents,currency,source,captured_at) VALUES (?,?,?,?,?)`, "CAP1", 20000, "USD", "bench", NOW);

console.log("Benchmarking Rein gate performance...");
console.log(`Iterations: ${ITERATIONS}");

const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  decide({ amountCents: 1000 }, mandate, { now: NOW, dup: false });
}
const end = performance.now();

const totalMs = end - start;
const avgMs = totalMs / ITERATIONS;
const throughput = (ITERATIONS / totalMs) * 1000;

console.log(`Total: ${totalMs.toFixed(2)}ms`);
console.log(`Average: ${avgMs.toFixed(4)}ms per decision`);
console.log(`Throughput: ${throughput.toFixed(0)} decisions/sec`);

db.close();
