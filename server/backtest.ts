// Mandate backtest: replay historical actions against a new mandate to see what would change
import type { Db } from './db.ts';
import { decide, resolveItems, type ItemRow } from './policy.ts';
import type { Mandate, PayRow } from './types.ts';

export interface BacktestResult {
  actionId: string;
  tool: string;
  captureId: string | null;
  amountCents: number;
  originalDecision: string;
  originalRule: string;
  newDecision: string;
  newRule: string;
  changed: boolean;
  impact: 'stricter' | 'looser' | 'same';
  createdAt: number;
}

export interface BacktestSummary {
  totalActions: number;
  changedDecisions: number;
  stricterCount: number;
  looserCount: number;
  results: BacktestResult[];
}

const payOf = (db: Db, cap: string): PayRow | undefined =>
  db.one<{ c: number; f: number; r: number; cur: string; capturedAt: number | null }>(
    'SELECT captured_cents c, refunded_cents f, reserved_cents r, currency cur, captured_at capturedAt FROM payments WHERE txn_id=?',
    cap,
  );

/**
 * Replay historical actions against a new mandate to see what decisions would change.
 * Only refund actions are backtested (not payouts/subscriptions/disputes).
 */
export function backtestMandate(
  db: Db,
  newMandate: Mandate,
  options: { startDate?: number; endDate?: number; limit?: number } = {}
): BacktestSummary {
  const { startDate, endDate, limit = 100 } = options;

  let query = `
    SELECT id, session_id, tool, capture_id, amount_cents, decision, rule_id, reason, status, created_at
    FROM actions
    WHERE tool IN ('refund_items', 'refund')
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

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const actions = db.all<any>(query, ...params);

  const results: BacktestResult[] = [];
  let changedCount = 0;
  let stricterCount = 0;
  let looserCount = 0;

  for (const action of actions) {
    if (!action.capture_id) continue; // Skip non-refund actions

    const pay = payOf(db, action.capture_id);
    if (!pay) continue;

    // Reconstruct the policy state at the time of the action
    const windowSum = db.val<number>(
      `SELECT COALESCE(SUM(amount_cents),0) FROM actions
       WHERE session_id=? AND created_at>=? AND created_at<? AND id<>? AND status IN ('reserved','executed','approved_executed','unknown_outcome')`,
      action.session_id,
      action.created_at - 86_400_000, // 24h window
      action.created_at,
      action.id
    ) ?? 0;

    // Check for duplicate
    const dupWindowMs = newMandate.dupWindowMs ?? 86_400_000;
    const dup =
      dupWindowMs > 0 &&
      !!db.one(
        `SELECT 1 FROM actions WHERE session_id=? AND capture_id=? AND amount_cents=? AND created_at>=? AND created_at<? AND id<>? AND status IN ('reserved','executed','approved_executed','unknown_outcome')`,
        action.session_id,
        action.capture_id,
        action.amount_cents,
        action.created_at - dupWindowMs,
        action.created_at,
        action.id
      );

    // Run new policy decision
    const newDecision = decide(
      { amountCents: action.amount_cents, currency: pay.cur },
      newMandate,
      {
        pay,
        windowSum,
        dup,
        now: action.created_at,
        approved: false, // Re-evaluate without approval
      }
    );

    const changed = newDecision.status !== action.decision || newDecision.ruleId !== action.rule_id;

    let impact: 'stricter' | 'looser' | 'same' = 'same';
    if (changed) {
      changedCount++;
      // Stricter: was allowed, now blocked/escalated
      if (action.decision === 'allowed' && (newDecision.status === 'blocked' || newDecision.status === 'pending_approval')) {
        impact = 'stricter';
        stricterCount++;
      }
      // Looser: was blocked/escalated, now allowed
      else if ((action.decision === 'blocked' || action.decision === 'pending_approval') && newDecision.status === 'allowed') {
        impact = 'looser';
        looserCount++;
      }
    }

    results.push({
      actionId: action.id,
      tool: action.tool,
      captureId: action.capture_id,
      amountCents: action.amount_cents,
      originalDecision: action.decision,
      originalRule: action.rule_id,
      newDecision: newDecision.status,
      newRule: newDecision.ruleId,
      changed,
      impact,
      createdAt: action.created_at,
    });
  }

  return {
    totalActions: actions.length,
    changedDecisions: changedCount,
    stricterCount,
    looserCount,
    results,
  };
}
