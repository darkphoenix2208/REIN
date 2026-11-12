// Tests for Groq OpenAI-compatible provider in Beat the Gate challenge
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import { createApp } from '../server/app.ts';
import { loadMandate } from '../server/config.ts';
import { runLiveAgent } from '../server/challenge-agent.ts';
import { CHALLENGE_MANDATE, initChallengeSchema } from '../server/beat-the-gate.ts';
import { createFreshChallengeCapture } from '../server/challenge-seed.ts';
import { fileURLToPath } from 'node:url';

const __dir = fileURLToPath(new URL('.', import.meta.url));
const MANDATE = loadMandate(join(__dir, '..', 'mandate.json'));

function request(app: any, method: string, path: string, body?: object, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(app);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as any).port as number;
      const payload = body ? JSON.stringify(body) : undefined;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload).toString() } : {}),
          ...headers,
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          srv.close();
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode!, body: data });
          }
        });
      });
      req.on('error', (e) => { srv.close(); reject(e); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

describe('Groq Provider for Beat the Gate', () => {
  let envBackup: Record<string, string | undefined>;

  beforeEach(() => {
    envBackup = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GROQ_MODEL: process.env.GROQ_MODEL,
    };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test('no key => RECORDED mode via POST /v1/challenge/attempt', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);

    const app = createApp({ db, mandate: MANDATE, paypal: null });
    const res = await request(app, 'POST', '/v1/challenge/attempt', {
      message: 'Can I get a refund?',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.mode, 'recorded');
    assert.equal(res.body.synthetic, true);
    assert.ok(res.body.agentResponse);
  });

  test('fake HTTP client: normal tool call parsing and execution', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    initChallengeSchema(db);
    const captureId = createFreshChallengeCapture(db);

    const deps = {
      db,
      mandate: CHALLENGE_MANDATE,
      paypal: null,
      now: () => Date.now(),
    };

    let turn = 0;
    const fakeFetch: typeof fetch = async (_url: any, opts: any) => {
      turn++;
      if (turn === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_order',
                  arguments: JSON.stringify({ capture_id: captureId }),
                },
              }],
            },
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (turn === 2) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              tool_calls: [{
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'refund_items',
                  arguments: JSON.stringify({
                    capture_id: captureId,
                    items: [{ item_id: 'mug', qty: 1 }],
                  }),
                },
              }],
            },
          }],
          usage: { prompt_tokens: 150, completion_tokens: 60 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: 'I have refunded your coffee mug.',
          },
        }],
        usage: { prompt_tokens: 200, completion_tokens: 40 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await runLiveAgent(deps, 'Broken mug, please refund', captureId, undefined, {
      provider: 'groq',
      fetchFn: fakeFetch,
      model: 'llama-3.3-70b-versatile',
    });

    assert.equal(result.provider, 'groq');
    assert.equal(result.mode, 'live: Groq llama-3.3-70b-versatile');
    assert.equal(result.gateDecision, 'allowed');
    assert.equal(result.gateRule, 'R-ALLOW');
    assert.equal(result.refundedCents, 1800);
    assert.equal(result.toolCalls.length, 2);
    assert.equal(result.toolCalls[0].tool, 'get_order');
    assert.equal(result.toolCalls[1].tool, 'refund_items');
    assert.equal(result.tokensUsed, 100 + 50 + 150 + 60 + 200 + 40);
  });

  test('fake HTTP client: malformed tool JSON handled gracefully', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    initChallengeSchema(db);
    const captureId = createFreshChallengeCapture(db);

    const deps = {
      db,
      mandate: CHALLENGE_MANDATE,
      paypal: null,
      now: () => Date.now(),
    };

    let turn = 0;
    const fakeFetch: typeof fetch = async () => {
      turn++;
      if (turn === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              tool_calls: [{
                id: 'call_bad',
                type: 'function',
                function: {
                  name: 'refund_items',
                  arguments: '{ malformed json: not valid ...',
                },
              }],
            },
          }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Sorry, there was an issue formatting the request.',
          },
        }],
        usage: { prompt_tokens: 80, completion_tokens: 20 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await runLiveAgent(deps, 'Bad tool args', captureId, undefined, {
      provider: 'groq',
      fetchFn: fakeFetch,
    });

    assert.equal(result.toolCalls.length, 1);
    assert.ok(result.toolCalls[0].result.error);
    assert.match(result.toolCalls[0].result.error, /Malformed tool arguments JSON/);
  });

  test('fake HTTP client: HTTP 429 triggers error', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    initChallengeSchema(db);
    const captureId = createFreshChallengeCapture(db);

    const deps = {
      db,
      mandate: CHALLENGE_MANDATE,
      paypal: null,
      now: () => Date.now(),
    };

    const fakeFetch: typeof fetch = async () => {
      return new Response('Rate limit exceeded', { status: 429, statusText: 'Too Many Requests' });
    };

    await assert.rejects(
      async () => {
        await runLiveAgent(deps, 'Test 429', captureId, undefined, {
          provider: 'groq',
          fetchFn: fakeFetch,
        });
      },
      /Groq API returned HTTP 429/
    );
  });

  test('fake HTTP client: HTTP 500 triggers error', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    initChallengeSchema(db);
    const captureId = createFreshChallengeCapture(db);

    const deps = {
      db,
      mandate: CHALLENGE_MANDATE,
      paypal: null,
      now: () => Date.now(),
    };

    const fakeFetch: typeof fetch = async () => {
      return new Response('Internal Server Error', { status: 500, statusText: 'Server Error' });
    };

    await assert.rejects(
      async () => {
        await runLiveAgent(deps, 'Test 500', captureId, undefined, {
          provider: 'groq',
          fetchFn: fakeFetch,
        });
      },
      /Groq API returned HTTP 500/
    );
  });

  test('fake HTTP client: timeout triggers error', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    initChallengeSchema(db);
    const captureId = createFreshChallengeCapture(db);

    const deps = {
      db,
      mandate: CHALLENGE_MANDATE,
      paypal: null,
      now: () => Date.now(),
    };

    const fakeFetch: typeof fetch = async (_url: any, opts: any) => {
      // Simulate hanging request that waits longer than timeoutMs
      return new Promise((_resolve, reject) => {
        const signal = opts?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    await assert.rejects(
      async () => {
        await runLiveAgent(deps, 'Timeout test', captureId, undefined, {
          provider: 'groq',
          fetchFn: fakeFetch,
          timeoutMs: 50,
        });
      },
      /timed out/i
    );
  });

  test('token budget respected: stops when token cap reached', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    initChallengeSchema(db);
    const captureId = createFreshChallengeCapture(db);

    const deps = {
      db,
      mandate: CHALLENGE_MANDATE,
      paypal: null,
      now: () => Date.now(),
    };

    const fakeFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            tool_calls: [{
              id: 'call_huge',
              type: 'function',
              function: {
                name: 'get_order',
                arguments: JSON.stringify({ capture_id: captureId }),
              },
            }],
          },
        }],
        usage: { prompt_tokens: 3000, completion_tokens: 2000 }, // 5000 tokens
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await runLiveAgent(deps, 'Big tokens', captureId, undefined, {
      provider: 'groq',
      fetchFn: fakeFetch,
      maxTokensPerAttempt: 2000, // cap is 2000, request produces 5000
    });

    assert.equal(result.stoppedBy, 'token_cap');
    assert.equal(result.tokensUsed, 5000);
  });

  test('provider selection: Anthropic has priority over Groq when both set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.GROQ_API_KEY = 'gsk-test';

    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    initChallengeSchema(db);
    const captureId = createFreshChallengeCapture(db);

    const deps = {
      db,
      mandate: CHALLENGE_MANDATE,
      paypal: null,
      now: () => Date.now(),
    };

    // Provide mock Anthropic client
    const mockAnthropicClient = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: 'Hello from Anthropic' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      },
    };

    const result = await runLiveAgent(deps, 'Hello', captureId, undefined, {
      client: mockAnthropicClient,
    });

    assert.equal(result.provider, 'anthropic');
  });

  test('provider selection: Groq selected when only GROQ_API_KEY set', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';

    const path = join(mkdtempSync(join(tmpdir(), 'rein-groq-')), 't.db');
    const db = await openDb(path);
    applySchema(db);
    initChallengeSchema(db);
    const captureId = createFreshChallengeCapture(db);

    const deps = {
      db,
      mandate: CHALLENGE_MANDATE,
      paypal: null,
      now: () => Date.now(),
    };

    const fakeFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hello from Groq',
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 15 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await runLiveAgent(deps, 'Hello', captureId, undefined, {
      fetchFn: fakeFetch,
    });

    assert.equal(result.provider, 'groq');
    assert.match(result.mode || '', /^live: Groq/);
  });
});
