import { useEffect, useState } from 'react';
import { api, dollars } from './ui';

export function Approve({ actionId }: { actionId: string }) {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [now, setNow] = useState(Date.now());
  const token = new URLSearchParams(window.location.hash.slice(1)).get('t') ?? '';

  const load = () => api(`/v1/approval/${encodeURIComponent(actionId)}`).then(setInfo).catch((e) => setErr(e.status === 404 ? 'This demo was reset after a server restart (or the link is wrong). Nothing was refunded. Run the ticket again.' : e.message));
  useEffect(() => { load(); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [actionId]);

  const decide = async (decision: 'approve' | 'deny') => {
    const r = await api('/v1/approve', { actionId, token, decision }).catch((e) => ({ ok: false, why: e.message }));
    setDone(r.ok ? (decision === 'approve' ? 'Approved. Nothing has been refunded yet: the agent must retry the same request, and this grant works once.' : 'Denied. Nothing was refunded.') : `Not applied: ${r.why}`);
    load();
  };

  if (err) return <div className="banner error" role="alert"><h1>Approval unavailable</h1><p>{err}</p></div>;
  if (!info) return <p className="muted">Loading approval...</p>;
  const left = Math.max(0, Math.floor((info.expiresAt - now) / 1000));
  const open = info.status === 'pending' && left > 0 && !!token;
  return (
    <>
      <h1>Approve a refund</h1>
      <div className="card">
        <div className="outcome-word num">{dollars(info.amountCents)}</div>
        <p className="mono">{info.ruleId}</p>
        <ul className="plain">{info.items.map((i: any, k: number) => <li key={k}>{i.qty} x {i.name} ({dollars(i.unit_cents)})</li>)}</ul>
        <p>{info.reason}</p>
        <p className="muted"><strong>AI summary, advisory only.</strong> {info.summary}</p>
        {info.exchangeSuggestions && info.exchangeSuggestions.length > 0 && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Exchange Instead of Refund? (Channel3 Suggestions)</h4>
            <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 0.5rem 0' }}>Consider offering an exchange for a similar item before approving a money-losing refund:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
              {info.exchangeSuggestions.map((item: any) => (
                <div key={item.id} style={{ border: '1px solid #cbd5e1', padding: '0.5rem', borderRadius: '4px', background: '#fff', fontSize: '0.82rem' }}>
                  <strong>{item.name}</strong>
                  <div style={{ color: '#003087', fontWeight: 600 }}>{dollars(item.priceCents)}</div>
                  <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{item.description}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="num">{info.status === 'pending' ? (left > 0 ? `Expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Expired') : `Status: ${info.status}`}</p>
        {!token && info.status === 'pending' && <div className="banner error">This link is missing its approval token (the part after #). Use the full link.</div>}
      </div>
      {done && <div className="banner" role="status">{done}</div>}
      <div className="sticky">
        <button className="btn" disabled={!open} onClick={() => decide('approve')}>Approve</button>
        <button className="btn destructive" disabled={!open} onClick={() => decide('deny')}>Deny</button>
      </div>
    </>
  );
}
