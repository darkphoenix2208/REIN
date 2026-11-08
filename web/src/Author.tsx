import { useEffect, useState } from 'react';
import { api } from './ui';

interface Draft {
  source: string;
  runs: number;
  disagreements: string[];
  playback: string[];
  unsupported: string[];
  questions: string[];
  activatable: boolean;
}

export function Author() {
  const [samples, setSamples] = useState<{ id: string; policy: string }[]>([]);
  const [live, setLive] = useState(false);
  const [text, setText] = useState('');
  const [sample, setSample] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/v1/author/samples')
      .then((j) => {
        setSamples(j.samples);
        setLive(j.live);
        setLoading(false);
      })
      .catch((e) => {
        setErr(e.message);
        setLoading(false);
      });
  }, []);

  const compile = async () => {
    setBusy(true);
    setErr('');
    setDraft(null);
    try {
      setDraft(await api('/v1/author/compile', { policy: text, sample }));
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '600', marginBottom: 'var(--space-sm)', color: 'var(--text)' }}>
        Author a mandate
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-lg)' }}>
        Paste your refund policy in plain English. A model reads it three times; anything the runs disagree on, or the policy does not say, stays empty. Nothing here is activated: this is a draft you read back and sign off.
      </p>

      {samples.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-lg)' }} role="group" aria-label="Sample policies">
          {samples.map((s) => (
            <button
              key={s.id}
              className={`btn ${sample === s.id ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={sample === s.id}
              onClick={() => {
                setSample(s.id);
                setText(s.policy);
                setDraft(null);
              }}
            >
              {s.id}
            </button>
          ))}
        </div>
      )}

      <label htmlFor="policy" style={{ display: 'block', marginBottom: 'var(--space-sm)', fontWeight: '500', color: 'var(--text)' }}>
        Policy text
      </label>
      <textarea
        id="policy"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSample('');
        }}
        rows={8}
        style={{
          width: '100%',
          fontFamily: 'var(--font-family)',
          fontSize: 'var(--font-size-base)',
          padding: 'var(--space-md)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-md)',
        }}
      />

      <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <button className="btn btn-primary" onClick={compile} disabled={busy || (!text.trim() && !sample)}>
          {busy ? 'Compiling...' : 'Compile draft'}
        </button>
        <span style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)' }}>
          {live ? 'Live model.' : 'No model key on this server: the samples show recorded compile.'}
        </span>
      </div>

      {err && (
        <div className="error-state" style={{ marginBottom: 'var(--space-lg)' }} role="alert">
          <p>{err}</p>
        </div>
      )}

      {draft && (
        <div className="card">
          <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-lg)' }}>
            {draft.source === 'recorded' ? 'Recorded compile' : `Compiled ${draft.runs} times`}
            {draft.disagreements.length
              ? `. The runs disagreed on: ${draft.disagreements.join(', ')} (left empty).`
              : '. The runs agreed on every field they filled.'}
          </p>

          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', marginBottom: 'var(--space-md)', color: 'var(--text)' }}>
            What Rein would enforce
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 'var(--space-lg)' }}>
            {draft.playback.map((l, i) => (
              <li
                key={i}
                style={{
                  padding: 'var(--space-sm) 0',
                  color: l.startsWith('NOT SET') ? 'var(--muted)' : 'var(--text)',
                  fontWeight: l.startsWith('NOT SET') ? '600' : '400',
                }}
              >
                {l}
              </li>
            ))}
          </ul>

          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', marginBottom: 'var(--space-md)', color: 'var(--text)' }}>
            NOT enforced (the schema cannot express these)
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 'var(--space-lg)' }}>
            {draft.unsupported.length ? (
              draft.unsupported.slice(0, 8).map((u, i) => (
                <li key={i} style={{ padding: 'var(--space-sm) 0', color: 'var(--muted)' }}>
                  {u}
                </li>
              ))
            ) : (
              <li style={{ color: 'var(--muted)' }}>None reported.</li>
            )}
          </ul>

          <div
            className={draft.activatable ? 'card' : 'error-state'}
            style={{ background: draft.activatable ? '#E6F4EC' : undefined }}
          >
            <p style={{ margin: 0, color: draft.activatable ? 'var(--success)' : undefined }}>
              {draft.activatable
                ? 'All four spending limits are set. Activation is a deliberate step: npm run compile-policy -- --activate.'
                : 'Cannot be activated: at least one spending limit is empty. Rein does not guess limits. Answer the NOT SET lines first.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
