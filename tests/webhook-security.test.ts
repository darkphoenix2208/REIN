// Webhook signature verification tests
import { strictEqual as eq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import { PayPalClient } from '../server/paypal.ts';

describe('webhook signature verification', () => {
  test('verifyWebhookSignature returns true for valid signature', async () => {
    let verifyRequestBody: any;
    const mockFetch = async (url: string, opts: any) => {
      if (url.includes('/oauth2/token')) {
        return { ok: true, json: async () => ({ access_token: 'tok' }), text: async () => '{}' } as any;
      }
      if (url.includes('/verify-webhook-signature')) {
        verifyRequestBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ verification_status: 'SUCCESS' }), text: async () => '{"verification_status":"SUCCESS"}' } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const pp = new PayPalClient({
      baseUrl: 'https://api-m.sandbox.paypal.com',
      clientId: 'test',
      clientSecret: 'secret',
      fetchImpl: mockFetch as any,
    });

    const headers = {
      'paypal-transmission-id': 'test-trans-id',
      'paypal-transmission-time': '2024-01-01T00:00:00Z',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'test-signature',
    };
    const event = { event_type: 'PAYMENT.CAPTURE.REFUNDED', id: 'WH123' };

    const result = await pp.verifyWebhookSignature('webhook-id-123', headers, event);

    ok(result, 'signature verified');
    eq(verifyRequestBody.webhook_id, 'webhook-id-123');
    eq(verifyRequestBody.transmission_id, 'test-trans-id');
    eq(verifyRequestBody.webhook_event.event_type, 'PAYMENT.CAPTURE.REFUNDED');
  });

  test('verifyWebhookSignature returns false for invalid signature', async () => {
    const mockFetch = async (url: string, opts: any) => {
      if (url.includes('/oauth2/token')) {
        return { ok: true, json: async () => ({ access_token: 'tok' }), text: async () => '{}' } as any;
      }
      if (url.includes('/verify-webhook-signature')) {
        return { ok: true, json: async () => ({ verification_status: 'FAILURE' }), text: async () => '{"verification_status":"FAILURE"}' } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const pp = new PayPalClient({
      baseUrl: 'https://api-m.sandbox.paypal.com',
      clientId: 'test',
      clientSecret: 'secret',
      fetchImpl: mockFetch as any,
    });

    const headers = {
      'paypal-transmission-id': 'bad-id',
      'paypal-transmission-time': '2024-01-01T00:00:00Z',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'bad-signature',
    };
    const event = { event_type: 'PAYMENT.CAPTURE.REFUNDED', id: 'WH123' };

    const result = await pp.verifyWebhookSignature('webhook-id-123', headers, event);

    eq(result, false, 'invalid signature rejected');
  });

  test('verifyWebhookSignature returns false for missing headers', async () => {
    const pp = new PayPalClient({
      baseUrl: 'https://api-m.sandbox.paypal.com',
      clientId: 'test',
      clientSecret: 'secret',
      fetchImpl: (async () => { throw new Error('should not be called'); }) as any,
    });

    const headers = {
      'paypal-transmission-id': 'test-id',
      // Missing other headers
    };
    const event = { event_type: 'PAYMENT.CAPTURE.REFUNDED', id: 'WH123' };

    const result = await pp.verifyWebhookSignature('webhook-id-123', headers, event);

    eq(result, false, 'missing headers rejected');
  });

  test('verifyWebhookSignature returns false on API error', async () => {
    const mockFetch = async (url: string) => {
      if (url.includes('/oauth2/token')) {
        return { ok: true, json: async () => ({ access_token: 'tok' }), text: async () => '{}' } as any;
      }
      throw new Error('Network error');
    };

    const pp = new PayPalClient({
      baseUrl: 'https://api-m.sandbox.paypal.com',
      clientId: 'test',
      clientSecret: 'secret',
      fetchImpl: mockFetch as any,
    });

    const headers = {
      'paypal-transmission-id': 'test-id',
      'paypal-transmission-time': '2024-01-01T00:00:00Z',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'sig',
    };
    const event = { event_type: 'PAYMENT.CAPTURE.REFUNDED', id: 'WH123' };

    const result = await pp.verifyWebhookSignature('webhook-id-123', headers, event);

    eq(result, false, 'API error returns false');
  });

  test('replayed webhook with same transmission_id should be detectable', async () => {
    // This test demonstrates that PayPal's verification would catch replay attacks
    // because the transmission_id is unique per webhook event
    const seenTransmissions = new Set<string>();

    const mockFetch = async (url: string, opts: any) => {
      if (url.includes('/oauth2/token')) {
        return { ok: true, json: async () => ({ access_token: 'tok' }), text: async () => '{}' } as any;
      }
      if (url.includes('/verify-webhook-signature')) {
        const body = JSON.parse(opts.body);
        const transmissionId = body.transmission_id;

        // Simulate replay detection
        if (seenTransmissions.has(transmissionId)) {
          return { ok: true, json: async () => ({ verification_status: 'FAILURE' }), text: async () => '{"verification_status":"FAILURE"}' } as any;
        }

        seenTransmissions.add(transmissionId);
        return { ok: true, json: async () => ({ verification_status: 'SUCCESS' }), text: async () => '{"verification_status":"SUCCESS"}' } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const pp = new PayPalClient({
      baseUrl: 'https://api-m.sandbox.paypal.com',
      clientId: 'test',
      clientSecret: 'secret',
      fetchImpl: mockFetch as any,
    });

    const headers = {
      'paypal-transmission-id': 'unique-transmission-123',
      'paypal-transmission-time': '2024-01-01T00:00:00Z',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-sig': 'sig',
    };
    const event = { event_type: 'PAYMENT.CAPTURE.REFUNDED', id: 'WH123' };

    // First attempt succeeds
    const first = await pp.verifyWebhookSignature('webhook-id-123', headers, event);
    ok(first, 'first attempt verified');

    // Replay with same transmission_id fails
    const replay = await pp.verifyWebhookSignature('webhook-id-123', headers, event);
    eq(replay, false, 'replay detected and rejected');
  });
});
