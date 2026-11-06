// Ops Dashboard: real-time gate metrics and health
import { useEffect, useState } from 'react';

interface Metrics {
  ledger: { total: number; chain: { ok: boolean; rows: number; head: string } };
  exposure: { spentCents: number; hardDailyCapCents: number; blockedCents: number; escalatedCents: number };
  mode: string;
}

export function Ops() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ledger, exposure] = await Promise.all([
        fetch('/v1/ledger?limit=1').then((r) => r.json()),
        fetch('/v1/exposure?sessionId=ops').then((r) => r.json()),
      ]);
      setMetrics({ ledger, exposure, mode: ledger.mode });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000); // refresh every 5s
    return () => clearInterval(iv);
  }, []);

  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : '0.0');

  if (loading && !metrics) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#c00' }}>Error: {error}</div>;
  if (!metrics) return null;

  const { ledger, exposure, mode } = metrics;
  const capUsed = exposure.spentCents;
  const capTotal = exposure.hardDailyCapCents;
  const capRemaining = capTotal - capUsed;

  return (
    <div className="container" style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1rem' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>📊 Ops Dashboard</h1>
          <p style={{ color: '#666', marginTop: '0.5rem' }}>Real-time gate health and exposure metrics</p>
        </div>
        <div
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            background: mode === 'LIVE-FIRE' ? '#fee' : '#e7f3ff',
            color: mode === 'LIVE-FIRE' ? '#c00' : '#004085',
            fontWeight: 'bold',
          }}
        >
          {mode}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {/* Daily Cap */}
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', background: 'white' }}>
          <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Daily Cap Usage</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {pct(capUsed, capTotal)}%
          </div>
          <div style={{ fontSize: '0.875rem', color: '#666' }}>
            {usd(capUsed)} / {usd(capTotal)}
          </div>
          <div
            style={{
              marginTop: '1rem',
              height: '8px',
              background: '#f0f0f0',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min((capUsed / capTotal) * 100, 100)}%`,
                background: capUsed > capTotal * 0.9 ? '#c00' : capUsed > capTotal * 0.7 ? '#f90' : '#0a0',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>

        {/* Ledger Chain */}
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', background: 'white' }}>
          <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Ledger Chain</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {ledger.chain.ok ? '✓' : '✗'}
          </div>
          <div style={{ fontSize: '0.875rem', color: ledger.chain.ok ? '#0a0' : '#c00' }}>
            {ledger.chain.ok ? 'Valid' : 'TAMPER DETECTED'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
            {ledger.chain.rows} rows verified
          </div>
        </div>

        {/* Loss Prevention */}
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', background: 'white' }}>
          <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Prevented Loss</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {usd(exposure.blockedCents)}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#666' }}>Blocked by policy</div>
          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
            {usd(exposure.escalatedCents)} escalated to human
          </div>
        </div>

        {/* Total Events */}
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', background: 'white' }}>
          <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>Total Events</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{ledger.total}</div>
          <div style={{ fontSize: '0.875rem', color: '#666' }}>Ledger entries</div>
          <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
            Last: {ledger.chain.head.slice(0, 12)}...
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', background: 'white' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>System Health</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Ledger integrity</span>
            <span
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '4px',
                background: ledger.chain.ok ? '#d4edda' : '#f8d7da',
                color: ledger.chain.ok ? '#155724' : '#721c24',
                fontSize: '0.875rem',
              }}
            >
              {ledger.chain.ok ? 'OK' : 'FAIL'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Daily cap remaining</span>
            <span
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '4px',
                background: capRemaining > capTotal * 0.5 ? '#d4edda' : capRemaining > 0 ? '#fff3cd' : '#f8d7da',
                color: capRemaining > capTotal * 0.5 ? '#155724' : capRemaining > 0 ? '#856404' : '#721c24',
                fontSize: '0.875rem',
              }}
            >
              {usd(capRemaining)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Mode</span>
            <span
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '4px',
                background: mode === 'LIVE-FIRE' ? '#fff3cd' : '#d4edda',
                color: mode === 'LIVE-FIRE' ? '#856404' : '#155724',
                fontSize: '0.875rem',
              }}
            >
              {mode}
            </span>
          </div>
        </div>
      </div>

      <footer style={{ marginTop: '2rem', fontSize: '0.875rem', color: '#666', textAlign: 'center' }}>
        Auto-refreshes every 5 seconds
      </footer>
    </div>
  );
}
