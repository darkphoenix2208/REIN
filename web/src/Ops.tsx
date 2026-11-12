// Ops Dashboard: real-time gate metrics and health
import { useEffect, useState } from 'react';

interface Metrics {
  ledger: { total: number; chain: { ok: boolean; rows: number; head: string } };
  exposure: {
    spentCents: number;
    hardDailyCapCents: number;
    blockedCents: number;
    escalatedCents: number;
    wouldBlockCents?: number;
    wouldEscalateCents?: number;
    velocity?: {
      rule: { maxActions: number; maxAmountCents: number; windowHours: number };
      topCustomers: Array<{ customerId: string; actions: number; amountCents: number; utilizationPct: number }>;
    };
  };
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
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 112, 186, 0.1)', color: 'var(--blue)', padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', border: '1px solid rgba(0, 112, 186, 0.2)' }}>
        <span>📈 SYSTEM TELEMETRY</span>
        <span>•</span>
        <span>Real-Time Policy & Exposure Metrics</span>
      </div>

      <header style={{ marginBottom: 'var(--space-lg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', margin: '0 0 var(--space-xs) 0', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Ops & Exposure Dashboard
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '15px' }}>Real-time gate health, cumulative loss prevention, and velocity monitoring</p>
        </div>
        <span className={`chip ${mode === 'LIVE-FIRE' ? 'chip-live' : 'chip-simulated'}`}>
          {mode}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
        {/* Daily Cap */}
        <div className="card" style={{ borderTop: '3px solid var(--blue)' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>
            Daily Cap Exposure
          </div>
          <div className="numeric" style={{ fontSize: '28px', fontWeight: '700', marginBottom: 'var(--space-xs)', color: 'var(--text)' }}>
            {pct(capUsed, capTotal)}%
          </div>
          <div className="numeric" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
            {usd(capUsed)} of {usd(capTotal)} limit
          </div>
          <div
            style={{
              marginTop: 'var(--space-md)',
              height: '8px',
              background: 'var(--background)',
              borderRadius: 'var(--radius-pill)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min((capUsed / capTotal) * 100, 100)}%`,
                background: capUsed > capTotal * 0.9 ? 'var(--danger)' : capUsed > capTotal * 0.7 ? 'var(--warning)' : 'var(--blue)',
                borderRadius: 'var(--radius-pill)',
                transition: 'width var(--transition-normal)',
              }}
            />
          </div>
        </div>

        {/* Ledger Chain */}
        <div className="card" style={{ borderTop: '3px solid #10B981' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>
            Ledger Cryptographic Chain
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', marginBottom: 'var(--space-xs)', color: ledger.chain.ok ? 'var(--success)' : 'var(--danger)' }}>
            {ledger.chain.ok ? '✓ HEALTHY' : '✗ BROKEN'}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
            {ledger.chain.rows} consecutive verified rows
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--muted)', marginTop: 'var(--space-md)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Head: {ledger.chain.head.slice(0, 16)}...
          </div>
        </div>

        {/* Loss Prevention */}
        <div className="card" style={{ borderTop: '3px solid #059669' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>
            Total Prevented Loss
          </div>
          <div className="numeric" style={{ fontSize: '28px', fontWeight: '700', marginBottom: 'var(--space-xs)', color: 'var(--success)' }}>
            {usd(exposure.blockedCents + (exposure.wouldBlockCents ?? 0))}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>Blocked deterministically</div>
          <div className="numeric" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginTop: 'var(--space-xs)' }}>
            {usd(exposure.escalatedCents + (exposure.wouldEscalateCents ?? 0))} escalated to human review
          </div>
        </div>

        {/* Total Events */}
        <div className="card" style={{ borderTop: '3px solid #8B5CF6' }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>
            Immutable Journal Entries
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', marginBottom: 'var(--space-xs)', color: 'var(--text)' }}>
            {ledger.total}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>Cumulative ledger rows</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--blue)', marginTop: 'var(--space-xs)', fontWeight: 500 }}>
            <a href="/ledger" style={{ color: 'inherit', textDecoration: 'none' }}>View live ledger →</a>
          </div>
        </div>
      </div>

      {metrics.exposure.velocity && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 'var(--font-size-lg)', fontWeight: '600', marginBottom: 'var(--space-md)', color: 'var(--text)' }}>
            Velocity Tracking
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-xs)' }}>
                Max Actions / {metrics.exposure.velocity.rule.windowHours}h
              </div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text)' }}>
                {metrics.exposure.velocity.rule.maxActions}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-xs)' }}>
                Max Amount / {metrics.exposure.velocity.rule.windowHours}h
              </div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--text)' }}>
                {usd(metrics.exposure.velocity.rule.maxAmountCents)}
              </div>
            </div>
          </div>

          {metrics.exposure.velocity.topCustomers.length > 0 && (
            <>
              <h3 style={{ marginTop: 'var(--space-lg)', marginBottom: 'var(--space-md)', fontSize: 'var(--font-size-md)', fontWeight: '600', color: 'var(--text)' }}>
                Top Customers (Last {metrics.exposure.velocity.rule.windowHours}h)
              </h3>
              <table className="velocity-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Actions</th>
                    <th>Amount</th>
                    <th>Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.exposure.velocity.topCustomers.map((c: any) => (
                    <tr key={c.customerId} className={c.utilizationPct >= 80 ? 'warning' : ''}>
                      <td><code>{c.customerId}</code></td>
                      <td>{c.actions} / {metrics.exposure.velocity!.rule.maxActions}</td>
                      <td>{usd(c.amountCents)} / {usd(metrics.exposure.velocity!.rule.maxAmountCents)}</td>
                      <td>{c.utilizationPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

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
