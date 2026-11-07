// PayPal Disputes API integration and automated response generation
import type { PayPalClient } from './paypal.ts';
import type { Db } from './db.ts';

export interface DisputeDetails {
  disputeId: string;
  reason: string;
  status: string;
  disputeAmount: {
    currencyCode: string;
    value: string;
  };
  disputeLifeCycleStage: string;
  disputeChannel: string;
  messages?: Array<{
    postedBy: string;
    timePosted: string;
    content: string;
  }>;
}

export interface DisputeEvidence {
  trackingInfo?: {
    carrierName: string;
    trackingNumber: string;
  };
  refundIds?: string[];
  notes?: string;
}

export async function getDispute(
  client: PayPalClient,
  disputeId: string
): Promise<DisputeDetails | null> {
  try {
    const result = await client.request<DisputeDetails>(
      'GET',
      `/v1/customer/disputes/${disputeId}`
    );
    return result;
  } catch (error) {
    return null;
  }
}

export async function acceptDisputeClaim(
  client: PayPalClient,
  disputeId: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.request('POST', `/v1/customer/disputes/${disputeId}/accept-claim`, {
      body: {
        note: note || 'Accepting claim as requested by customer',
        accept_claim_type: 'REFUND',
      },
    });

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to accept claim',
    };
  }
}

export async function provideEvidence(
  client: PayPalClient,
  disputeId: string,
  evidence: DisputeEvidence
): Promise<{ success: boolean; error?: string }> {
  try {
    const body: any = {};

    if (evidence.notes) {
      body.note = evidence.notes;
    }

    if (evidence.trackingInfo) {
      body.tracking_info = [
        {
          carrier_name: evidence.trackingInfo.carrierName,
          tracking_number: evidence.trackingInfo.trackingNumber,
        },
      ];
    }

    if (evidence.refundIds && evidence.refundIds.length > 0) {
      body.refund_ids = evidence.refundIds;
    }

    await client.request('POST', `/v1/customer/disputes/${disputeId}/provide-evidence`, {
      body,
    });

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to provide evidence',
    };
  }
}

/**
 * Generate automated dispute response based on ledger history
 * Searches ledger for refunds related to the disputed transaction
 */
export function generateDisputeResponse(
  db: Db,
  captureId: string,
  disputeReason: string
): {
  suggestedAction: 'accept' | 'provide_evidence';
  evidence?: DisputeEvidence;
  reasoning: string;
} {
  // Check if refund was already issued
  const refunds = db.all<{ id: string; amount_cents: number; status: string; created_at: number }>(
    `SELECT id, amount_cents, status, created_at
     FROM actions
     WHERE capture_id = ? AND tool LIKE '%refund%' AND status IN ('executed', 'approved_executed')
     ORDER BY created_at DESC`,
    captureId
  );

  if (refunds.length > 0) {
    const totalRefunded = refunds.reduce((sum, r) => sum + r.amount_cents, 0);
    const refundIds = refunds.map(r => r.id);

    return {
      suggestedAction: 'provide_evidence',
      evidence: {
        refundIds,
        notes: `Customer has already been refunded ${(totalRefunded / 100).toFixed(2)} USD. Refund IDs: ${refundIds.join(', ')}. Please check your account for these completed refunds.`,
      },
      reasoning: `Found ${refunds.length} refund(s) totaling $${(totalRefunded / 100).toFixed(2)} already processed for this transaction.`,
    };
  }

  // Check dispute reason
  if (disputeReason.toLowerCase().includes('not received') || disputeReason.toLowerCase().includes('item_not_received')) {
    return {
      suggestedAction: 'provide_evidence',
      evidence: {
        notes: 'We are investigating the delivery status. Please allow 24-48 hours for our team to provide tracking information.',
      },
      reasoning: 'Item not received claim requires tracking evidence or delivery confirmation.',
    };
  }

  if (disputeReason.toLowerCase().includes('unauthorized') || disputeReason.toLowerCase().includes('fraud')) {
    return {
      suggestedAction: 'accept',
      reasoning: 'Unauthorized transaction claims should be reviewed by fraud team. Accepting claim to protect customer.',
    };
  }

  // Default: accept if unsure
  return {
    suggestedAction: 'accept',
    reasoning: 'No automated evidence available. Defaulting to accepting claim in customer\'s favor.',
  };
}
