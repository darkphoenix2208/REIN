// Test for LangChain wrapper with fake agent
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { wrap } from '../sdk/wrap-langchain.ts';

// Fake LangChain tool structure
class FakeStructuredTool {
  name: string;
  description: string;
  schema: any;
  func: (input: any, config?: any) => Promise<any>;

  constructor(config: { name: string; description: string; schema: any; func: (input: any) => Promise<any> }) {
    this.name = config.name;
    this.description = config.description;
    this.schema = config.schema;
    this.func = config.func;
  }
}

test('LangChain wrapper: blocked request throws error', async () => {
  let checkCalled = false;
  let resultCalled = false;

  // Mock global fetch
  const originalFetch = global.fetch;
  (global as any).fetch = async (url: string, options: any) => {
    if (url.includes('/v1/check')) {
      checkCalled = true;
      return {
        json: async () => ({
          status: 'blocked',
          reason: 'Amount exceeds hard limit',
          actionId: 'test-action-1',
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
    const refundTool = new FakeStructuredTool({
      name: 'refund_items',
      description: 'Refund items',
      schema: {},
      func: async ({ capture_id, items }) => {
        return { refunded: true };
      },
    });

    const gatedTool = wrap(refundTool, {
      reinBaseUrl: 'http://localhost:4317',
      reinToken: 'test-token',
    });

    await assert.rejects(
      async () => {
        await gatedTool.func({ capture_id: 'CAP123', items: [{ item_id: 'mug', qty: 1 }] });
      },
      /Rein blocked/,
      'Should throw when blocked'
    );

    assert.ok(checkCalled, 'Should have called /v1/check');
    assert.ok(!resultCalled, 'Should not call /v1/result when blocked');
  } finally {
    global.fetch = originalFetch;
  }
});

test('LangChain wrapper: allowed request executes and reports', async () => {
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
    const refundTool = new FakeStructuredTool({
      name: 'refund_items',
      description: 'Refund items',
      schema: {},
      func: async ({ capture_id, items }) => {
        toolExecuted = true;
        return { refunded: true, capture_id, items };
      },
    });

    const gatedTool = wrap(refundTool, {
      reinBaseUrl: 'http://localhost:4317',
    });

    const result = await gatedTool.func({ capture_id: 'CAP456', items: [{ item_id: 'mug', qty: 1 }] });

    assert.ok(checkCalled, 'Should have called /v1/check');
    assert.ok(toolExecuted, 'Should have executed the original tool');
    assert.ok(resultCalled, 'Should have called /v1/result');
    assert.ok(result.refunded, 'Should return tool result');
  } finally {
    global.fetch = originalFetch;
  }
});
