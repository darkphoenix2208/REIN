// Ops Dashboard: real-time gate metrics and health
import { useEffect, useState } from 'react';

interface Metrics {
  ledger: { total: number; chain: { ok: boolean; rows: number; head: string } };
  exposure: { spentCents: number; hardDailyCapCents: number; blockedCents: number; escalatedCents: number; wouldBlockCents?: number; wouldEscalateCents?: number };
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
        fetch('/v1/exposure').then((r) => r.json()),
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

  if (loading && !metrics) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>Error loading metrics: {error}</p>
        <button className="btn btn-primary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  const { ledger, exposure, mode } = metrics;
  const capUsed = exposure.spentCents;
  const capTotal = exposure.hardDailyCapCents;
  const capRemaining = capTotal - capUsed;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: 'var(--space-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', margin: '0 0 var(--space-xs) 0', color: 'var(--text)' }}>
            📊 Ops Dashboard
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>Real-time gate health and exposure metrics</p>
        </div>
        <span className={`chip ${mode === 'LIVE-FIRE' ? 'chip-live' : 'chip-simulated'}`}>
          {mode}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
        {/* Daily Cap */}
        <div className="card">
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-sm)' }}>
            Daily Cap Usage
          </div>
          <div className="numeric" style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', marginBottom: 'var(--space-sm)', color: 'var(--text)' }}>
            {pct(capUsed, capTotal)}%
          </div>
          <div className="numeric" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
            {usd(capUsed)} / {usd(capTotal)}
          </div>
          <div
            style={{
              marginTop: 'var(--space-md)',
              height: '8px',
              background: 'var(--background)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min((capUsed / capTotal) * 100, 100)}%`,
                background: capUsed > capTotal * 0.9 ? 'var(--danger)' : capUsed > capTotal * 0.7 ? 'var(--warning)' : 'var(--success)',
                transition: 'width var(--transition-normal)',
              }}
            />
          </div>
        </div>

        {/* Ledger Chain */}
        <div className="card">
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-sm)' }}>
            Ledger Chain
          </div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', marginBottom: 'var(--space-sm)' }}>
            {ledger.chain.ok ? '✓' : '✗'}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: ledger.chain.ok ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
            {ledger.chain.ok ? 'Valid' : 'TAMPER DETECTED'}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 'var(--space-sm)' }}>
            {ledger.chain.rows} rows verified
          </div>
        </div>

        {/* Loss Prevention */}
        <div className="card">
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-sm)' }}>
            Prevented Loss
          </div>
          <div className="numeric" style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', marginBottom: 'var(--space-sm)', color: 'var(--success)' }}>
            {usd(exposure.blockedCents + (exposure.wouldBlockCents ?? 0))}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>Blocked by policy</div>
          <div className="numeric" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 'var(--space-sm)' }}>
            {usd(exposure.escalatedCents + (exposure.wouldEscalateCents ?? 0))} sent to a human
          </div>
        </div>

        {/* Total Events */}
        <div className="card">
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-sm)' }}>
            Total Events
          </div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', marginBottom: 'var(--space-sm)', color: 'var(--text)' }}>
            {ledger.total}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>Ledger entries</div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 'var(--space-sm)' }}>
            Last: {ledger.chain.head.slice(0, 12)}...
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 'var(--font-size-lg)', fontWeight: '600', marginBottom: 'var(--space-md)', color: 'var(--text)' }}>
          System Health
        </h2>
        <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text)' }}>Ledger integrity</span>
            <span className={`chip ${ledger.chain.ok ? 'chip-allowed' : 'chip-blocked'}`}>
              {ledger.chain.ok ? 'OK' : 'FAIL'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text)' }}>Daily cap remaining</span>
            <span className={`chip ${capRemaining > capTotal * 0.5 ? 'chip-allowed' : capRemaining > 0 ? 'chip-pending' : 'chip-blocked'}`}>
              {usd(capRemaining)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text)' }}>Mode</span>
            <span className={`chip ${mode === 'LIVE-FIRE' ? 'chip-live' : 'chip-simulated'}`}>
              {mode}
            </span>
          </div>
        </div>
      </div>

      <footer style={{ marginTop: 'var(--space-xl)', fontSize: 'var(--font-size-sm)', color: 'var(--muted)', textAlign: 'center' }}>
        Auto-refreshes every 5 seconds
      </footer>
    </div>
  );
}
