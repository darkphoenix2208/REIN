// One place that runs a refund request end to end: read live PayPal state (OUTSIDE the transaction), check+reserve (ONE transaction),
// call PayPal (OUTSIDE the transaction, idempotent), then record the outcome. Used by the MCP proxy and the HTTP API.
import { randomUUID } from 'node:crypto';
import { ReinBusyError, type Db } from './db.ts';
import { check, result, type Outcome } from './dispatch.ts';
import { PayPalError, type PayPalClient } from './paypal.ts';
import { sendPayout } from './payouts.ts';
import { mandateHash, saveMandateVersion } from './mandate-version.ts';
import type { CheckInput, CheckResult, ExternalState, Mandate } from './types.ts';

export interface GateDeps {
  db: Db;
  mandate: Mandate;
  paypal: PayPalClient | null; // null = SIMULATED (no credentials): the final call is a stub, everything else is the real pipeline
  publicUrl?: string;
  now?: () => number;
}

export type GateOutcome =
  | { status: 'executed'; actionId: string; ruleId: string; refundId?: string; payoutId?: string; amountCents: number; mode: 'live' | 'sim' }
  | { status: 'blocked'; actionId: string; ruleId: string; reason: string }
  | { status: 'pending_approval'; actionId: string; ruleId: string; reason: string; approvalUrl?: string }
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
  const ext = input.captureId ? await readState(d, input.captureId) : undefined;
  let cr: CheckResult;
  try {
    cr = check(d.db, d.mandate, { ...input, actionId }, now(), ext, d.paypal ? 'live' : 'sim');
  } catch (e) {
    if (e instanceof ReinBusyError) return { status: 'unavailable', reason: 'Rein is busy; nothing was refunded. Retry in a moment.' };
    return { status: 'unavailable', reason: 'Rein could not record the decision, so nothing was refunded (failing closed).' };
  }
  if (cr.shadow) {
    const exec = input.captureId ? await execute(d, actionId, input.captureId, undefined, true, note) : { outcome: 'failed' as const, reason: 'Shadow mode not supported for payouts' };
    return { status: 'shadow', actionId, wouldHave: cr.wouldHave!, ...(exec.refundId ? { refundId: exec.refundId } : {}), mode: d.paypal ? 'live' : 'sim' };
  }
  if (cr.status === 'pending_approval') return { status: 'pending_approval', actionId, ruleId: cr.ruleId, reason: cr.reason, approvalUrl: cr.approvalUrl!.replace(/^https?:\/\/[^/]+/, d.publicUrl ?? 'http://127.0.0.1:4317') };
  if (cr.status === 'blocked') return { status: 'blocked', actionId, ruleId: cr.ruleId, reason: cr.reason };
  const row = d.db.one<{ amt: number; cur: string }>('SELECT a.amount_cents amt, p.currency cur FROM actions a JOIN payments p ON p.txn_id=a.capture_id WHERE a.id=?', actionId);
  const exec = input.captureId ? await execute(d, actionId, input.captureId, row, false, note) : { outcome: 'failed' as const, reason: 'Payout execution not yet implemented' };
  if (exec.outcome === 'executed') return { status: 'executed', actionId, ruleId: cr.ruleId, refundId: exec.refundId!, amountCents: row!.amt, mode: d.paypal ? 'live' : 'sim' };
  if (exec.outcome === 'failed') return { status: 'execution_failed', actionId, reason: exec.reason ?? 'PayPal rejected the refund. No money moved; the reservation was released.', ...(exec.debugId ? { debugId: exec.debugId } : {}) };
  return { status: 'unknown_outcome', actionId, reason: 'No confirmed result from PayPal. The amount stays reserved until reconciled; do not retry blindly.' };
}

export async function runPayout(d: GateDeps, input: Omit<CheckInput, 'actionId'> & { actionId?: string }): Promise<GateOutcome> {
  const now = d.now ?? Date.now;
  const actionId = input.actionId ?? `payout_${randomUUID()}`;
  let cr: CheckResult;

  try {
    cr = check(d.db, d.mandate, { ...input, actionId }, now(), undefined, d.paypal ? 'live' : 'sim');
  } catch (e) {
    if (e instanceof ReinBusyError) return { status: 'unavailable', reason: 'Rein is busy; nothing was sent. Retry in a moment.' };
    return { status: 'unavailable', reason: 'Rein could not record the decision, so nothing was sent (failing closed).' };
  }

  if (cr.status === 'pending_approval') {
    return {
      status: 'pending_approval',
      actionId,
      ruleId: cr.ruleId,
      reason: cr.reason,
      approvalUrl: cr.approvalUrl!.replace(/^https?:\/\/[^/]+/, d.publicUrl ?? 'http://127.0.0.1:4317')
    };
  }

  if (cr.status === 'blocked') {
    return { status: 'blocked', actionId, ruleId: cr.ruleId, reason: cr.reason };
  }

  // Execute the payout
  const exec = await executePayout(d, actionId, input.payeeEmail!, input.amountCents!, input.currency ?? 'USD', input.note);

  if (exec.outcome === 'executed') {
    return {
      status: 'executed',
      actionId,
      ruleId: cr.ruleId,
      payoutId: exec.payoutId!,
      amountCents: input.amountCents!,
      mode: d.paypal ? 'live' : 'sim'
    };
  }

  if (exec.outcome === 'failed') {
    return {
      status: 'execution_failed',
      actionId,
      reason: exec.reason ?? 'PayPal rejected the payout. No money moved; the reservation was released.'
    };
  }

  return {
    status: 'unknown_outcome',
    actionId,
    reason: 'No confirmed result from PayPal. The amount stays reserved until reconciled; do not retry blindly.'
  };
}

async function executePayout(d: GateDeps, actionId: string, payeeEmail: string, amountCents: number, currency: string, note?: string): Promise<{ outcome: Outcome; payoutId?: string; reason?: string }> {
  const mode = d.paypal ? 'live' : 'sim';

  if (!d.paypal) {
    // SIMULATED: stub for demo
    const payoutId = `SIM-PAYOUT-${actionId.slice(-8).toUpperCase()}`;
    result(d.db, { actionId, outcome: 'executed', refundId: payoutId }, Date.now(), mode);
    return { outcome: 'executed', payoutId };
  }

  try {
    const payoutResult = await sendPayout(d.paypal, {
      payeeEmail,
      amountCents,
      currency,
      note
    }, actionId);

    if (payoutResult.status === 'SUCCESS' || payoutResult.status === 'PENDING') {
      result(d.db, { actionId, outcome: 'executed', refundId: payoutResult.payoutItemId }, Date.now(), mode);
      return { outcome: 'executed', payoutId: payoutResult.payoutItemId };
    }

    result(d.db, { actionId, outcome: 'unknown' }, Date.now(), mode);
    return { outcome: 'unknown' };
  } catch (e) {
    if (e instanceof PayPalError && e.status >= 400 && e.status < 500) {
      result(d.db, { actionId, outcome: 'failed' }, Date.now(), mode);
      return { outcome: 'failed', reason: `PayPal rejected the payout (HTTP ${e.status}: ${e.message}). No money moved; the reservation was released.` };
    }
    result(d.db, { actionId, outcome: 'unknown' }, Date.now(), mode);
    return { outcome: 'unknown' };
  }
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

export async function runSubscriptionCancel(
  d: GateDeps,
  input: { subscriptionId: string; reason?: string; sessionId: string; actionId?: string; subscriptionValue?: number; subscriptionStatus?: string }
): Promise<GateOutcome> {
  const now = d.now ?? Date.now;
  const actionId = input.actionId ?? `sub_${randomUUID()}`;

  // Get subscription details first
  let subscriptionDetails: any = null;
  let subscriptionValue = input.subscriptionValue ?? 0;
  let subscriptionStatus = input.subscriptionStatus ?? 'ACTIVE'; // Default to ACTIVE for sim mode

  if (d.paypal) {
    const { getSubscription } = await import('./subscriptions.ts');
    subscriptionDetails = await getSubscription(d.paypal, input.subscriptionId);

    if (!subscriptionDetails) {
      return { status: 'unavailable', reason: 'Subscription not found or lookup failed.' };
    }

    subscriptionStatus = input.subscriptionStatus ?? subscriptionDetails.status;
    // Estimate monthly value from last payment
    if (subscriptionDetails.billingInfo?.lastPayment?.amount?.value) {
      const { toCents } = await import('./paypal.ts');
      subscriptionValue = input.subscriptionValue ?? toCents(subscriptionDetails.billingInfo.lastPayment.amount.value) ?? 0;
    }
  } else if (!subscriptionValue) {
    // Simulated mode: use reasonable defaults
    subscriptionValue = 1500; // $15/month default
  }

  // Check through dispatch
  const { checkSubscription } = await import('./dispatch.ts');
  let cr: CheckResult;

  try {
    cr = checkSubscription(d.db, d.mandate, {
      actionId,
      sessionId: input.sessionId,
      tool: 'cancel_subscription',
      subscriptionId: input.subscriptionId,
      subscriptionStatus,
      subscriptionValue,
    }, now(), d.paypal ? 'live' : 'sim');
  } catch (e) {
    if (e instanceof ReinBusyError) {
      return { status: 'unavailable', reason: 'Rein is busy; nothing was cancelled. Retry in a moment.' };
    }
    return { status: 'unavailable', reason: 'Rein could not record the decision, so nothing was cancelled (failing closed).' };
  }

  if (cr.status === 'pending_approval') {
    return {
      status: 'pending_approval',
      actionId,
      ruleId: cr.ruleId,
      reason: cr.reason,
      approvalUrl: cr.approvalUrl!.replace(/^https?:\/\/[^/]+/, d.publicUrl ?? 'http://127.0.0.1:4317')
    };
  }

  if (cr.status === 'blocked') {
    return { status: 'blocked', actionId, ruleId: cr.ruleId, reason: cr.reason };
  }

  // Execute cancellation
  if (!d.paypal) {
    // Simulated mode
    result(d.db, { actionId, outcome: 'executed' }, now(), 'sim');
    return {
      status: 'executed',
      actionId,
      ruleId: cr.ruleId,
      amountCents: subscriptionValue,
      mode: 'sim'
    };
  }

  const { cancelSubscription } = await import('./subscriptions.ts');
  const cancelResult = await cancelSubscription(d.paypal, input.subscriptionId, input.reason);

  if (cancelResult.success) {
    result(d.db, { actionId, outcome: 'executed' }, now(), 'live');
    return {
      status: 'executed',
      actionId,
      ruleId: cr.ruleId,
      amountCents: subscriptionValue,
      mode: 'live'
    };
  } else {
    result(d.db, { actionId, outcome: 'failed' }, now(), 'live');
    return {
      status: 'execution_failed',
      actionId,
      reason: cancelResult.error || 'Subscription cancellation failed.'
    };
  }
}

export async function runDisputeHandle(
  d: GateDeps,
  input: {
    disputeId: string;
    captureId: string;
    sessionId: string;
    actionId?: string;
    disputeReason?: string;
    disputeAmountCents?: number;
    action?: 'accept' | 'provide_evidence';
  }
): Promise<GateOutcome> {
  const now = d.now ?? Date.now;
  const actionId = input.actionId ?? `dispute_${randomUUID()}`;

  // Generate dispute response from ledger
  const { generateDisputeResponse, getDispute, acceptDisputeClaim, provideEvidence } = await import('./disputes.ts');

  let disputeDetails: any = null;
  let disputeAmountCents = input.disputeAmountCents ?? 0;

  if (d.paypal) {
    disputeDetails = await getDispute(d.paypal, input.disputeId);
    if (!disputeDetails) {
      return { status: 'unavailable', reason: 'Dispute not found or lookup failed.' };
    }

    const { toCents } = await import('./paypal.ts');
    disputeAmountCents = input.disputeAmountCents ?? toCents(disputeDetails.disputeAmount?.value ?? '0') ?? 0;
  } else if (!disputeAmountCents) {
    // Simulated mode: use default dispute amount
    disputeAmountCents = 5000; // $50 default
  }

  const disputeReason = input.disputeReason ?? disputeDetails?.reason ?? 'ITEM_NOT_RECEIVED';
  const response = generateDisputeResponse(d.db, input.captureId, disputeReason);
  const suggestedAction = input.action ?? response.suggestedAction;

  // Providing evidence is a zero-cost action allowed within rules, but hard rules (mandate expiry) still apply.
  if (suggestedAction === 'provide_evidence') {
    // Hard rule: mandate expiry is checked even for evidence actions
    const ts = now();
    const mHash = mandateHash(d.mandate);
    saveMandateVersion(d.db, d.mandate);
    const agentId = input.sessionId;

    if (ts > d.mandate.expiresAt) {
      // Record in actions + ledger so it appears in the audit trail
      d.db.run(
        `INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at,action_type,mandate_version,agent_id)
         VALUES (?,?,?,NULL,0,'blocked','R-MANDATE-EXPIRED','The mandate has expired.','blocked',?,?,'dispute',?,?)`,
        actionId, input.sessionId, 'handle_dispute', ts, ts, mHash, agentId
      );
      const { ledger } = await import('./ledger.ts');
      ledger(d.db, actionId, 'blocked', { mode: d.paypal ? 'live' : 'sim', ruleId: 'R-MANDATE-EXPIRED', amountCents: 0 }, ts, mHash, agentId);
      return { status: 'blocked', actionId, ruleId: 'R-MANDATE-EXPIRED', reason: 'The mandate has expired.' };
    }

    const mode = d.paypal ? 'live' : 'sim';
    // Record the evidence action in the actions table (amount=0)
    d.db.run(
      `INSERT INTO actions(id,session_id,tool,capture_id,amount_cents,decision,rule_id,reason,status,created_at,updated_at,action_type,mandate_version,agent_id)
       VALUES (?,?,?,NULL,0,'allowed','R-ALLOW','Providing evidence to dispute is allowed.','reserved',?,?,'dispute',?,?)`,
      actionId, input.sessionId, 'handle_dispute', now(), now(), mHash, agentId
    );

    if (!d.paypal) {
      // SIMULATED: mark executed immediately
      result(d.db, { actionId, outcome: 'executed' }, now(), mode);
      return {
        status: 'executed',
        actionId,
        ruleId: 'R-ALLOW',
        amountCents: 0,
        mode: 'sim'
      };
    }

    const evidenceResult = await provideEvidence(d.paypal, input.disputeId, response.evidence!);
    if (evidenceResult.success) {
      result(d.db, { actionId, outcome: 'executed' }, now(), mode);
      return {
        status: 'executed',
        actionId,
        ruleId: 'R-ALLOW',
        amountCents: 0,
        mode: 'live'
      };
    } else {
      result(d.db, { actionId, outcome: 'failed' }, now(), mode);
      return {
        status: 'execution_failed',
        actionId,
        reason: evidenceResult.error || 'Failed to provide evidence.'
      };
    }
  }

  // Accepting claim costs money - must go through gate
  const { checkDispute } = await import('./dispatch.ts');
  let cr: CheckResult;

  try {
    cr = checkDispute(d.db, d.mandate, {
      actionId,
      sessionId: input.sessionId,
      tool: 'handle_dispute',
      disputeId: input.disputeId,
      disputeAction: 'accept',
      disputeReason,
      disputeAmountCents,
    }, now(), d.paypal ? 'live' : 'sim');
  } catch (e) {
    if (e instanceof ReinBusyError) {
      return { status: 'unavailable', reason: 'Rein is busy; nothing was done. Retry in a moment.' };
    }
    return { status: 'unavailable', reason: 'Rein could not record the decision, so nothing was done (failing closed).' };
  }

  if (cr.status === 'pending_approval') {
    return {
      status: 'pending_approval',
      actionId,
      ruleId: cr.ruleId,
      reason: cr.reason,
      approvalUrl: cr.approvalUrl!.replace(/^https?:\/\/[^/]+/, d.publicUrl ?? 'http://127.0.0.1:4317')
    };
  }

  if (cr.status === 'blocked') {
    return { status: 'blocked', actionId, ruleId: cr.ruleId, reason: cr.reason };
  }

  // Execute acceptance
  if (!d.paypal) {
    result(d.db, { actionId, outcome: 'executed' }, now(), 'sim');
    return {
      status: 'executed',
      actionId,
      ruleId: cr.ruleId,
      amountCents: disputeAmountCents,
      mode: 'sim'
    };
  }

  const acceptResult = await acceptDisputeClaim(d.paypal, input.disputeId, response.reasoning);

  if (acceptResult.success) {
    result(d.db, { actionId, outcome: 'executed' }, now(), 'live');
    return {
      status: 'executed',
      actionId,
      ruleId: cr.ruleId,
      amountCents: disputeAmountCents,
      mode: 'live'
    };
  } else {
    result(d.db, { actionId, outcome: 'failed' }, now(), 'live');
    return {
      status: 'execution_failed',
      actionId,
      reason: acceptResult.error || 'Dispute claim acceptance failed.'
    };
  }
}
