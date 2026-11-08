// Test for OpenAI Swarm wrapper with fake agent
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { wrap } from '../sdk/wrap-openai.ts';

test('OpenAI wrapper: blocked request returns error object', async () => {
  let checkCalled = false;

  const originalFetch = global.fetch;
  (global as any).fetch = async (url: string, options: any) => {
    if (url.includes('/v1/check')) {
      checkCalled = true;
      return {
        json: async () => ({
          status: 'blocked',
          reason: 'Hard daily cap exceeded',
          actionId: 'test-action-1',
        }),
      };
    }
    return originalFetch(url, options);
  };

  try {
    const refundFunction = {
      name: 'refund_items',
      description: 'Refund items',
      parameters: {},
      function: async ({ capture_id, items }: any) => {
        return { refunded: true };
      },
    };

    const gatedFunction = wrap(refundFunction, {
      reinBaseUrl: 'http://localhost:4317',
    });

    const result = await gatedFunction.function({ capture_id: 'CAP123', items: [] });

    assert.ok(checkCalled, 'Should have called /v1/check');
    assert.ok(result.error, 'Should return error object');
    assert.match(result.error, /Blocked by Rein/, 'Error should mention blocking');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAI wrapper: allowed request executes and reports', async () => {
  let checkCalled = false;
  let resultCalled = false;
  let toolExecuted = false;

  const originalFetch = global.fetch;
  (global as any).fetch = async (url: string, options: any) => {
    if (url.includes('/v1/check')) {
      checkCalled = true;
      return {
        json: async () => ({
          status: 'allowed',
          actionId: 'test-action-2',
        }),
      };
    }
    if (url.includes('/v1/result')) {
      resultCalled = true;
      return { json: async () => ({ ok: true }) };
    }
    return originalFetch(url, options);
  };

  try {
    const refundFunction = {
      name: 'refund_items',
      description: 'Refund items',
      parameters: {},
      function: async ({ capture_id, items }: any) => {
        toolExecuted = true;
        return { refunded: true, capture_id };
      },
    };

    const gatedFunction = wrap(refundFunction, {
      reinBaseUrl: 'http://localhost:4317',
      reinToken: 'test-token',
    });

    const result = await gatedFunction.function({ capture_id: 'CAP456', items: [] });

    assert.ok(checkCalled, 'Should have called /v1/check');
    assert.ok(toolExecuted, 'Should have executed the original function');
    assert.ok(resultCalled, 'Should have called /v1/result');
    assert.ok(result.refunded, 'Should return function result');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAI wrapper: escalated request returns approval URL', async () => {
  let checkCalled = false;

  const originalFetch = global.fetch;
  (global as any).fetch = async (url: string, options: any) => {
    if (url.includes('/v1/check')) {
      checkCalled = true;
      return {
        json: async () => ({
          status: 'pending_approval',
          reason: 'Amount exceeds auto-approve limit',
          actionId: 'test-action-3',
          approvalUrl: 'http://localhost:4317/approve/test-action-3',
        }),
      };
    }
    return originalFetch(url, options);
  };

  try {
    const refundFunction = {
      name: 'refund_items',
      description: 'Refund items',
      parameters: {},
      function: async ({ capture_id, items }: any) => {
        return { refunded: true };
      },
    };

    const gatedFunction = wrap(refundFunction, {
      reinBaseUrl: 'http://localhost:4317',
    });

    const result = await gatedFunction.function({ capture_id: 'CAP789', items: [] });

    assert.ok(checkCalled, 'Should have called /v1/check');
    assert.ok(result.error, 'Should return error object');
    assert.ok(result.approvalUrl, 'Should include approval URL');
    assert.match(result.error, /Escalated by Rein/, 'Error should mention escalation');
  } finally {
    global.fetch = originalFetch;
  }
});
