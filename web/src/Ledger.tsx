import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import { api } from './ui';

ModuleRegistry.registerModules([AllCommunityModule]);
const theme = themeQuartz.withParams({ backgroundColor: '#FFFFFF', foregroundColor: '#0C1424', borderColor: '#D3D9E3', headerBackgroundColor: '#F3F5F8', fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, borderRadius: 0, wrapperBorderRadius: 0, accentColor: '#0C1424' });

export function Ledger() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [groupBy, setGroupBy] = useState<'none' | 'event' | 'rule'>('none');

  const load = () => api('/v1/ledger?limit=500').then((j) => { setData(j); setErr(''); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const exportCSV = () => {
    if (!data?.rows) return;
    const headers = ['seq', 'created_at', 'event', 'rule_id', 'amount_cents', 'action_id', 'hash', 'prev_hash'];
    const csv = [
      headers.join(','),
      ...data.rows.map((r: any) =>
        headers.map((h) => {
          const v = h === 'created_at' ? new Date(r[h]).toISOString() : r[h] ?? '';
          return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
        }).join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rein-ledger-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    window.open('/v1/ledger/evidence-pack?format=pdf', '_blank');
  };

  const exportJsonPack = () => {
    window.open('/v1/ledger/evidence-pack?format=json', '_blank');
  };

  const mode = data?.mode ?? '';
  const grouped = useMemo(() => {
    if (!data?.rows || groupBy === 'none') return data?.rows ?? [];
    const groups = new Map<string, any[]>();
    for (const row of data.rows) {
      const key = groupBy === 'event' ? row.event : row.rule_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries()).map(([key, rows]) => ({
      group: true,
      key,
      count: rows.length,
      total: rows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0),
      children: rows,
    }));
  }, [data, groupBy]);

  const cols = useMemo<ColDef[]>(() => [
    { field: 'seq', headerName: '#', width: 80 },
    { field: 'created_at', headerName: 'Time', width: 210, valueFormatter: (p) => new Date(p.value).toISOString().replace('T', ' ').slice(0, 19) },
    { field: 'event', width: 170 },
    { field: 'rule_id', headerName: 'Rule', width: 160 },
    { field: 'amount_cents', headerName: 'Amount', width: 110, valueFormatter: (p) => (p.value == null ? '' : `$${(p.value / 100).toFixed(2)}`) },
    { headerName: 'Mode', width: 130, valueGetter: () => mode },
    { field: 'hash', headerName: 'Hash', flex: 1, minWidth: 160, valueFormatter: (p) => String(p.value ?? '').slice(0, 16) },
  ], [mode]);
  return (
    <>
      <h1>Ledger</h1>
      {err && <div className="banner error" role="alert">Could not load the ledger: {err} <button className="btn secondary" onClick={load}>Retry</button></div>}
      {!data && !err && <div className="banner">Loading ledger...</div>}
      {data && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <p className="row" style={{ margin: 0 }}>
            <span className={`chip ${data.chain.ok ? 'allow' : 'block'}`}>
              <span aria-hidden="true">{data.chain.ok ? '✓' : '✕'}</span>
              {data.chain.ok ? 'Chain verified' : 'Chain BROKEN'}
            </span>
            <span className="num">{data.total} entries</span>
            <span className="muted">Hash-chained; tamper-evident against partial edits.</span>
          </p>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.875rem' }}>
              Group by:
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as any)}
                style={{ marginLeft: '0.5rem', padding: '0.25rem 0.5rem' }}
              >
                <option value="none">None</option>
                <option value="event">Event</option>
                <option value="rule">Rule</option>
              </select>
            </label>
            <button className="btn secondary" onClick={exportCSV} disabled={!data?.rows?.length}>
              Export CSV
            </button>
            <button className="btn secondary" onClick={exportPdf} disabled={!data?.rows?.length} title="Download printable PDF evidence pack with signed checkpoint and chain status">
              Auditor Pack (PDF)
            </button>
            <button className="btn secondary" onClick={exportJsonPack} disabled={!data?.rows?.length} title="Download complete JSON evidence pack">
              Auditor Pack (JSON)
            </button>
          </div>
        </div>
      )}
      {data?.chain.ok && <p className="mono" aria-label="Head hash">Head after {data.chain.rows} rows: {data.chain.head}</p>}
      {data && data.total === 0 && <div className="banner">No decisions yet. Run a ticket on the Demo page.</div>}
      {data && groupBy === 'none' && (
        <div className="scroll-x" style={{ height: 480 }}>
          <AgGridReact
            theme={theme}
            rowData={data.rows}
            columnDefs={cols}
            onRowClicked={(e) => setSelected(e.data)}
          />
        </div>
      )}
      {data && groupBy !== 'none' && (
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
          {grouped.map((g: any) => (
            <details key={g.key} style={{ borderBottom: '1px solid #ddd' }}>
              <summary
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  background: '#f3f5f8',
                  fontWeight: 500,
                }}
              >
                {g.key || '(none)'} — {g.count} entries, {g.total > 0 ? `$${(g.total / 100).toFixed(2)}` : 'no amounts'}
              </summary>
              <div style={{ padding: '1rem' }}>
                <div className="scroll-x" style={{ height: 300 }}>
                  <AgGridReact theme={theme} rowData={g.children} columnDefs={cols} onRowClicked={(e) => setSelected(e.data)} />
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
      {selected && (
        <div style={{ marginTop: '1rem', border: '1px solid #ddd', borderRadius: '4px', padding: '1rem', background: '#f9f9f9' }}>
          <h3 style={{ marginTop: 0 }}>Row #{selected.seq} Details</h3>
          <pre style={{ fontSize: '0.875rem', overflow: 'auto' }}>{JSON.stringify(selected, null, 2)}</pre>
          <button className="btn secondary" onClick={() => setSelected(null)} style={{ marginTop: '0.5rem' }}>
            Close
          </button>
        </div>
      )}
      {!data && !err && <p className="muted">Loading ledger...</p>}
    </>
  );
}
