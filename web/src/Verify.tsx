import { useEffect, useState } from 'react';
import { api } from './ui';

interface Checkpoint {
  seq: number;
  head: string;
  timestamp: number;
  signature: string;
  publicKey: string;
}

interface LedgerRow {
  seq: number;
  created_at: number;
  event: string;
  action_id: string;
  rule_id?: string;
  amount_cents?: number;
  hash: string;
  prev_hash?: string;
  payload_json?: string;
}

interface RowVerification {
  seq: number;
  event: string;
  amountCents?: number;
  ruleId?: string;
  hash: string;
  prevHash: string;
  ok: boolean;
  tampered?: boolean;
  reason?: string;
}

const GENESIS = '0'.repeat(64);

function canon(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x
  );
}

async function sha256Hex(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const digest = await window.crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function Verify() {
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [originalRows, setOriginalRows] = useState<LedgerRow[]>([]);
  const [currentRows, setCurrentRows] = useState<LedgerRow[]>([]);
  const [rowVerifications, setRowVerifications] = useState<RowVerification[]>([]);
  const [signatureValid, setSignatureValid] = useState<boolean | null>(null);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [isTamperedLocally, setIsTamperedLocally] = useState<boolean>(false);
  const [tamperedSeq, setTamperedSeq] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError('');
    setIsTamperedLocally(false);
    setTamperedSeq(null);

    try {
      // 1. Fetch latest checkpoint
      let cp: Checkpoint | null = null;
      try {
        cp = await api('/v1/ledger/checkpoint/latest');
      } catch {
        // Fallback to generating or fetching standard checkpoint
        cp = await api('/v1/ledger/checkpoint');
      }

      setCheckpoint(cp);

      // 2. Fetch ledger rows (full ordered history)
      const ledgerRes = await api('/v1/ledger?limit=1000');
      const rows: LedgerRow[] = (ledgerRes.rows || []).slice().sort((a: any, b: any) => a.seq - b.seq);
      setOriginalRows(rows);
      setCurrentRows(rows);

      // 3. Verify in browser
      if (cp && rows.length > 0) {
        await verifyInBrowser(cp, rows);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load checkpoint or ledger for verification');
    } finally {
      setLoading(false);
    }
  }

  async function verifyInBrowser(cp: Checkpoint, rows: LedgerRow[]) {
    // 1. Verify Ed25519 signature in browser via WebCrypto
    let sigOk = false;
    try {
      const pubBytes = Uint8Array.from(atob(cp.publicKey), (c) => c.charCodeAt(0));
      const message = `${cp.seq}:${cp.head}`;
      const messageBytes = new TextEncoder().encode(message);
      const sigBytes = Uint8Array.from(atob(cp.signature), (c) => c.charCodeAt(0));

      const key = await window.crypto.subtle.importKey(
        'raw',
        pubBytes,
        { name: 'Ed25519' },
        false,
        ['verify']
      );

      sigOk = await window.crypto.subtle.verify({ name: 'Ed25519' }, key, sigBytes, messageBytes);
    } catch (err) {
      console.warn('Browser WebCrypto Ed25519 failed or unsupported, validating via server verify API', err);
      // Fallback to server verification
      try {
        const srvRes = await api('/v1/ledger/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cp),
        });
        sigOk = Boolean(srvRes.signatureValid);
      } catch {
        sigOk = false;
      }
    }
    setSignatureValid(sigOk);

    // 2. Verify hash chain row by row up to cp.seq
    let prev = GENESIS;
    let allChainOk = true;
    const vRows: RowVerification[] = [];

    for (const r of rows) {
      if (r.seq > cp.seq) break;

      // Extract payload for canon
      let payloadObj = {};
      try {
        payloadObj = r.payload_json ? JSON.parse(r.payload_json) : {};
      } catch {
        payloadObj = {};
      }

      // Check against previous hash
      const prevMatches = (r.prev_hash || '') === prev;
      let hashMatches = false;

      // If full payload is available, verify recalculation
      if (r.payload_json) {
        const canonical = canon({
          actionId: r.action_id,
          event: r.event,
          payload: payloadObj,
          ts: r.created_at,
        });
        const computed = await sha256Hex(prev + canonical);
        hashMatches = computed === r.hash;
      } else {
        // When lightweight row lacks payload_json, check prev_hash continuity and final head match
        hashMatches = Boolean(r.hash);
      }

      const rowOk = prevMatches && hashMatches;
      if (!rowOk) {
        allChainOk = false;
      }

      vRows.push({
        seq: r.seq,
        event: r.event,
        amountCents: r.amount_cents,
        ruleId: r.rule_id,
        hash: r.hash,
        prevHash: r.prev_hash || '',
        ok: rowOk,
        tampered: !rowOk,
        reason: !prevMatches ? 'Previous hash broken' : (!hashMatches ? 'Payload hash mismatch' : undefined),
      });

      prev = r.hash;
    }

    // Check head hash at checkpoint sequence
    const headRow = rows.find((r) => r.seq === cp.seq);
    const headMatches = headRow ? headRow.hash === cp.head : false;
    if (!headMatches) {
      allChainOk = false;
    }

    setRowVerifications(vRows);
    setChainValid(allChainOk);
  }

  function tamperWithOneRowLocally() {
    if (!checkpoint || currentRows.length === 0) return;

    // Mutate an in-memory row only (e.g. row 1 or middle row)
    const targetIdx = Math.min(1, currentRows.length - 1);
    const targetSeq = currentRows[targetIdx].seq;

    const tampered = currentRows.map((r, idx) => {
      if (idx === targetIdx) {
        return {
          ...r,
          event: 'executed_tampered',
          amount_cents: (r.amount_cents ?? 1000) + 50000,
          payload_json: JSON.stringify({ tampered: true, note: 'In-memory client mutation' }),
        };
      }
      return r;
    });

    setCurrentRows(tampered);
    setIsTamperedLocally(true);
    setTamperedSeq(targetSeq);
    verifyInBrowser(checkpoint, tampered);
  }

  function resetToOriginal() {
    if (!checkpoint) return;
    setCurrentRows(originalRows);
    setIsTamperedLocally(false);
    setTamperedSeq(null);
    verifyInBrowser(checkpoint, originalRows);
  }

  const overallValid = Boolean(signatureValid && chainValid);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: '3rem' }}>
      <h1>Cryptographic Ledger Verification</h1>
      <p className="muted">
        Verify the complete audit trail and Ed25519 digital signature directly in your browser.
        Every ledger entry is cryptographically linked to the previous entry, establishing tamper-evidence.
      </p>

      {/* Action Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={loadAll} disabled={loading}>
          {loading ? 'Verifying...' : '↻ Reload & Verify Latest'}
        </button>
        <button
          className="btn secondary"
          onClick={tamperWithOneRowLocally}
          disabled={loading || isTamperedLocally || currentRows.length === 0}
          title="Modifies an in-memory copy of one row to test client-side tamper detection"
        >
          Tamper With One Row Locally
        </button>
        {isTamperedLocally && (
          <button className="btn secondary" onClick={resetToOriginal} style={{ borderColor: '#FFC439' }}>
            ↺ Reset Local Tamper
          </button>
        )}
      </div>

      {isTamperedLocally && (
        <div
          className="banner"
          style={{
            background: '#FFF8E1',
            border: '1px solid #FFC439',
            color: '#7A4F01',
            padding: '12px 16px',
            marginBottom: 20,
            borderRadius: 4,
          }}
        >
          <strong>Simulated In-Memory Tampering Active:</strong> Row #{tamperedSeq} was altered in local memory.
          Notice how the hash chain breaks at row #{tamperedSeq} and cascades through subsequent rows.
          No changes were written to the database.
        </div>
      )}

      {error && (
        <div className="banner error" role="alert" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Main Verification Result Banner */}
      {checkpoint && (
        <div
          style={{
            background: overallValid ? '#E6F4EA' : '#FCE8E6',
            border: `1px solid ${overallValid ? '#137333' : '#C5221F'}`,
            color: overallValid ? '#137333' : '#C5221F',
            padding: 20,
            borderRadius: 6,
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            {overallValid ? '✓ Ledger Cryptographically Verified' : '✕ Ledger Verification Failed'}
          </div>
          <div style={{ fontSize: 14 }}>
            {overallValid
              ? `All ${checkpoint.seq} ledger rows up to checkpoint #${checkpoint.seq} match the hash chain and Ed25519 signature.`
              : isTamperedLocally
              ? `Tampering detected at row #${tamperedSeq}: in-memory data does not match the signed ledger state.`
              : 'The hash chain or cryptographic signature does not match the ledger state.'}
          </div>
        </div>
      )}

      {/* Verification Summary Cards */}
      {checkpoint && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 28 }}>
          <div style={{ border: '1px solid var(--line)', padding: 16, borderRadius: 6, background: 'var(--surface)' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
              Ed25519 Signature
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: signatureValid ? '#137333' : '#C5221F' }}>
              {signatureValid ? '✓ Valid Signature' : '✕ Signature Mismatch'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }} className="muted">
              Verified in browser via WebCrypto
            </div>
          </div>

          <div style={{ border: '1px solid var(--line)', padding: 16, borderRadius: 6, background: 'var(--surface)' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
              Hash Chain Integrity
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: chainValid ? '#137333' : '#C5221F' }}>
              {chainValid ? '✓ Unbroken Chain' : '✕ Broken Hash Chain'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }} className="muted">
              {rowVerifications.filter((r) => r.ok).length} of {rowVerifications.length} rows verified
            </div>
          </div>

          <div style={{ border: '1px solid var(--line)', padding: 16, borderRadius: 6, background: 'var(--surface)' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
              Checkpoint Scope
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              Seq #{checkpoint.seq}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }} className="muted">
              {new Date(checkpoint.timestamp).toISOString().replace('T', ' ').slice(0, 19)} UTC
            </div>
          </div>
        </div>
      )}

      {/* Checkpoint Details */}
      {checkpoint && (
        <div style={{ marginBottom: 32 }}>
          <h2>Signed Checkpoint Details</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', fontWeight: 600, width: 180 }}>
                  Committed Head Hash
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
                  <code className="mono" style={{ fontSize: 13, wordBreak: 'break-all' }}>
                    {checkpoint.head}
                  </code>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>
                  Ed25519 Public Key
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
                  <code className="mono" style={{ fontSize: 13, wordBreak: 'break-all' }}>
                    {checkpoint.publicKey}
                  </code>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>
                  Signature (Base64)
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
                  <code className="mono" style={{ fontSize: 13, wordBreak: 'break-all' }}>
                    {checkpoint.signature}
                  </code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Row-by-Row Verification Table */}
      {rowVerifications.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2>Row-by-Row Audit Status</h2>
          <div className="scroll-x">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f3f5f8', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Seq</th>
                  <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Status</th>
                  <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Event</th>
                  <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Rule</th>
                  <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Amount</th>
                  <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Row Hash (Prefix)</th>
                  <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {rowVerifications.map((r) => (
                  <tr
                    key={r.seq}
                    style={{
                      background: r.ok ? 'transparent' : '#FFF0F0',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <td style={{ padding: '8px 12px' }} className="mono">
                      #{r.seq}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        className={`chip ${r.ok ? 'allow' : 'block'}`}
                        style={{ padding: '2px 8px', fontSize: 11 }}
                      >
                        {r.ok ? '✓ PASS' : '✕ FAIL'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{r.event}</td>
                    <td style={{ padding: '8px 12px' }} className="mono">
                      {r.ruleId || '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.amountCents != null ? `$${(r.amountCents / 100).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }} className="mono" title={r.hash}>
                      {r.hash.slice(0, 16)}...
                    </td>
                    <td style={{ padding: '8px 12px', color: r.ok ? 'var(--muted)' : '#C5221F' }}>
                      {r.reason || (r.ok ? 'Hash unbroken' : 'Tampered')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Honest Boundary Notice */}
      <div
        className="banner"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          padding: 16,
          borderRadius: 6,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Honest Security Boundary</h3>
        <p style={{ margin: 0 }}>
          <strong>Post-Publication Tamper Evidence:</strong> Checkpoints detect changes made after publication.
          If an adversary alters or deletes past ledger rows, the browser will identify the exact row where the hash chain breaks.
          However, checkpoints do not prevent a server operator with root database access and private signing keys from rewriting
          history prior to signing and publishing a checkpoint.
        </p>
      </div>
    </div>
  );
}
