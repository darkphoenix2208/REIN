#!/usr/bin/env node
// scripts/probe-live.mjs
// Probes a live Rein deployment without credentials to check mode, health, and checkpoint keys.
// Usage: node scripts/probe-live.mjs [url]

const baseUrl = (process.argv[2] || process.env.REIN_PUBLIC_URL || 'http://127.0.0.1:4317').replace(/\/+$/, '');

console.log(`\n=== PROBING REIN DEPLOYMENT: ${baseUrl} ===\n`);

async function fetchJson(endpoint) {
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    const status = res.status;
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }
    return { ok: res.ok, status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

async function main() {
  // 1. Healthz
  const healthz = await fetchJson('/healthz');
  console.log(`[1] GET /healthz: HTTP ${healthz.status}`);
  if (healthz.ok && typeof healthz.data === 'object') {
    console.log(`    Status: ${healthz.data.status}`);
    console.log(`    Mode:   ${healthz.data.mode} ${healthz.data.mode === 'live' ? '(LIVE-FIRE with real PayPal sandbox)' : '(SIMULATED - stubbed PayPal)'}`);
    console.log(`    Uptime: ${Math.round(healthz.data.uptime || 0)}s`);
  } else {
    console.log(`    Error:  ${healthz.error || JSON.stringify(healthz.data)}`);
  }

  // 2. Readyz
  const readyz = await fetchJson('/readyz');
  console.log(`\n[2] GET /readyz: HTTP ${readyz.status}`);
  if (readyz.ok) {
    console.log(`    Status: SQLite ready (${JSON.stringify(readyz.data)})`);
  } else {
    console.log(`    Error:  ${readyz.error || JSON.stringify(readyz.data)}`);
  }

  // 3. Checkpoint Public Key
  const pubkey = await fetchJson('/v1/ledger/pubkey');
  console.log(`\n[3] GET /v1/ledger/pubkey: HTTP ${pubkey.status}`);
  if (pubkey.ok && pubkey.data?.publicKey) {
    console.log(`    Public Key: ${pubkey.data.publicKey}`);
  } else {
    console.log(`    Response:   ${JSON.stringify(pubkey.data || pubkey.error)}`);
  }

  // 4. Latest Checkpoint
  const checkpoint = await fetchJson('/v1/ledger/checkpoint/latest');
  console.log(`\n[4] GET /v1/ledger/checkpoint/latest: HTTP ${checkpoint.status}`);
  if (checkpoint.ok && checkpoint.data) {
    console.log(`    Seq:        ${checkpoint.data.checkpoint?.sequence ?? checkpoint.data.sequence ?? 'N/A'}`);
    console.log(`    LedgerHead: ${checkpoint.data.checkpoint?.ledgerHead ?? checkpoint.data.ledgerHead ?? 'N/A'}`);
    console.log(`    Signature:  ${(checkpoint.data.checkpoint?.signature ?? checkpoint.data.signature ?? '').slice(0, 24)}...`);
  } else {
    console.log(`    Response:   ${JSON.stringify(checkpoint.data || checkpoint.error)}`);
  }

  console.log('\n=== PROBE COMPLETE ===\n');
}

main().catch(err => {
  console.error('Probe failed:', err);
  process.exit(1);
});
