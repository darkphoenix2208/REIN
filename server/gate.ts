// One place that runs a refund request end to end: read live PayPal state (OUTSIDE the transaction), check+reserve (ONE transaction),
// call PayPal (OUTSIDE the transaction, idempotent), then record the outcome. Used by the MCP proxy and the HTTP API.
import { randomUUID } from 'node:crypto';
import { ReinBusyError, type Db } from './db.ts';
import { check, result, type Outcome } from './dispatch.ts';
import { PayPalError, type PayPalClient } from './paypal.ts';
import type { CheckInput, CheckResult, ExternalState, Mandate } from './types.ts';

export interface GateDeps {
  db: Db;
  mandate: Mandate;
  paypal: PayPalClient | null; // null = SIMULATED (no credentials): the final call is a stub, everything else is the real pipeline
  publicUrl?: string;
  now?: () => number;
}

export type GateOutcome =
  | { status: 'executed'; actionId: string; ruleId: string; refundId: string; amountCents: number; mode: 'live' | 'sim' }
  | { status: 'blocked'; actionId: string; ruleId: string; reason: string }
  | { status: 'pending_approval'; actionId: string; ruleId: string; reason: string; approvalUrl: string }
  | { status: 'execution_failed'; actionId: string; reason: string; debugId?: string }
  | { status: 'unknown_outcome'; actionId: string; reason: string }
  | { status: 'shadow'; actionId: string; wouldHave: { status: string; ruleId: string; reason: string }; refundId?: string; mode: 'live' | 'sim' }
  | { status: 'unavailable'; reason: string };

export async function readState(d: GateDeps, captureId: string): Promise<ExternalState> {
  if (!d.paypal) return { disputeOpen: d.mandate.blockIfOpenDispute ? false : null, capturedAtMs: null }; // sim: no live state; stale-state tests inject their own
  try {
    return await d.paypal.readState(captureId);
  } catch {
    return { disputeOpen: null, capturedAtMs: null };
  }
}

export async function runRefund(d: GateDeps, input: Omit<CheckInput, 'actionId'> & { actionId?: string }, note?: string): Promise<GateOutcome> {
  const now = d.now ?? Date.now;
  const actionId = input.actionId ?? `act_${randomUUID()}`;
  const ext = await readState(d, input.captureId);
  let cr: CheckResult;
  try {
    cr = check(d.db, d.mandate, { ...input, actionId }, now(), ext, d.paypal ? 'live' : 'sim');
  } catch (e) {
    if (e instanceof ReinBusyError) return { status: 'unavailable', reason: 'Rein is busy; nothing was refunded. Retry in a moment.' };
    return { status: 'unavailable', reason: 'Rein could not record the decision, so nothing was refunded (failing closed).' };
  }
  if (cr.shadow) {
    const exec = await execute(d, actionId, input.captureId, undefined, true, note);
    return { status: 'shadow', actionId, wouldHave: cr.wouldHave!, ...(exec.refundId ? { refundId: exec.refundId } : {}), mode: d.paypal ? 'live' : 'sim' };
  }
  if (cr.status === 'pending_approval') return { status: 'pending_approval', actionId, ruleId: cr.ruleId, reason: cr.reason, approvalUrl: cr.approvalUrl!.replace(/^https?:\/\/[^/]+/, d.publicUrl ?? 'http://127.0.0.1:4317') };
  if (cr.status === 'blocked') return { status: 'blocked', actionId, ruleId: cr.ruleId, reason: cr.reason };
  const row = d.db.one<{ amt: number; cur: string }>('SELECT a.amount_cents amt, p.currency cur FROM actions a JOIN payments p ON p.txn_id=a.capture_id WHERE a.id=?', actionId);
  const exec = await execute(d, actionId, input.captureId, row, false, note);
  if (exec.outcome === 'executed') return { status: 'executed', actionId, ruleId: cr.ruleId, refundId: exec.refundId!, amountCents: row!.amt, mode: d.paypal ? 'live' : 'sim' };
  if (exec.outcome === 'failed') return { status: 'execution_failed', actionId, reason: exec.reason ?? 'PayPal rejected the refund. No money moved; the reservation was released.', ...(exec.debugId ? { debugId: exec.debugId } : {}) };
  return { status: 'unknown_outcome', actionId, reason: 'No confirmed result from PayPal. The amount stays reserved until reconciled; do not retry blindly.' };
}

async function execute(d: GateDeps, actionId: string, captureId: string, row: { amt: number; cur: string } | undefined, shadow: boolean, note?: string): Promise<{ outcome: Outcome; refundId?: string; reason?: string; debugId?: string }> {
  const mode = d.paypal ? 'live' : 'sim';
  if (shadow) return {} as { outcome: Outcome }; // shadow mode never executes
  if (!d.paypal) {
    // SIMULATED: the only stubbed step. Shape matches a real COMPLETED refund response.
    const refundId = `SIM-${actionId.slice(-8).toUpperCase()}`;
    result(d.db, { actionId, outcome: 'executed', refundId }, Date.now(), mode);
    return { outcome: 'executed', refundId };
  }
  try {
    const r = await d.paypal.refund(captureId, row!.amt, row!.cur, actionId, note);
    if (/^(COMPLETED|PENDING)$/.test(r.status)) {
      result(d.db, { actionId, outcome: 'executed', refundId: r.id }, Date.now(), mode);
      return { outcome: 'executed', refundId: r.id };
    }
    result(d.db, { actionId, outcome: 'unknown' }, Date.now(), mode);
    return { outcome: 'unknown' };
  } catch (e) {
    if (e instanceof PayPalError && e.status >= 400 && e.status < 500) {
      result(d.db, { actionId, outcome: 'failed' }, Date.now(), mode);
      return { outcome: 'failed', reason: `PayPal rejected the refund (HTTP ${e.status}: ${e.message}). No money moved; the reservation was released.`, ...(e.debugId ? { debugId: e.debugId } : {}) };
    }
    result(d.db, { actionId, outcome: 'unknown' }, Date.now(), mode); // timeout, network, 5xx: ambiguous, keep the reservation
    return { outcome: 'unknown' };
  }
}
