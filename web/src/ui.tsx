import { useEffect, useState } from 'react';

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !('ok' in j) && !('status' in j)) throw Object.assign(new Error(j.fix ?? j.why ?? j.error ?? `HTTP ${r.status}`), { status: r.status, body: j });
  return j;
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const KIND = { allow: ['✓', 'ALLOWED'], block: ['✕', 'BLOCKED'], escalate: ['!', 'ESCALATED'] } as const;
const KIND_CLASS = { allow: 'chip-allowed', block: 'chip-blocked', escalate: 'chip-pending' } as const;
export function Chip({ kind }: { kind: keyof typeof KIND }) {
  return <span className={`chip ${KIND_CLASS[kind]}`}><span aria-hidden="true">{KIND[kind][0]}</span> {KIND[kind][1]}</span>;
}
export const kindOf = (status: string): keyof typeof KIND | null =>
  status === 'executed' || status === 'allowed' ? 'allow' : status === 'blocked' ? 'block' : status === 'pending_approval' ? 'escalate' : null;

export function ModeChip() {
  const [mode, setMode] = useState<string>('');
  const [isLive, setIsLive] = useState<boolean>(false);
  useEffect(() => {
    fetch('/health').then((r) => r.json()).then((j) => {
      const live = j.mode === 'live';
      setIsLive(live);
      setMode(live ? 'LIVE' : 'SIMULATED');
    }).catch(() => setMode('OFFLINE'));
  }, []);
  return (
    <span
      className={`chip mode ${isLive ? 'mode-live' : 'mode-sim'}`}
      title={isLive ? 'Live mode: calls PayPal sandbox API' : 'Simulated mode: stubs final PayPal call'}
    >
      {mode || '...'}
    </span>
  );
}
