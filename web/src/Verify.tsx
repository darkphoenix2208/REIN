import { useEffect, useState } from 'react';
import { api } from './ui';

interface Checkpoint {
  seq: number;
  head: string;
  timestamp: number;
  signature: string;
  publicKey: string;
}

interface VerifyResult {
  valid: boolean;
  checkpoint: Checkpoint;
  ledgerHead: string;
  chainValid: boolean;
  signatureValid: boolean;
  message?: string;
}

export function Verify() {
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load latest checkpoint on mount
  useEffect(() => {
    loadLatestCheckpoint();
  }, []);

  async function loadLatestCheckpoint() {
    setLoading(true);
    setError('');
    try {
      const cp = await api('/v1/ledger/checkpoint');
      setCheckpoint(cp);
      // Auto-verify the latest checkpoint
      await verifyCheckpoint(cp);
    } catch (e: any) {
      setError(e.message || 'Failed to load checkpoint');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCheckpoint(cp: Checkpoint) {
    setLoading(true);
    setError('');
    try {
      const result = await api('/v1/ledger/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cp),
      });
      setVerifyResult(result);
    } catch (e: any) {
      setError(e.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  function exportCheckpoint() {
    if (!checkpoint) return;
    const blob = new Blob([JSON.stringify(checkpoint, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rein-checkpoint-${checkpoint.seq}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1>Checkpoint Verification</h1>
      <p className="muted">
        Ed25519 signed checkpoints provide cryptographic proof of the ledger state at a point in time.
        Export and verify these offline to detect any tampering.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button onClick={loadLatestCheckpoint} disabled={loading}>
          {loading ? 'Loading...' : '↻ Load Latest Checkpoint'}
        </button>
        {checkpoint && (
          <button onClick={exportCheckpoint}>
            ↓ Export JSON
          </button>
        )}
      </div>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {checkpoint && (
        <div style={{ marginBottom: 32 }}>
          <h2>Checkpoint #{checkpoint.seq}</h2>
          <table style={{ width: '100%', background: 'var(--surface)', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)', fontWeight: 600, width: 180 }}>
                  Sequence
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)' }} className="mono">
                  {checkpoint.seq}
                </td>
              </tr>
              <tr>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)', fontWeight: 600 }}>
                  Timestamp
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
                  {new Date(checkpoint.timestamp).toISOString()}
                  <span className="muted" style={{ marginLeft: 8 }}>
                    ({Math.floor((Date.now() - checkpoint.timestamp) / 1000)}s ago)
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)', fontWeight: 600 }}>
                  Ledger Head
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
                  <code
                    className="mono"
                    style={{ fontSize: 13, wordBreak: 'break-all', cursor: 'pointer' }}
                    onClick={() => copyToClipboard(checkpoint.head)}
                    title="Click to copy"
                  >
                    {checkpoint.head}
                  </code>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)', fontWeight: 600 }}>
                  Public Key
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
                  <code
                    className="mono"
                    style={{ fontSize: 13, cursor: 'pointer' }}
                    onClick={() => copyToClipboard(checkpoint.publicKey)}
                    title="Click to copy"
                  >
                    {checkpoint.publicKey}
                  </code>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 12, fontWeight: 600 }}>
                  Signature
                </td>
                <td style={{ padding: 12 }}>
                  <code
                    className="mono"
                    style={{ fontSize: 13, cursor: 'pointer' }}
                    onClick={() => copyToClipboard(checkpoint.signature)}
                    title="Click to copy"
                  >
                    {checkpoint.signature}
                  </code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {verifyResult && (
        <div style={{ marginBottom: 32 }}>
          <h2>Verification Result</h2>
          <div
            className="banner"
            style={{
              background: verifyResult.valid ? 'var(--success-bg)' : 'var(--error-bg)',
              border: `1px solid ${verifyResult.valid ? 'var(--success)' : 'var(--error)'}`,
              color: verifyResult.valid ? 'var(--success)' : 'var(--error)',
              padding: 16,
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {verifyResult.valid ? '✓ Valid Checkpoint' : '✗ Invalid Checkpoint'}
            </div>
            {verifyResult.message && <div>{verifyResult.message}</div>}
          </div>

          <table style={{ width: '100%', background: 'var(--surface)', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)', fontWeight: 600, width: 200 }}>
                  Signature
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
                  <span
                    style={{
                      color: verifyResult.signatureValid ? 'var(--success)' : 'var(--error)',
                      fontWeight: 600,
                    }}
                  >
                    {verifyResult.signatureValid ? '✓ Valid' : '✗ Invalid'}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)', fontWeight: 600 }}>
                  Hash Chain
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
                  <span
                    style={{
                      color: verifyResult.chainValid ? 'var(--success)' : 'var(--error)',
                      fontWeight: 600,
                    }}
                  >
                    {verifyResult.chainValid ? '✓ Valid' : '✗ Broken'}
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: 12, fontWeight: 600 }}>
                  Current Ledger Head
                </td>
                <td style={{ padding: 12 }}>
                  <code className="mono" style={{ fontSize: 13, wordBreak: 'break-all' }}>
                    {verifyResult.ledgerHead}
                  </code>
                  {verifyResult.ledgerHead === checkpoint?.head && (
                    <span className="muted" style={{ marginLeft: 8 }}>
                      (matches checkpoint)
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="banner" style={{ background: 'var(--surface)', padding: 16, borderRadius: 6 }}>
        <h3 style={{ marginTop: 0 }}>How It Works</h3>
        <ul style={{ marginBottom: 0 }}>
          <li>
            <strong>Ed25519 Signature:</strong> Each checkpoint is cryptographically signed with a private key.
            The signature proves the checkpoint came from Rein and hasn't been altered.
          </li>
          <li>
            <strong>Hash Chain:</strong> Every ledger entry contains the hash of the previous entry.
            Changing any past entry breaks the chain all the way to the checkpoint.
          </li>
          <li>
            <strong>Offline Verification:</strong> Export the checkpoint JSON and verify it offline
            using any Ed25519 library. The signature + hash chain proves the ledger state.
          </li>
          <li>
            <strong>Tamper Detection:</strong> If anyone modifies the database, the current ledger head
            won't match the signed checkpoint, and verification will fail.
          </li>
        </ul>
      </div>
    </div>
  );
}
