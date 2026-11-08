import { useEffect, useState } from 'react';
import { api } from './ui';

export function Proof() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/v1/proof')
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="error-state">
        <p>Could not load the proof: {err}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', marginBottom: 'var(--space-sm)', color: 'var(--text)' }}>
        Live sandbox proof
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-lg)' }}>
        The demo page is simulated. These are real PayPal sandbox refunds made through the same gate.{' '}
        {data?.mode === 'LIVE-FIRE'
          ? 'This server has sandbox credentials, so each refund below was just re-read from PayPal.'
          : 'This server has no sandbox credentials, so the status shown is the recorded one.'}
      </p>

      {data && data.refunds && data.refunds.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="card" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: '600', fontSize: 'var(--font-size-sm)' }}>
                  Refund ID
                </th>
                <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: '600', fontSize: 'var(--font-size-sm)' }}>
                  Amount
                </th>
                <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: '600', fontSize: 'var(--font-size-sm)' }}>
                  How
                </th>
                <th style={{ textAlign: 'left', padding: 'var(--space-md)', fontWeight: '600', fontSize: 'var(--font-size-sm)' }}>
                  {data.mode === 'LIVE-FIRE' ? 'PayPal now' : 'Recorded'}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.refunds.map((r: any) => (
                <tr key={r.refund_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td
                    style={{
                      padding: 'var(--space-md)',
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    {r.refund_id}
                  </td>
                  <td className="numeric" style={{ padding: 'var(--space-md)' }}>
                    {r.amount} {r.currency}
                  </td>
                  <td style={{ padding: 'var(--space-md)' }}>{r.via}</td>
                  <td
                    style={{
                      padding: 'var(--space-md)',
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    {r.live ? `${r.live.status}${r.live.amount ? ` ${r.live.amount}` : ''}` : 'COMPLETED'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>No refunds found</p>
        </div>
      )}

      {data?.note && (
        <p style={{ color: 'var(--muted)', marginTop: 'var(--space-lg)', fontSize: 'var(--font-size-sm)' }}>
          {data.note}
        </p>
      )}
    </div>
  );
}
