import type { Db } from './db.ts';
import type { VelocityRule, VelocityCheck } from './types.ts';

export function checkVelocity(
  db: Db,
  customerId: string,
  amountCents: number,
  rule: VelocityRule,
  nowMs: number
): VelocityCheck {
  const windowMs = rule.windowHours * 60 * 60 * 1000;
  const windowStartMs = nowMs - windowMs;

  // Query ledger for customer's executed actions in window
  const rows = db.all<{ payload_json: string }>(`
    SELECT payload_json
    FROM ledger
    WHERE payload_json LIKE ?
      AND created_at >= ?
      AND event IN ('executed', 'approved_executed')
  `, `%"customerId":"${customerId}"%`, windowStartMs);

  let currentActions = 0;
  let currentAmountCents = 0;

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json);
      if (payload.customerId === customerId) {
        currentActions++;
        currentAmountCents += payload.amountCents || 0;
      }
    } catch {
      // Ignore malformed JSON
    }
  }
  const projectedActions = currentActions + 1;
  const projectedAmount = currentAmountCents + amountCents;

  // Check if limits would be exceeded
  if (projectedActions > rule.maxActions) {
    return {
      customerId,
      windowMs,
      currentActions,
      currentAmountCents,
      maxActions: rule.maxActions,
      maxAmountCents: rule.maxAmountCents,
      status: 'exceeded',
      message: `Customer has ${currentActions} refunds in last ${rule.windowHours}h, max is ${rule.maxActions}`
    };
  }

  if (projectedAmount > rule.maxAmountCents) {
    return {
      customerId,
      windowMs,
      currentActions,
      currentAmountCents,
      maxActions: rule.maxActions,
      maxAmountCents: rule.maxAmountCents,
      status: 'exceeded',
      message: `Customer has $${(currentAmountCents / 100).toFixed(2)} refunded in last ${rule.windowHours}h, max is $${(rule.maxAmountCents / 100).toFixed(2)}`
    };
  }

  // Check if approaching limits (>80%)
  const actionThreshold = rule.maxActions * 0.8;
  const amountThreshold = rule.maxAmountCents * 0.8;

  if (projectedActions >= actionThreshold || projectedAmount >= amountThreshold) {
    return {
      customerId,
      windowMs,
      currentActions,
      currentAmountCents,
      maxActions: rule.maxActions,
      maxAmountCents: rule.maxAmountCents,
      status: 'approaching',
      message: `Customer approaching velocity limits: ${currentActions}/${rule.maxActions} actions, $${(currentAmountCents / 100).toFixed(2)}/$${(rule.maxAmountCents / 100).toFixed(2)}`
    };
  }

  return {
    customerId,
    windowMs,
    currentActions,
    currentAmountCents,
    maxActions: rule.maxActions,
    maxAmountCents: rule.maxAmountCents,
    status: 'allowed'
  };
}
