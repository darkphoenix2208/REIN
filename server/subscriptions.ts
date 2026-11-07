// PayPal Subscriptions API integration for managing recurring payments
import type { PayPalClient } from './paypal.ts';

export interface SubscriptionCancelRequest {
  subscriptionId: string;
  reason?: string;
}

export interface SubscriptionDetails {
  id: string;
  planId: string;
  status: string;
  statusUpdateTime: string;
  startTime: string;
  subscriber: {
    emailAddress?: string;
    name?: {
      givenName?: string;
      surname?: string;
    };
  };
  billingInfo?: {
    lastPayment?: {
      amount: {
        currencyCode: string;
        value: string;
      };
      time: string;
    };
    nextBillingTime?: string;
  };
}

export async function cancelSubscription(
  client: PayPalClient,
  subscriptionId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.request('POST', `/v1/billing/subscriptions/${subscriptionId}/cancel`, {
      body: {
        reason: reason || 'Customer requested cancellation via support agent',
      },
    });

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to cancel subscription',
    };
  }
}

export async function getSubscription(
  client: PayPalClient,
  subscriptionId: string
): Promise<SubscriptionDetails | null> {
  try {
    const result = await client.request<SubscriptionDetails>(
      'GET',
      `/v1/billing/subscriptions/${subscriptionId}`
    );
    return result;
  } catch (error) {
    return null;
  }
}

export async function suspendSubscription(
  client: PayPalClient,
  subscriptionId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.request('POST', `/v1/billing/subscriptions/${subscriptionId}/suspend`, {
      body: {
        reason: reason || 'Customer requested suspension',
      },
    });

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to suspend subscription',
    };
  }
}

export async function activateSubscription(
  client: PayPalClient,
  subscriptionId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.request('POST', `/v1/billing/subscriptions/${subscriptionId}/activate`, {
      body: {
        reason: reason || 'Customer requested reactivation',
      },
    });

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to activate subscription',
    };
  }
}
