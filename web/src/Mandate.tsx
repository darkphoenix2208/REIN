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
  backgroundColor: '#2C2E2F',
  foregroundColor: '#E8EAED',
  borderColor: '#3C4043',
  headerBackgroundColor: '#1A1D1E',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 13,
  borderRadius: 6,
  wrapperBorderRadius: 6,
  accentColor: '#0070BA',
});

interface MandateCaps {
  perActionCapCents: number;
  hardMaxCents: number;
  dailyCapCents: number;
  hardDailyCapCents: number;
  dupWindowMs?: number;
  returnWindowDays?: number;
  requireItemLevel?: boolean;
  itemAllEscalates?: boolean;
  escalateDisputed?: boolean;
}

interface ReplayActionDetail {
  actionId: string;
  sessionId: string;
  tool: string;
  captureId: string | null;
  amountCents: number;
  originalDecision: string;
  originalRule: string;
  candidateDecision: string;
  candidateRule: string;
  changed: boolean;
  impact: 'stricter' | 'looser' | 'same';
  dollarEffect: number;
  createdAt: number;
}

interface BacktestSummary {
  totalActions: number;
  changedDecisions: number;
  stricterCount: number;
  looserCount: number;
  dollarsBlockedDifferently: number;
  dollarsEscalatedDifferently: number;
  dollarsAllowedDifferently: number;
  topChangedRules: Array<{ ruleId: string; count: number; description: string }>;
  results: ReplayActionDetail[];
}

export function Mandate() {
  const { theme: currentTheme } = useTheme();
  const gridTheme = currentTheme === 'dark' ? darkTheme : lightTheme;
  const [activeMandate, setActiveMandate] = useState<MandateCaps | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<MandateCaps>({
    perActionCapCents: 5000,
    hardMaxCents: 12000,
    dailyCapCents: 20000,
    hardDailyCapCents: 30000,
    dupWindowMs: 86400000,
    returnWindowDays: 30,
    requireItemLevel: true,
    itemAllEscalates: true,
    escalateDisputed: true,
  });

  const [copilotGoal, setCopilotGoal] = useState('');
  const [copilotSuggestion, setCopilotSuggestion] = useState<any>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const [backtestResult, setBacktestResult] = useState<BacktestSummary | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);

  const [approver, setApprover] = useState('');
  const [notes, setNotes] = useState('');
  const [saveSuccess, setSaveSuccess] = useState<any>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadActiveMandate();
  }, []);

  async function loadActiveMandate() {
    try {
      const res = await api('/v1/mandate');
      setLines(res.lines || []);
      if (res.mandate) {
        setActiveMandate(res.mandate);
        setCandidate({
          perActionCapCents: res.mandate.perActionCapCents ?? 5000,
          hardMaxCents: res.mandate.hardMaxCents ?? 12000,
          dailyCapCents: res.mandate.dailyCapCents ?? 20000,
          hardDailyCapCents: res.mandate.hardDailyCapCents ?? 30000,
          dupWindowMs: res.mandate.dupWindowMs ?? 86400000,
          returnWindowDays: res.mandate.returnWindowDays ?? 30,
          requireItemLevel: res.mandate.requireItemLevel ?? true,
          itemAllEscalates: res.mandate.itemAllEscalates ?? true,
          escalateDisputed: res.mandate.escalateDisputed ?? true,
        });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load mandate');
    }
  }

  async function runBacktest() {
    setBacktestLoading(true);
    setError('');
    setSaveSuccess(null);
    try {
      const result: BacktestSummary = await api('/v1/mandate/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate, limit: 300 }),
      });
      setBacktestResult(result);
    } catch (e: any) {
      setError(e.message || 'Backtest failed');
    } finally {
      setBacktestLoading(false);
    }
  }

  async function askCopilot() {
    if (!copilotGoal.trim()) return;
    setCopilotLoading(true);
    setError('');
    try {
      const res = await api('/v1/mandate/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: copilotGoal }),
      });
      setCopilotSuggestion(res);
    } catch (e: any) {
      setError(e.message || 'Mandate Copilot request failed');
    } finally {
      setCopilotLoading(false);
    }
  }

  function applyCopilotCandidate() {
    if (!copilotSuggestion?.candidate) return;
    setCandidate((prev) => ({
      ...prev,
      ...copilotSuggestion.candidate,
    }));
  }

  async function saveAsNewVersion() {
    if (!approver.trim()) {
      setError('Approver name is required to activate a mandate version');
      return;
    }
    setSaveLoading(true);
    setError('');
    try {
      const res = await api('/v1/mandate/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mandate: candidate,
          approver: approver.trim(),
          notes: notes.trim() || undefined,
          effectiveFrom: Date.now(),
        }),
      });
      setSaveSuccess(res);
      await loadActiveMandate();
    } catch (e: any) {
      setError(e.message || 'Failed to save mandate version');
    } finally {
      setSaveLoading(false);
    }
  }

  // AG Grid columns for backtest replay diff
  const cols = useMemo<ColDef[]>(
    () => [
      {
        field: 'actionId',
        headerName: 'Action ID',
        width: 140,
        valueFormatter: (p) => String(p.value || '').slice(0, 12),
        filter: 'agTextColumnFilter',
        sortable: true,
      },
      {
        field: 'createdAt',
        headerName: 'Recorded Time',
        width: 180,
        valueFormatter: (p) => (p.value ? new Date(p.value).toISOString().replace('T', ' ').slice(0, 19) : ''),
        filter: 'agDateColumnFilter',
        sortable: true,
      },
      {
        field: 'amountCents',
        headerName: 'Amount',
        width: 110,
        valueFormatter: (p) => (p.value != null ? `$${(p.value / 100).toFixed(2)}` : '—'),
        filter: 'agNumberColumnFilter',
        sortable: true,
      },
      {
        field: 'originalDecision',
        headerName: 'Original',
        width: 130,
        cellRenderer: (p: any) => (
          <span className={`chip ${p.value === 'allowed' ? 'allow' : p.value === 'blocked' ? 'block' : 'escalate'}`}>
            {p.value}
          </span>
        ),
        filter: 'agTextColumnFilter',
        sortable: true,
      },
      { field: 'originalRule', headerName: 'Orig Rule', width: 140, filter: 'agTextColumnFilter', sortable: true },
      {
        field: 'candidateDecision',
        headerName: 'Candidate',
        width: 140,
        cellRenderer: (p: any) => (
          <span className={`chip ${p.value === 'allowed' ? 'allow' : p.value === 'blocked' ? 'block' : 'escalate'}`}>
            {p.value}
          </span>
        ),
        filter: 'agTextColumnFilter',
        sortable: true,
      },
      { field: 'candidateRule', headerName: 'Cand Rule', width: 140, filter: 'agTextColumnFilter', sortable: true },
      {
        field: 'impact',
        headerName: 'Diff Impact',
        width: 130,
        cellRenderer: (p: any) => {
          const color = p.value === 'stricter' ? '#C5221F' : p.value === 'looser' ? '#137333' : 'var(--muted)';
          return (
            <span style={{ fontWeight: 600, color, textTransform: 'uppercase', fontSize: 11 }}>
              {p.value}
            </span>
          );
        },
        filter: 'agTextColumnFilter',
        sortable: true,
      },
      {
        field: 'dollarEffect',
        headerName: 'Dollar Effect',
        width: 130,
        valueFormatter: (p) => (p.value ? `$${(p.value / 100).toFixed(2)}` : '—'),
        filter: 'agNumberColumnFilter',
        sortable: true,
      },
    ],
    []
  );

  const pinnedBottomRowData = useMemo(() => {
    if (!backtestResult?.results) return [];
    return [
      {
        actionId: 'TOTALS',
        createdAt: 0,
        amountCents: backtestResult.results.reduce((s, r) => s + r.amountCents, 0),
        originalDecision: `${backtestResult.totalActions} total`,
        candidateDecision: `${backtestResult.changedDecisions} changed`,
        impact: `${backtestResult.stricterCount} stricter`,
        dollarEffect:
          backtestResult.dollarsBlockedDifferently +
          backtestResult.dollarsEscalatedDifferently +
          backtestResult.dollarsAllowedDifferently,
      },
    ];
  }, [backtestResult]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: '4rem' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 112, 186, 0.1)', color: 'var(--blue)', padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, marginBottom: '16px', border: '1px solid rgba(0, 112, 186, 0.2)' }}>
        <span>📜 GOVERNANCE POLICY</span>
        <span>•</span>
        <span>Zero-Write Pure Function Replay Engine</span>
      </div>

      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', margin: '0 0 var(--space-xs) 0', color: 'var(--text)', letterSpacing: '-0.02em' }}>
        Mandate Configuration & Backtest
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: 'var(--space-lg)', fontSize: '15px' }}>
        Author candidate policies, re-evaluate past transactions deterministically with pure zero-write backtesting,
        and cryptographically commit approved mandate versions to the ledger.
      </p>

      {error && (
        <div className="banner error" role="alert" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {saveSuccess && (
        <div
          className="banner"
          style={{
            background: 'var(--allow-bg, rgba(16, 185, 129, 0.1))',
            border: '1px solid var(--allow, #137333)',
            color: 'var(--allow, #137333)',
            padding: 16,
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <strong>Mandate Version #{saveSuccess.versionId} Activated!</strong>
          <div style={{ fontSize: 12, marginTop: 4 }} className="mono">
            Hash: {saveSuccess.hash} | Approver: {saveSuccess.activatedBy}
          </div>
        </div>
      )}

      {/* Grid: Current Mandate vs Candidate Editor */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        {/* Left: Active Mandate */}
        <div style={{ border: '1px solid var(--line)', padding: 20, borderRadius: 8, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Active Mandate (Live)</h2>
            <span className="chip allow" style={{ marginLeft: 'auto' }}>
              ACTIVE
            </span>
          </div>
          {activeMandate ? (
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div><strong>Per-Action Soft Cap:</strong> ${(activeMandate.perActionCapCents / 100).toFixed(2)}</div>
              <div><strong>Per-Action Hard Max:</strong> ${(activeMandate.hardMaxCents / 100).toFixed(2)}</div>
              <div><strong>Daily Soft Spend:</strong> ${(activeMandate.dailyCapCents / 100).toFixed(2)}</div>
              <div><strong>Daily Hard Max:</strong> ${(activeMandate.hardDailyCapCents / 100).toFixed(2)}</div>
              <div><strong>Duplicate Window:</strong> {Math.round((activeMandate.dupWindowMs ?? 86400000) / 3600000)}h</div>
              <div><strong>Return Window:</strong> {activeMandate.returnWindowDays ?? 30} days</div>
            </div>
          ) : (
            <p className="muted">Loading active mandate...</p>
          )}

          {lines.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Rulebook Summary
              </div>
              <ul style={{ paddingLeft: 18, margin: '6px 0 0 0', fontSize: 12 }} className="muted">
                {lines.slice(0, 5).map((l, idx) => (
                  <li key={idx}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: Candidate Mandate Editor */}
        <div style={{ border: '1px solid var(--line)', padding: 20, borderRadius: 8, background: 'var(--background)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Candidate Policy Editor</h2>
            <span className="chip" style={{ marginLeft: 'auto' }}>
              DRAFT
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <label>
              Per-Action Cap ($):
              <input
                type="number"
                step="1"
                min="0"
                value={candidate.perActionCapCents / 100}
                onChange={(e) =>
                  setCandidate({ ...candidate, perActionCapCents: Math.round(Number(e.target.value) * 100) })
                }
                style={{ width: '100%', marginTop: 4, padding: '4px 8px' }}
              />
            </label>

            <label>
              Hard Max Cap ($):
              <input
                type="number"
                step="1"
                min="0"
                value={candidate.hardMaxCents / 100}
                onChange={(e) =>
                  setCandidate({ ...candidate, hardMaxCents: Math.round(Number(e.target.value) * 100) })
                }
                style={{ width: '100%', marginTop: 4, padding: '4px 8px' }}
              />
            </label>

            <label>
              Daily Soft Cap ($):
              <input
                type="number"
                step="1"
                min="0"
                value={candidate.dailyCapCents / 100}
                onChange={(e) =>
                  setCandidate({ ...candidate, dailyCapCents: Math.round(Number(e.target.value) * 100) })
                }
                style={{ width: '100%', marginTop: 4, padding: '4px 8px' }}
              />
            </label>

            <label>
              Daily Hard Cap ($):
              <input
                type="number"
                step="1"
                min="0"
                value={candidate.hardDailyCapCents / 100}
                onChange={(e) =>
                  setCandidate({ ...candidate, hardDailyCapCents: Math.round(Number(e.target.value) * 100) })
                }
                style={{ width: '100%', marginTop: 4, padding: '4px 8px' }}
              />
            </label>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn" onClick={runBacktest} disabled={backtestLoading}>
              {backtestLoading ? 'Running Backtest...' : '▶ Replay & Backtest History'}
            </button>
          </div>
        </div>
      </div>

      {/* Mandate Copilot (Advisory) */}
      <div
        style={{
          border: '1px solid var(--border)',
          padding: 20,
          borderRadius: 8,
          background: 'var(--surface)',
          marginBottom: 32,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Mandate Copilot (Advisory)</h3>
          <span className="chip" style={{ marginLeft: 12, fontSize: 11 }}>
            ASSISTANT
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px 0' }}>
          Describe a business goal in plain English. The copilot provides advisory parameter recommendations.
          Every metric is computed strictly by the deterministic backtest engine.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            placeholder="e.g. Tighten refund limit to $20 and reduce daily spend during high fraud spike"
            value={copilotGoal}
            onChange={(e) => setCopilotGoal(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text)' }}
            onKeyDown={(e) => e.key === 'Enter' && askCopilot()}
          />
          <button className="btn btn-secondary" onClick={askCopilot} disabled={copilotLoading || !copilotGoal.trim()}>
            {copilotLoading ? 'Thinking...' : 'Ask Copilot'}
          </button>
        </div>

        {copilotSuggestion && (
          <div
            style={{
              marginTop: 16,
              background: 'var(--background)',
              padding: 16,
              borderRadius: 6,
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className={`chip ${copilotSuggestion.mode === 'LIVE' ? 'allow' : ''}`}>
                {copilotSuggestion.mode === 'LIVE' ? 'CLAUDE ADVISORY' : 'RECORDED SUGGESTION'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{copilotSuggestion.reasoning}</span>
            </div>

            <pre className="mono" style={{ fontSize: 12, margin: '8px 0', overflow: 'auto' }}>
              {JSON.stringify(copilotSuggestion.candidate, null, 2)}
            </pre>

            <button className="btn" onClick={applyCopilotCandidate} style={{ marginTop: 8 }}>
              Apply Suggested Parameters to Candidate
            </button>
          </div>
        )}
      </div>

      {/* Backtest Results Section */}
      {backtestResult && (
        <div style={{ marginBottom: 36 }}>
          <h2>Deterministic Replay Results</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Evaluated {backtestResult.totalActions} historical actions through the candidate policy without database writes.
          </p>

          {/* Metrics summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div style={{ border: '1px solid var(--line)', padding: 16, borderRadius: 6, background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Changed Decisions</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#003087', marginTop: 4 }}>
                {backtestResult.changedDecisions}
              </div>
              <div style={{ fontSize: 12 }} className="muted">
                of {backtestResult.totalActions} total actions
              </div>
            </div>

            <div style={{ border: '1px solid var(--line)', padding: 16, borderRadius: 6, background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Stricter Decisions</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#C5221F', marginTop: 4 }}>
                {backtestResult.stricterCount}
              </div>
              <div style={{ fontSize: 12 }} className="muted">
                Newly blocked or escalated
              </div>
            </div>

            <div style={{ border: '1px solid var(--line)', padding: 16, borderRadius: 6, background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Looser Decisions</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#137333', marginTop: 4 }}>
                {backtestResult.looserCount}
              </div>
              <div style={{ fontSize: 12 }} className="muted">
                Newly allowed actions
              </div>
            </div>

            <div style={{ border: '1px solid var(--line)', padding: 16, borderRadius: 6, background: 'var(--surface)' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Dollars Newly Blocked</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#C5221F', marginTop: 4 }}>
                ${(backtestResult.dollarsBlockedDifferently / 100).toFixed(2)}
              </div>
              <div style={{ fontSize: 12 }} className="muted">
                Total exposure prevented
              </div>
            </div>
          </div>

          {/* Top Changed Rules */}
          {backtestResult.topChangedRules.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Top Shifted Rules
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {backtestResult.topChangedRules.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      padding: '8px 12px',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {r.ruleId}
                    </span>
                    <span style={{ marginLeft: 8, color: 'var(--muted)' }}>
                      ({r.count}x) — {r.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AG Grid Table */}
          <div className="scroll-x" style={{ height: 420 }}>
            <AgGridReact
              theme={gridTheme}
              rowData={backtestResult.results}
              columnDefs={cols}
              pinnedBottomRowData={pinnedBottomRowData}
              defaultColDef={{
                filter: true,
                sortable: true,
                resizable: true,
              }}
              enableCellTextSelection={true}
              ensureDomOrder={true}
            />
          </div>

          {/* Save as New Version Section */}
          <div
            style={{
              marginTop: 32,
              border: '1px solid var(--border)',
              padding: 24,
              borderRadius: 8,
              background: 'var(--background)',
            }}
          >
            <h3 style={{ marginTop: 0, fontSize: 17 }}>Activate as New Mandate Version</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Deploy this candidate configuration as the active mandate. Every subsequent action and ledger row will
              commit to this version's cryptographic hash.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
              <label style={{ fontSize: 13 }}>
                Approver Name (Required):
                <input
                  type="text"
                  placeholder="e.g. security-officer-alice"
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                  style={{ width: '100%', marginTop: 4, padding: '6px 10px' }}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                Change Notes:
                <input
                  type="text"
                  placeholder="e.g. Tightened per-action soft cap following Q4 risk review"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', marginTop: 4, padding: '6px 10px' }}
                />
              </label>
            </div>

            <button
              className="btn"
              onClick={saveAsNewVersion}
              disabled={saveLoading || !approver.trim()}
              style={{ padding: '8px 20px' }}
            >
              {saveLoading ? 'Activating...' : '✓ Authorize & Activate New Mandate Version'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
