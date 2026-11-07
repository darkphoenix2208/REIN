export interface Mandate {
  perActionCapCents: number; // largest refund the agent may issue alone
  hardMaxCents: number; // largest refund ever allowed, even with human approval
  dailyCapCents: number; // rolling 24h agent-alone refunds
  hardDailyCapCents: number; // rolling 24h absolute limit
  expiresAt: number; // epoch ms
  dupWindowMs?: number; // 0 disables the duplicate rule; default 24h
  returnWindowDays?: number | null; // refund only within N days of capture
  blockIfOpenDispute?: boolean; // refuse refunds on payments with an open dispute
  escalateFullOrder?: boolean; // refunding every item of an order needs a human (default true)
  shadow?: boolean; // record would-have decisions, never block
  // Payout-specific limits
  payoutPerPayeeCapCents?: number; // max payout to a single payee in rolling 24h
  payoutDailyCapCents?: number; // rolling 24h total payouts
  payoutHardMaxCents?: number; // largest single payout ever allowed
  payoutAllowlist?: string[]; // allowed payee emails; empty = all escalate as new payees
  payoutEscalateNewPayee?: boolean; // require approval for first-time payees (default true)
  // Buyer-side purchase limits
  perPurchaseCapCents?: number; // largest single purchase the agent may make alone
  agentDailyBudgetCents?: number; // rolling 24h total purchase budget per agent
  purchaseHardMaxCents?: number; // largest single purchase ever allowed
  productBlocklist?: string[]; // blocked product categories or IDs (e.g. gift_cards, crypto)
  productAllowlist?: string[]; // allowed product categories or IDs; if set and non-empty, others blocked
}

export type Status = 'allowed' | 'blocked' | 'pending_approval';

export interface Decision {
  status: Status;
  ruleId: string;
  reason: string;
}

export interface CheckResult extends Decision {
  actionId: string;
  approvalUrl?: string;
  token?: string;
  shadow?: boolean;
  wouldHave?: Decision;
}

/** Live PayPal state read BEFORE the transaction (never inside BEGIN IMMEDIATE). null = lookup failed. */
export interface ExternalState {
  disputeOpen: boolean | null;
  capturedAtMs: number | null;
}

export interface PayRow {
  c: number; // captured cents
  f: number; // refunded cents
  r: number; // reserved cents
  cur?: string;
  capturedAt?: number | null;
}

export interface CheckInput {
  actionId: string;
  sessionId: string;
  tool: string;
  captureId?: string; // optional for payouts
  amountCents: number | null;
  currency?: string;
  items?: { itemId: string; qty: number }[];
  // Payout-specific fields
  payeeEmail?: string;
  note?: string;
  agentId?: string;
  // Purchase-specific fields
  productId?: string;
  productCategory?: string;
}

export interface PurchasePolicyState {
  amountCents: number;
  agentDailySpendCents: number;
  productId: string;
  productCategory?: string;
  lookupFailed?: boolean;
  now: number;
  approved?: boolean;
}

