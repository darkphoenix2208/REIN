import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { decide } from "../server/policy.ts";

function loadMandate(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

const ITERATIONS = 1000;
const mandate = loadMandate("mandate.json");
const NOW = Date.now();

console.log("Benchmarking Rein gate performance...");
console.log(`Iterations: ${ITERATIONS}`);

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
