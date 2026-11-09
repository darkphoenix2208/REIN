// Pure browser-side ledger verification, importable from Node tests: it only needs WebCrypto (globalThis.crypto.subtle).
// The server hashes sha256(prev_hash + canon({actionId, event, payload, ts})); this module recomputes exactly that, row by row.
export interface Checkpoint { seq: number; head: string; timestamp: number; signature: string; publicKey: string }
export interface LedgerRow {
  seq: number; created_at: number; event: string; action_id: string;
  rule_id?: string; amount_cents?: number; hash: string; prev_hash?: string; payload_json?: string;
}
export interface RowVerification {
  seq: number; event: string; amountCents?: number; ruleId?: string; hash: string; prevHash: string;
  ok: boolean; tampered?: boolean; reason?: string;
}

export const GENESIS = '0'.repeat(64);

export function canon(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x,
  );
}

export async function sha256Hex(str: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const b64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s), out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Ed25519 check of the checkpoint. true/false = verified/rejected; null = this browser has no Ed25519 (caller may ask the server). */
export async function verifyCheckpointSignature(cp: Checkpoint): Promise<boolean | null> {
  try {
    const key = await globalThis.crypto.subtle.importKey('raw', b64(cp.publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, b64(cp.signature), new TextEncoder().encode(`${cp.seq}:${cp.head}:${cp.timestamp}`));
  } catch (e: any) {
    return e?.name === 'NotSupportedError' ? null : false;
  }
}

/**
 * Recompute the hash chain from GENESIS up to the checkpoint's row count and compare with the signed head.
 * A row with no payload_json CANNOT be verified and is reported as failed (never assumed fine).
 */
export async function verifyChainRows(rows: LedgerRow[], cp: Checkpoint): Promise<{ rows: RowVerification[]; chainOk: boolean }> {
  const sorted = rows.slice().sort((a, b) => a.seq - b.seq);
  let prev = GENESIS, allOk = true;
  const out: RowVerification[] = [];
  for (const r of sorted) {
    if (r.seq > cp.seq) break;
    let hashMatches = false;
    if (typeof r.payload_json === 'string') {
      try {
        hashMatches = (await sha256Hex(prev + canon({ actionId: r.action_id, event: r.event, payload: JSON.parse(r.payload_json), ts: r.created_at }))) === r.hash;
      } catch { hashMatches = false; }
    }
    const prevMatches = (r.prev_hash ?? '') === prev;
    const ok = prevMatches && hashMatches;
    if (!ok) allOk = false;
    out.push({
      seq: r.seq, event: r.event, ...(r.amount_cents !== undefined ? { amountCents: r.amount_cents } : {}), ...(r.rule_id !== undefined ? { ruleId: r.rule_id } : {}),
      hash: r.hash, prevHash: r.prev_hash ?? '', ok, tampered: !ok,
      ...(ok ? {} : { reason: !prevMatches ? 'Previous hash broken' : typeof r.payload_json !== 'string' ? 'No payload to verify' : 'Payload hash mismatch' }),
    });
    prev = r.hash;
  }
  const head = sorted.find((r) => r.seq === cp.seq);
  const headMatches = cp.seq === 0 ? true : head?.hash === cp.head;
  return { rows: out, chainOk: allOk && headMatches && (cp.seq === 0 || out.length === cp.seq) };
}
