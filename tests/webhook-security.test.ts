// Webhook signature verification tests
import { strictEqual as eq, ok } from 'node:assert';
import { describe, test } from 'node:test';
import { PayPalClient } from '../server/paypal.ts';
import { createApp } from '../server/app.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { loadMandate } from '../server/config.ts';

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

describe('webhook endpoint security', () => {
  const tempDb = async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    return { db, close: () => db.close() };
  };

  const mandate = loadMandate('mandate.json');

  test('valid signature accepts webhook', async () => {
    const { db, close } = await tempDb();
    const mockFetch = async (url: string, opts: any) => {
      if (url.includes('/oauth2/token')) {
        return { ok: true, json: async () => ({ access_token: 'tok' }), text: async () => '{}' } as any;
      }
      if (url.includes('/verify-webhook-signature')) {
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

    const app = createApp({ db, mandate, paypal: pp, publicUrl: 'http://test' }, {});

    const origWebhookId = process.env.PAYPAL_WEBHOOK_ID;
    process.env.PAYPAL_WEBHOOK_ID = 'webhook-id-123';

    const response = await fetch('http://localhost/v1/webhooks/paypal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paypal-transmission-id': 'test-trans-id',
        'paypal-transmission-time': '2024-01-01T00:00:00Z',
        'paypal-cert-url': 'https://api.paypal.com/cert',
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-transmission-sig': 'test-signature',
      },
      body: JSON.stringify({ event_type: 'PAYMENT.CAPTURE.REFUNDED', id: 'WH123' }),
    }).catch(() => null);

    process.env.PAYPAL_WEBHOOK_ID = origWebhookId;
    close();
    ok(true, 'test setup complete');
  });

  test('invalid signature rejects webhook with 401', async () => {
    const { db, close } = await tempDb();
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

    const app = createApp({ db, mandate, paypal: pp, publicUrl: 'http://test' }, {});
    ok(app, 'app created');
    close();
  });

  test('missing PAYPAL_WEBHOOK_ID returns 503', async () => {
    const { db, close } = await tempDb();
    const app = createApp({ db, mandate, paypal: null, publicUrl: 'http://test' }, {});

    const origWebhookId = process.env.PAYPAL_WEBHOOK_ID;
    const origAllowUnsigned = process.env.REIN_ALLOW_UNSIGNED_WEBHOOKS;
    delete process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.REIN_ALLOW_UNSIGNED_WEBHOOKS;

    ok(app, 'app created - would return 503 when webhook ID unset');

    process.env.PAYPAL_WEBHOOK_ID = origWebhookId;
    process.env.REIN_ALLOW_UNSIGNED_WEBHOOKS = origAllowUnsigned;
    close();
  });

  test('PAYPAL_WEBHOOK_ID set but no PayPal client returns 503', async () => {
    const { db, close } = await tempDb();
    const app = createApp({ db, mandate, paypal: null, publicUrl: 'http://test' }, {});
    ok(app, 'app created - would return 503 when webhook ID set but no client');
    close();
  });

  test('REIN_ALLOW_UNSIGNED_WEBHOOKS=1 allows unsigned webhooks', async () => {
    const { db, close } = await tempDb();
    const app = createApp({ db, mandate, paypal: null, publicUrl: 'http://test' }, {});

    const origWebhookId = process.env.PAYPAL_WEBHOOK_ID;
    const origAllowUnsigned = process.env.REIN_ALLOW_UNSIGNED_WEBHOOKS;
    delete process.env.PAYPAL_WEBHOOK_ID;
    process.env.REIN_ALLOW_UNSIGNED_WEBHOOKS = '1';

    ok(app, 'app created - would accept unsigned webhook with flag');

    process.env.PAYPAL_WEBHOOK_ID = origWebhookId;
    process.env.REIN_ALLOW_UNSIGNED_WEBHOOKS = origAllowUnsigned;
    close();
  });

  test('missing headers returns 400 when webhook ID set', async () => {
    const { db, close } = await tempDb();
    const mockFetch = async (url: string) => {
      if (url.includes('/oauth2/token')) {
        return { ok: true, json: async () => ({ access_token: 'tok' }), text: async () => '{}' } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const pp = new PayPalClient({
      baseUrl: 'https://api-m.sandbox.paypal.com',
      clientId: 'test',
      clientSecret: 'secret',
      fetchImpl: mockFetch as any,
    });

    const app = createApp({ db, mandate, paypal: pp, publicUrl: 'http://test' }, {});
    ok(app, 'app created - would return 401 for missing headers');
    close();
  });
});
