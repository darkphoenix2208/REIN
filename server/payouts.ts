// PayPal Payouts API integration for sending money (payout action type)
import type { PayPalClient } from './paypal.ts';

export interface PayoutRequest {
  payeeEmail: string;
  amountCents: number;
  currency: string;
  note?: string;
}

export interface PayoutResult {
  payoutId: string;
  payoutItemId: string;
  status: string;
}

export async function sendPayout(
  client: PayPalClient,
  request: PayoutRequest,
  senderItemId: string
): Promise<PayoutResult> {
  const token = await client.getToken();
  const url = `${client.baseUrl}/v1/payments/payouts`;

  const body = {
    sender_batch_header: {
      sender_batch_id: senderItemId,
      email_subject: 'You have a payout',
      email_message: request.note || 'You have received a payout',
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: {
          value: (request.amountCents / 100).toFixed(2),
          currency: request.currency,
        },
        receiver: request.payeeEmail,
        note: request.note || 'Payout',
        sender_item_id: senderItemId,
      },
    ],
  };

  const response = await client.fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PayPal payout failed: ${response.status} ${text}`);
  }

  const data = JSON.parse(text);
  return {
    payoutId: data.batch_header?.payout_batch_id || 'UNKNOWN',
    payoutItemId: data.items?.[0]?.payout_item_id || 'UNKNOWN',
    status: data.batch_header?.batch_status || 'UNKNOWN',
  };
}
