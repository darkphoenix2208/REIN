// Mandate backtest: pure replay of historical actions against a candidate mandate
import { z } from 'zod';
import type { Db } from './db.ts';
import { decide } from './policy.ts';
import type { Mandate, PayRow } from './types.ts';

export const CandidateMandateSchema = z.object({
  perActionCapCents: z.number().int().min(0),
  hardMaxCents: z.number().int().min(0),
  dailyCapCents: z.number().int().min(0),
  hardDailyCapCents: z.number().int().min(0),
  dupWindowMs: z.number().int().min(0).optional(),
  returnWindowDays: z.number().int().min(0).optional(),
  escalateDisputed: z.boolean().optional(),
  disputeEvidenceOnly: z.boolean().optional(),
  maxSubscriptionCancelValueCents: z.number().int().min(0).optional(),
  requireItemLevel: z.boolean().optional(),
  itemAllEscalates: z.boolean().optional(),
  allowedCurrencies: z.array(z.string()).optional(),
  rules: z.array(z.any()).optional(),
});

export const BacktestRequestSchema = z.object({
  candidate: CandidateMandateSchema,
  startDate: z.number().int().optional(),
  endDate: z.number().int().optional(),
  limit: z.number().int().positive().max(1000).optional(),
});

export const SaveMandateVersionSchema = z.object({
  mandate: CandidateMandateSchema,
  approver: z.string().min(1, 'Approver name is required'),
  notes: z.string().optional(),
  effectiveFrom: z.number().int().optional(),
  effectiveTo: z.number().int().optional(),
});

export interface RecordedAction {
  id: string;
  sessionId: string;
  tool: string;
  captureId: string | null;
  amountCents: number;
  decision: string;
  ruleId: string;
  reason?: string;
  createdAt: number;
}

export interface ReplayActionDetail {
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

export interface ReplayResult {
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

const RULE_DESCRIPTIONS: Record<string, string> = {
  'R-ACTION-CAP': 'Per-action soft cap exceeded (escalate)',
  'R-HARD-MAX': 'Per-action hard max exceeded (block)',
  'R-DAILY-CAP': 'Daily soft spend cap exceeded (escalate)',
  'R-HARD-DAILY': 'Daily hard spend cap exceeded (block)',
  'R-DUP': 'Duplicate request in window (escalate/block)',
  'R-WINDOW': 'Return window expired (block)',
  'R-OVER-CAPTURE': 'Requested amount exceeds capture remaining (block)',
  'R-ITEMS-ALL': 'Full-order refund escalation (escalate)',
  'R-STATE-UNAVAILABLE': 'Capture or dispute lookup unavailable (escalate)',
  'R-CURRENCY': 'Currency mismatch against capture (block)',
  'R-ALLOW': 'Permitted within mandate policy',
};

/**
 * Pure, deterministic replay of actions against a candidate mandate.
 * ZERO database writes. Re-evaluates each action through the pure policy function.
 */
export function replayMandate(
  actions: RecordedAction[],
  candidateMandate: Mandate,
  ordersSnapshot: Record<string, PayRow>
): ReplayResult {
  // Sort actions chronologically to simulate accurate timeline
  const sorted = actions.slice().sort((a, b) => a.createdAt - b.createdAt);

  const results: ReplayActionDetail[] = [];
  let changedCount = 0;
  let stricterCount = 0;
  let looserCount = 0;
  let dollarsBlockedDifferently = 0;
  let dollarsEscalatedDifferently = 0;
  let dollarsAllowedDifferently = 0;

  const ruleChangesMap = new Map<string, number>();

  // In-memory simulation of approved/allowed actions for rolling windows
  const candidateAllowedRolling: Array<{ sessionId: string; captureId?: string; amountCents: number; ts: number }> = [];

  for (const act of sorted) {
    if (!act.captureId) continue;

    const pay = ordersSnapshot[act.captureId];
    if (!pay) {
      // Capture not found in snapshot
      results.push({
        actionId: act.id,
        sessionId: act.sessionId,
        tool: act.tool,
        captureId: act.captureId,
        amountCents: act.amountCents,
        originalDecision: act.decision,
        originalRule: act.ruleId,
        candidateDecision: 'pending_approval',
        candidateRule: 'R-STATE-UNAVAILABLE',
        changed: act.decision !== 'pending_approval' || act.ruleId !== 'R-STATE-UNAVAILABLE',
        impact: act.decision === 'allowed' ? 'stricter' : 'same',
        dollarEffect: act.decision === 'allowed' ? act.amountCents : 0,
        createdAt: act.createdAt,
      });
      continue;
    }

    // 1. Calculate in-memory windowSum within 24h before act.createdAt
    const dayStart = act.createdAt - 86_400_000;
    const windowSum = candidateAllowedRolling
      .filter((r) => r.sessionId === act.sessionId && r.ts >= dayStart && r.ts < act.createdAt)
      .reduce((sum, r) => sum + r.amountCents, 0);

    // 2. Duplicate check within candidate's dupWindowMs
    const dupWindowMs = candidateMandate.dupWindowMs ?? 86_400_000;
    const dup =
      dupWindowMs > 0 &&
      candidateAllowedRolling.some(
        (r) =>
          r.sessionId === act.sessionId &&
          r.captureId === act.captureId &&
          r.amountCents === act.amountCents &&
          r.ts >= act.createdAt - dupWindowMs &&
          r.ts < act.createdAt
      );

    // 3. Evaluate pure decide
    const candDecision = decide(
      { amountCents: act.amountCents, currency: pay.cur },
      candidateMandate,
      {
        pay,
        windowSum,
        dup,
        now: act.createdAt,
        approved: false,
        ext: { disputeOpen: false, capturedAtMs: pay.capturedAt ?? act.createdAt },
      }
    );

    const changed = candDecision.status !== act.decision || candDecision.ruleId !== act.ruleId;
    let impact: 'stricter' | 'looser' | 'same' = 'same';
    let dollarEffect = 0;

    if (changed) {
      changedCount++;
      const key = `${act.ruleId || 'R-ALLOW'} -> ${candDecision.ruleId || 'R-ALLOW'}`;
      ruleChangesMap.set(key, (ruleChangesMap.get(key) || 0) + 1);

      if (act.decision === 'allowed' && candDecision.status === 'blocked') {
        impact = 'stricter';
        stricterCount++;
        dollarsBlockedDifferently += act.amountCents;
        dollarEffect = act.amountCents;
      } else if (act.decision === 'allowed' && candDecision.status === 'pending_approval') {
        impact = 'stricter';
        stricterCount++;
        dollarsEscalatedDifferently += act.amountCents;
        dollarEffect = act.amountCents;
      } else if ((act.decision === 'blocked' || act.decision === 'pending_approval') && candDecision.status === 'allowed') {
        impact = 'looser';
        looserCount++;
        dollarsAllowedDifferently += act.amountCents;
        dollarEffect = act.amountCents;
      }
    }

    if (candDecision.status === 'allowed') {
      candidateAllowedRolling.push({
        sessionId: act.sessionId,
        captureId: act.captureId,
        amountCents: act.amountCents,
        ts: act.createdAt,
      });
    }

    results.push({
      actionId: act.id,
      sessionId: act.sessionId,
      tool: act.tool,
      captureId: act.captureId,
      amountCents: act.amountCents,
      originalDecision: act.decision,
      originalRule: act.ruleId,
      candidateDecision: candDecision.status,
      candidateRule: candDecision.ruleId,
      changed,
      impact,
      dollarEffect,
      createdAt: act.createdAt,
    });
  }

  // Calculate top changed rules
  const topChangedRules = Array.from(ruleChangesMap.entries())
    .map(([rulePair, count]) => {
      const targetRule = rulePair.split(' -> ')[1] || '';
      return {
        ruleId: rulePair,
        count,
        description: RULE_DESCRIPTIONS[targetRule] || 'Policy rule fired differently',
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalActions: sorted.length,
    changedDecisions: changedCount,
    stricterCount,
    looserCount,
    dollarsBlockedDifferently,
    dollarsEscalatedDifferently,
    dollarsAllowedDifferently,
    topChangedRules,
    results,
  };
}

/**
 * DB wrapper: extracts recorded actions and payments snapshot, then delegates to pure replayMandate.
 */
export function backtestMandate(
  db: Db,
  candidateMandate: Mandate,
  options: { startDate?: number; endDate?: number; limit?: number } = {}
): ReplayResult {
  const { startDate, endDate, limit = 200 } = options;

  let query = `
    SELECT id, session_id, tool, capture_id, amount_cents, decision, rule_id, reason, created_at
    FROM actions
    WHERE tool IN ('refund_items', 'refund', 'price_match_refund', 'purchase')
  `;
  const params: any[] = [];

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY created_at ASC LIMIT ?';
  params.push(limit);

  const rawActions = db.all<any>(query, ...params);
  const actions: RecordedAction[] = rawActions.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    tool: r.tool,
    captureId: r.capture_id,
    amountCents: r.amount_cents,
    decision: r.decision,
    ruleId: r.rule_id,
    reason: r.reason,
    createdAt: r.created_at,
  }));

  // Build ordersSnapshot
  const captureIds = Array.from(new Set(actions.map((a) => a.captureId).filter(Boolean)));
  const ordersSnapshot: Record<string, PayRow> = {};

  if (captureIds.length > 0) {
    const placeholders = captureIds.map(() => '?').join(',');
    const payRows = db.all<any>(
      `SELECT txn_id, captured_cents, refunded_cents, reserved_cents, currency, captured_at FROM payments WHERE txn_id IN (${placeholders})`,
      ...captureIds
    );
    for (const p of payRows) {
      ordersSnapshot[p.txn_id] = {
        c: p.captured_cents,
        f: p.refunded_cents,
        r: p.reserved_cents,
        cur: p.currency,
        capturedAt: p.captured_at,
      };
    }
  }

  return replayMandate(actions, candidateMandate, ordersSnapshot);
}
