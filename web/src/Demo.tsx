import { useEffect, useRef, useState } from 'react';
import { api, Chip, dollars, kindOf } from './ui';

interface Ticket { id: number; title: string; body: string; expected: string }
interface RunResult { requested: { item: string; amount: string }[]; unguarded: { amount: string; refundId: string }; guarded: any; exposure: { spentCents: number; hardDailyCapCents: number } }

function describe(g: any): string {
  if (g.status === 'executed') return `refunded ${dollars(g.amountCents)}.`;
  if (g.status === 'blocked') return `blocked by ${g.ruleId}.`;
  if (g.status === 'pending_approval') return 'waiting for a human to approve.';
  return g.status;
}

export function Demo() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sel, setSel] = useState(2);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'unguarded' | 'done' | 'error'>('idle');
  const [res, setRes] = useState<RunResult | null>(null);
  const [err, setErr] = useState('');
  const [live, setLive] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    api('/v1/demo/tickets')
      .then((j) => setTickets(j.tickets))
      .catch((e) => { setErr(e.message); setPhase('error'); });
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async () => {
    clearTimeout(timer.current);
    setRes(null); setErr(''); setLive(''); setPhase('loading');
    try {
      const j: RunResult = await api('/v1/demo/run', { ticketId: sel });
      setRes(j);
      setPhase('unguarded');
      setLive(`Without Rein: refunded $${j.unguarded.amount}.`);
      timer.current = window.setTimeout(() => {
        setPhase('done');
        setLive((l) => `${l} With Rein: ${describe(j.guarded)}`);
      }, 600);
    } catch (e: any) {
      setErr(e.message);
      setPhase('error');
    }
  };

  const retry = async () => {
    try {
      const j = await api('/v1/demo/retry', { actionId: res!.guarded.actionId });
      setRes({ ...res!, guarded: j.guarded, exposure: j.exposure });
      setLive(`Agent retried after approval: ${describe(j.guarded)}`);
    } catch (e: any) {
      setErr(e.message);
      setPhase('error');
    }
  };

  const ticket = tickets.find((t) => t.id === sel);

  if (phase === 'error' && !tickets.length) {
    return (
      <div className="error-state">
        <p>Failed to load tickets: {err}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload Page
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Hero Badge & Title */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: 'var(--radius-pill)', background: 'rgba(0, 112, 186, 0.08)', border: '1px solid rgba(0, 112, 186, 0.2)', marginBottom: 'var(--space-md)' }}>
        <span style={{ fontSize: '14px' }}>🛡️</span>
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--blue)', letterSpacing: '0.02em' }}>
          PAYPAL AGENTIC MANDATE GATE
        </span>
        <span style={{ color: 'var(--border)' }}>•</span>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>Zero-Trust Refund Protection</span>
      </div>

      <h1 style={{ fontSize: '30px', fontWeight: '700', marginBottom: 'var(--space-sm)', color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
        Same Agent, Same Ticket. One Lane Has Rein.
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: 'var(--font-size-base)', maxWidth: '780px', marginBottom: 'var(--space-xl)', lineHeight: 1.6 }}>
        Observe how an unconstrained AI support agent refunds entire orders when tricked by customer social engineering, while Rein intercepts the tool call, resolves catalog items, and bounds financial loss.
      </p>

      {tickets.length === 0 && phase !== 'error' ? (
        <div className="loading">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          {/* Ticket Selection Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }} role="group" aria-label="Ticket selection">
            {tickets.map((t) => {
              const isSel = sel === t.id;
              const badge = t.id === 1 ? { emoji: '☕', tag: 'Legit $18', color: 'var(--success)' } : t.id === 2 ? { emoji: '🚨', tag: 'Attack $200', color: 'var(--danger)' } : { emoji: '⚠️', tag: 'Escalation $75', color: 'var(--warning)' };
              return (
                <button
                  key={t.id}
                  type="button"
                  className="card"
                  onClick={() => { setSel(t.id); setPhase('idle'); setRes(null); }}
                  aria-pressed={isSel}
                  style={{
                    textAlign: 'left',
                    padding: '16px 20px',
                    borderRadius: 'var(--radius-lg)',
                    background: isSel ? 'var(--card-bg)' : 'transparent',
                    border: isSel ? '2px solid var(--blue)' : '1px solid var(--border)',
                    boxShadow: isSel ? 'var(--shadow-md)' : 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '20px' }}>{badge.emoji}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: `${badge.color}15`, color: badge.color, textTransform: 'uppercase' }}>
                      {badge.tag}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--text)' }}>
                    {t.id}. {t.title}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Customer Ticket Transcript Box */}
          {ticket && (
            <div className="card" style={{ marginBottom: 'var(--space-xl)', padding: '20px 24px', borderLeft: '4px solid var(--blue)', background: 'var(--background)' }} aria-label="Customer ticket">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span>💬 Inbound Support Message</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {ticket.body}
              </div>
            </div>
          )}

          {/* Action Trigger */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={run}
              disabled={phase === 'loading' || !ticket}
              style={{ fontSize: '15px', padding: '12px 30px' }}
            >
              {phase === 'loading' ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', display: 'inline-block', marginRight: '8px' }} />
                  <span>Simulating Agent Execution...</span>
                </>
              ) : (
                <span>⚡ Run Both Lanes in Parallel</span>
              )}
            </button>
            {ticket && (
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>
                Target outcome: <strong style={{ color: 'var(--text)' }}>{ticket.expected}</strong>
              </span>
            )}
          </div>

          <div className="sr" role="status" aria-live="polite">{live}</div>

          {phase === 'error' && err && (
            <div className="error-state" style={{ marginBottom: 'var(--space-lg)' }} role="alert">
              <p>Something went wrong: {err}</p>
              <button className="btn btn-secondary" onClick={run}>Try again</button>
            </div>
          )}

          {/* Dual Comparison Lanes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-lg)', alignItems: 'start' }}>
            {/* Left Lane: UNGUARDED */}
            <section className="card card-vulnerable" aria-label="Without Rein" style={{ minHeight: '320px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Without Rein
                </h2>
                <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)', fontSize: '12px', fontWeight: 700, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  ⚠️ UNGUARDED
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--space-lg)' }}>
                Agent holds raw PayPal token and specifies refund amount directly.
              </p>

              {!res && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-md)' }}>
                  {phase === 'loading' ? 'Running untrusted agent...' : 'Click "Run Both Lanes" to test prompt injection.'}
                </div>
              )}

              {res && (
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--space-xs)' }}>
                    Agent Requested:
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 'var(--space-md)' }}>
                    {res.requested.map((r) => `${r.item} ($${r.amount})`).join(', ')}
                  </div>

                  <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: 'var(--space-md)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                      Financial Outcome
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--danger)', letterSpacing: '-0.02em' }}>
                      REFUNDED ${res.unguarded.amount}
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--muted)', marginBottom: 'var(--space-sm)' }}>
                    Capture Reference: {res.unguarded.refundId}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>
                    <span>⚠️ Danger:</span>
                    <span>Exposure is UNLIMITED (Agent chose amount)</span>
                  </div>
                </div>
              )}
            </section>

            {/* Right Lane: PROTECTED */}
            <section className="card card-protected" aria-label="With Rein" style={{ minHeight: '320px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  With Rein
                </h2>
                <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-pill)', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)', fontSize: '12px', fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  🛡️ PROTECTED
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--space-lg)' }}>
                Item-scoped proxy calculates authoritative amounts from trusted order records.
              </p>

              {phase !== 'done' && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-md)' }}>
                  {res ? 'Evaluating policy rules...' : phase === 'loading' ? 'Checking mandate limits...' : 'Click "Run Both Lanes" to evaluate mandate.'}
                </div>
              )}

              {res && phase === 'done' && <Guarded r={res} onRetry={retry} />}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Guarded({ r, onRetry }: { r: RunResult; onRetry: () => void }) {
  const g = r.guarded;
  const kind = kindOf(g.status);
  const statusColor = g.status === 'executed' ? 'var(--success)' : g.status === 'blocked' ? 'var(--danger)' : 'var(--warning)';
  const pct = Math.min(100, Math.round((r.exposure.spentCents / r.exposure.hardDailyCapCents) * 100));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' }}>
        {kind && <Chip kind={kind} />}
        {g.ruleId && (
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(0,0,0,0.06)', color: 'var(--text)', fontWeight: 600 }}>
            {g.ruleId}
          </span>
        )}
      </div>

      <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: `${statusColor}10`, border: `1px solid ${statusColor}30`, marginBottom: 'var(--space-md)' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
          Gate Decision
        </div>
        <div style={{ fontSize: '26px', fontWeight: 800, color: statusColor, letterSpacing: '-0.02em' }}>
          {g.status === 'executed' ? `REFUNDED ${dollars(g.amountCents)}` : g.status === 'blocked' ? 'NOT REFUNDED ($0.00)' : g.status === 'pending_approval' ? 'WAITING FOR APPROVAL' : g.status}
        </div>
      </div>

      {g.reason && (
        <div style={{ fontSize: '13px', color: 'var(--text)', background: 'var(--background)', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)', lineHeight: 1.5 }}>
          {g.reason}
        </div>
      )}

      {g.status === 'pending_approval' && (
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <a className="btn btn-primary" href={g.approvalUrl.replace(/^https?:\/\/[^/]+/, '')} target="_blank" rel="noreferrer" style={{ fontSize: '13px' }}>
            Open approval page ↗
          </a>
          <button className="btn btn-secondary" onClick={onRetry} style={{ fontSize: '13px' }}>
            Agent retries after approval
          </button>
        </div>
      )}

      {/* Exposure Progress Indicator */}
      <div style={{ marginTop: 'var(--space-md)', padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--background)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
          <span style={{ color: 'var(--muted)' }}>Organization Spend Exposure:</span>
          <span style={{ color: 'var(--text)' }} className="numeric">{dollars(r.exposure.spentCents)} / {dollars(r.exposure.hardDailyCapCents)}</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--danger)' : 'var(--success)', transition: 'width 0.4s ease' }} />
        </div>
      </div>
    </div>
  );
}
