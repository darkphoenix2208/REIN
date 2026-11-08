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

  useEffect(() => { api('/v1/demo/tickets').then((j) => setTickets(j.tickets)).catch((e) => { setErr(e.message); setPhase('error'); }); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async () => {
    clearTimeout(timer.current);
    setRes(null); setErr(''); setLive(''); setPhase('loading'); // always reset both lanes first
    try {
      const j: RunResult = await api('/v1/demo/run', { ticketId: sel });
      setRes(j); setPhase('unguarded'); setLive(`Without Rein: refunded $${j.unguarded.amount}.`);
      timer.current = window.setTimeout(() => { setPhase('done'); setLive((l) => `${l} With Rein: ${describe(j.guarded)}`); }, 600);
    } catch (e: any) { setErr(e.message); setPhase('error'); }
  };

  const retry = async () => {
    try {
      const j = await api('/v1/demo/retry', { actionId: res!.guarded.actionId });
      setRes({ ...res!, guarded: j.guarded, exposure: j.exposure });
      setLive(`Agent retried after approval: ${describe(j.guarded)}`);
    } catch (e: any) { setErr(e.message); setPhase('error'); }
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
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', marginBottom: 'var(--space-md)', color: 'var(--text)' }}>
        Same agent, same ticket. One lane has Rein.
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-lg)' }}>
        Pick a customer ticket. Both lanes replay the same agent request; the right lane runs it through the real Rein gate (simulated PayPal, fake money).
      </p>

      {tickets.length === 0 && phase !== 'error' ? (
        <div className="loading">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-lg)' }} role="group" aria-label="Ticket">
            {tickets.map((t) => (
              <button
                key={t.id}
                className={`btn ${sel === t.id ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={sel === t.id}
                onClick={() => { setSel(t.id); setPhase('idle'); setRes(null); }}
              >
                {t.id}. {t.title}
              </button>
            ))}
          </div>

          {ticket && (
            <div className="card" style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-lg)', background: 'var(--background)' }} aria-label="Customer ticket">
              {ticket.body}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={run}
            disabled={phase === 'loading' || !ticket}
            style={{ marginBottom: 'var(--space-lg)' }}
          >
            {phase === 'loading' ? 'Running...' : 'Run both lanes'}
          </button>

          <div className="sr" role="status" aria-live="polite">{live}</div>

          {phase === 'error' && err && (
            <div className="error-state" style={{ marginBottom: 'var(--space-lg)' }} role="alert">
              <p>Something went wrong: {err}</p>
              <button className="btn btn-secondary" onClick={run}>Try again</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-lg)' }}>
            <section className="card" aria-label="Without Rein">
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', marginBottom: 'var(--space-md)', color: 'var(--text)' }}>
                Without Rein
              </h2>
              {!res && (
                <p style={{ color: 'var(--muted)' }}>
                  {phase === 'loading' ? 'Running the agent...' : 'Press "Run both lanes" to see what the agent does.'}
                </p>
              )}
              {res && (
                <>
                  <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-md)' }}>
                    Agent asked to refund: {res.requested.map((r) => `${r.item} $${r.amount}`).join(', ')}
                  </p>
                  <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', color: 'var(--danger)', marginBottom: 'var(--space-sm)' }}>
                    REFUNDED ${res.unguarded.amount}
                  </div>
                  <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-sm)' }}>
                    {res.unguarded.refundId}
                  </p>
                  <p style={{ fontWeight: '600' }}>Exposure: unlimited</p>
                </>
              )}
            </section>

            <section className="card" aria-label="With Rein">
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', marginBottom: 'var(--space-md)', color: 'var(--text)' }}>
                With Rein
              </h2>
              {phase !== 'done' && (
                <p style={{ color: 'var(--muted)' }}>
                  {res ? 'Waiting for the gate...' : phase === 'loading' ? 'Checking the mandate...' : 'Press "Run both lanes".'}
                </p>
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
  return (
    <div>
      {kind && (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <Chip kind={kind} />
        </div>
      )}
      <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', marginBottom: 'var(--space-sm)', color: g.status === 'executed' ? 'var(--success)' : g.status === 'blocked' ? 'var(--danger)' : 'var(--warning)' }}>
        {g.status === 'executed' ? `REFUNDED ${dollars(g.amountCents)}` : g.status === 'blocked' ? 'NOT REFUNDED' : g.status === 'pending_approval' ? 'WAITING FOR APPROVAL' : g.status}
      </div>
      {g.ruleId && (
        <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-sm)' }}>
          {g.ruleId}
        </p>
      )}
      {g.reason && <p style={{ marginBottom: 'var(--space-md)' }}>{g.reason}</p>}
      {g.status === 'pending_approval' && (
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <a className="btn btn-primary" href={g.approvalUrl.replace(/^https?:\/\/[^/]+/, '')} target="_blank" rel="noreferrer">
            Open approval page
          </a>
          <button className="btn btn-secondary" onClick={onRetry}>
            Agent retries after approval
          </button>
        </div>
      )}
      <p className="numeric" style={{ fontWeight: '600' }}>
        Exposure today: {dollars(r.exposure.spentCents)} of {dollars(r.exposure.hardDailyCapCents)} hard daily cap
      </p>
    </div>
  );
}
