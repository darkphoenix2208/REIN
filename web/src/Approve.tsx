import { useEffect, useState } from 'react';
import { api, dollars } from './ui';

export function Approve({ actionId }: { actionId: string }) {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [now, setNow] = useState(Date.now());
  const token = new URLSearchParams(window.location.hash.slice(1)).get('t') ?? '';

  const load = () =>
    api(`/v1/approval/${encodeURIComponent(actionId)}`)
      .then(setInfo)
      .catch((e) =>
        setErr(
          e.status === 404
            ? 'This demo was reset after a server restart (or the link is wrong). Nothing was refunded. Run the ticket again.'
            : e.message
        )
      );

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [actionId]);

  const decide = async (decision: 'approve' | 'deny') => {
    const r = await api('/v1/approve', { actionId, token, decision }).catch((e) => ({ ok: false, why: e.message }));
    setDone(
      r.ok
        ? decision === 'approve'
          ? 'Approved. Nothing has been refunded yet: the agent must retry the same request, and this grant works once.'
          : 'Denied. Nothing was refunded.'
        : `Not applied: ${r.why}`
    );
    load();
  };

  if (err) {
    return (
      <div className="error-state" style={{ maxWidth: '800px', margin: '0 auto' }} role="alert">
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', marginBottom: 'var(--space-sm)' }}>
          Approval unavailable
        </h1>
        <p>{err}</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const left = Math.max(0, Math.floor((info.expiresAt - now) / 1000));
  const open = info.status === 'pending' && left > 0 && !!token;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 112, 186, 0.1)', color: 'var(--blue)', padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', border: '1px solid rgba(0, 112, 186, 0.2)' }}>
        <span>⚖️ HUMAN-IN-THE-LOOP</span>
        <span>•</span>
        <span>Escalation & Policy Waiver Portal</span>
      </div>

      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', marginBottom: 'var(--space-lg)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
        Review Escalated Refund Request
      </h1>

      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="numeric" style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', marginBottom: 'var(--space-md)', color: 'var(--navy)' }}>
          {dollars(info.amountCents)}
        </div>
        <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 'var(--font-size-sm)', color: 'var(--muted)', marginBottom: 'var(--space-md)' }}>
          {info.ruleId}
        </p>

        <ul style={{ listStyle: 'none', padding: 0, marginBottom: 'var(--space-md)' }}>
          {info.items.map((i: any, k: number) => (
            <li key={k} style={{ padding: 'var(--space-xs) 0', color: 'var(--text)' }}>
              {i.qty} x {i.name} ({dollars(i.unit_cents)})
            </li>
          ))}
        </ul>

        <p style={{ marginBottom: 'var(--space-md)', color: 'var(--text)' }}>{info.reason}</p>
        <p style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-md)' }}>
          <strong>AI summary, advisory only.</strong> {info.summary}
        </p>

        {info.exchangeSuggestions && info.exchangeSuggestions.length > 0 && (
          <div className="card" style={{ background: 'var(--background)', marginBottom: 'var(--space-md)' }}>
            <h4 style={{ margin: '0 0 var(--space-sm) 0', fontSize: 'var(--font-size-base)', fontWeight: '600', color: 'var(--text)' }}>
              Exchange Instead of Refund? (Channel3 Suggestions)
            </h4>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)', margin: '0 0 var(--space-md) 0' }}>
              Consider offering an exchange for a similar item before approving a money-losing refund:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-sm)' }}>
              {info.exchangeSuggestions.map((item: any) => (
                <div key={item.id} className="card" style={{ background: 'var(--card-bg, #ffffff)' }}>
                  <strong style={{ display: 'block', marginBottom: 'var(--space-xs)', color: 'var(--text)' }}>{item.name}</strong>
                  <div className="numeric" style={{ color: 'var(--navy)', fontWeight: '600', marginBottom: 'var(--space-xs)' }}>
                    {dollars(item.priceCents)}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--muted)' }}>{item.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="numeric" style={{ fontWeight: '600', marginBottom: 'var(--space-md)', color: 'var(--text)' }}>
          {info.status === 'pending'
            ? left > 0
              ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
              : 'Expired'
            : `Status: ${info.status}`}
        </p>

        {!token && info.status === 'pending' && (
          <div className="error-state">
            <p>This link is missing its approval token (the part after #). Use the full link.</p>
          </div>
        )}
      </div>

      {done && (
        <div className="card" style={{ background: 'var(--allow-bg, rgba(16, 185, 129, 0.1))', border: '1px solid var(--success)', marginBottom: 'var(--space-lg)' }} role="status">
          <p style={{ margin: 0, color: 'var(--success)' }}>{done}</p>
        </div>
      )}

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--card-bg, #ffffff)', padding: 'var(--space-lg)', borderTop: '1px solid var(--border)', display: 'flex', gap: 'var(--space-md)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
        <button className="btn btn-primary" disabled={!open} onClick={() => decide('approve')}>
          Approve
        </button>
        <button className="btn btn-secondary" disabled={!open} onClick={() => decide('deny')}>
          Deny
        </button>
      </div>
    </div>
  );
}
