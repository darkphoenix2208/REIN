import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from 'ag-grid-community';
import { api } from './ui';
import { useTheme } from './ThemeToggle';

ModuleRegistry.registerModules([AllCommunityModule]);

const lightTheme = themeQuartz.withParams({
  backgroundColor: '#FFFFFF',
  foregroundColor: '#0C1424',
  borderColor: '#D9DEE7',
  headerBackgroundColor: '#F8FAFC',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 13,
  borderRadius: 6,
  wrapperBorderRadius: 6,
  accentColor: '#0070BA',
});

const darkTheme = themeQuartz.withParams({
  backgroundColor: '#141A28',
  foregroundColor: '#F1F5F9',
  borderColor: '#232D42',
  headerBackgroundColor: '#0B0E17',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 13,
  borderRadius: 6,
  wrapperBorderRadius: 6,
  accentColor: '#38BDF8',
});

export function Ledger() {
  const { theme: currentTheme } = useTheme();
  const gridTheme = currentTheme === 'dark' ? darkTheme : lightTheme;
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
    { field: 'seq', headerName: '#', width: 80, filter: 'agNumberColumnFilter', sortable: true },
    { field: 'created_at', headerName: 'Time', width: 210, valueFormatter: (p) => (p.value == null ? '' : new Date(p.value).toISOString().replace('T', ' ').slice(0, 19)), filter: 'agDateColumnFilter', sortable: true },
    { field: 'event', width: 170, filter: 'agTextColumnFilter', sortable: true },
    { field: 'rule_id', headerName: 'Rule', width: 160, filter: 'agTextColumnFilter', sortable: true },
    { field: 'amount_cents', headerName: 'Amount', width: 110, valueFormatter: (p) => (p.value == null ? '' : `$${(p.value / 100).toFixed(2)}`), filter: 'agNumberColumnFilter', sortable: true },
    { headerName: 'Mode', width: 130, valueGetter: () => mode, filter: 'agTextColumnFilter', sortable: true },
    { field: 'hash', headerName: 'Hash', flex: 1, minWidth: 160, valueFormatter: (p) => String(p.value ?? '').slice(0, 16), filter: 'agTextColumnFilter', sortable: true },
  ], [mode]);
  
  // totals row: entries and the sum of money that actually LEFT (executed events only; summing every event row would double count reserve + execute)
  const pinnedBottomRowData = useMemo(() => {
    if (!data?.rows?.length) return [];
    const executed = data.rows.filter((r: any) => r.event === 'executed' || r.event === 'approved_executed');
    return [{
      seq: null,
      created_at: null,
      event: 'Executed total',
      rule_id: `${data.rows.length} entries`,
      amount_cents: executed.reduce((sum: number, r: any) => sum + (r.amount_cents ?? 0), 0),
      hash: ''
    }];
  }, [data]);
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 112, 186, 0.1)', color: 'var(--blue)', padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', border: '1px solid rgba(0, 112, 186, 0.2)' }}>
        <span>📊 AUDIT TRAIL</span>
        <span>•</span>
        <span>Tamper-Evident SHA-256 Ledger</span>
      </div>

      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', marginBottom: 'var(--space-xs)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
        Cryptographic Ledger
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-lg)', fontSize: '15px' }}>
        Every evaluation, reservation, and execution is hashed into an append-only chain. Replays and integrity checks guarantee zero undetected mutations.
      </p>

      {err && <div className="banner error" role="alert">Could not load the ledger: {err} <button className="btn btn-secondary" onClick={load}>Retry</button></div>}
      {!data && !err && <div className="banner">Loading ledger...</div>}
      {data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', background: 'var(--card-bg, #ffffff)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <p className="row" style={{ margin: 0 }}>
            <span className={`chip ${data.chain.ok ? 'allow' : 'block'}`}>
              <span aria-hidden="true">{data.chain.ok ? '✓' : '✕'}</span>
              {data.chain.ok ? 'Chain verified' : 'Chain BROKEN'}
            </span>
            <span className="num" style={{ fontWeight: 600 }}>{data.total} entries</span>
            <span className="muted" style={{ fontSize: '13px' }}>Hash-chained; tamper-evident against edits.</span>
          </p>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text)' }}>
              Group:
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as any)}
                style={{ marginLeft: '0.5rem', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text)' }}
              >
                <option value="none">None</option>
                <option value="event">Event</option>
                <option value="rule">Rule</option>
              </select>
            </label>
            <button className="btn btn-secondary" onClick={exportCSV} disabled={!data?.rows?.length}>
              Export CSV
            </button>
            <button className="btn btn-secondary" onClick={exportPdf} disabled={!data?.rows?.length} title="Download printable PDF evidence pack with signed checkpoint and chain status">
              Auditor Pack (PDF)
            </button>
            <button className="btn btn-secondary" onClick={exportJsonPack} disabled={!data?.rows?.length} title="Download complete JSON evidence pack">
              Auditor Pack (JSON)
            </button>
          </div>
        </div>
      )}
      {data?.chain.ok && <p className="mono" aria-label="Head hash" style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>Head after {data.chain.rows} rows: <code>{data.chain.head}</code></p>}
      {data && data.total === 0 && <div className="banner">No decisions yet. Run a ticket on the Demo page.</div>}
      {data && groupBy === 'none' && (
        <div className="scroll-x" style={{ height: 480 }}>
          <AgGridReact
            theme={gridTheme}
            rowData={data.rows}
            columnDefs={cols}
            pinnedBottomRowData={pinnedBottomRowData}
            defaultColDef={{
              filter: true,
              sortable: true,
              resizable: true,
            }}
            onRowClicked={(e) => setSelected(e.data)}
            enableCellTextSelection={true}
            ensureDomOrder={true}
          />
        </div>
      )}
      {data && groupBy !== 'none' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {grouped.map((g: any) => (
            <details key={g.key} style={{ borderBottom: '1px solid var(--border)' }}>
              <summary
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  background: 'var(--background)',
                  color: 'var(--text)',
                  fontWeight: 600,
                }}
              >
                {g.key || '(none)'} — {g.count} entries, {g.total > 0 ? `$${(g.total / 100).toFixed(2)}` : 'no amounts'}
              </summary>
              <div style={{ padding: '1rem', background: 'var(--card-bg, #ffffff)' }}>
                <div className="scroll-x" style={{ height: 300 }}>
                  <AgGridReact theme={gridTheme} rowData={g.children} columnDefs={cols} onRowClicked={(e) => setSelected(e.data)} />
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
      {selected && (
        <div style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', background: 'var(--background)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--text)' }}>Row #{selected.seq} Details</h3>
          <pre style={{ fontSize: '0.875rem', overflow: 'auto', color: 'var(--text)' }}>{JSON.stringify(selected, null, 2)}</pre>
          <button className="btn btn-secondary" onClick={() => setSelected(null)} style={{ marginTop: '0.5rem' }}>
            Close
          </button>
        </div>
      )}
      {!data && !err && <p className="muted">Loading ledger...</p>}
    </div>
  );
}
