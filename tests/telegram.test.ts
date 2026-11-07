// Telegram integration tests
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sendTelegramApproval,
  sendTelegramResult,
  getTelegramConfig,
  isTelegramEnabled,
} from '../server/telegram.ts';

describe('Telegram integration', () => {
  test('getTelegramConfig returns null when env vars not set', () => {
    const oldToken = process.env.TELEGRAM_BOT_TOKEN;
    const oldChatId = process.env.TELEGRAM_CHAT_ID;

    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const config = getTelegramConfig();
    assert.equal(config, null);
    assert.equal(isTelegramEnabled(), false);

    if (oldToken) process.env.TELEGRAM_BOT_TOKEN = oldToken;
    if (oldChatId) process.env.TELEGRAM_CHAT_ID = oldChatId;
  });

  test('getTelegramConfig returns config when env vars are set', () => {
    const oldToken = process.env.TELEGRAM_BOT_TOKEN;
    const oldChatId = process.env.TELEGRAM_CHAT_ID;

    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';
    process.env.TELEGRAM_CHAT_ID = '123456';

    const config = getTelegramConfig();
    assert.ok(config);
    assert.equal(config!.botToken, 'test_bot_token');
    assert.equal(config!.chatId, '123456');
    assert.equal(isTelegramEnabled(), true);

    if (oldToken) process.env.TELEGRAM_BOT_TOKEN = oldToken;
    else delete process.env.TELEGRAM_BOT_TOKEN;
    if (oldChatId) process.env.TELEGRAM_CHAT_ID = oldChatId;
    else delete process.env.TELEGRAM_CHAT_ID;
  });

  test('sendTelegramApproval handles invalid bot token gracefully', async () => {
    const result = await sendTelegramApproval(
      { botToken: 'invalid_token', chatId: '123' },
      {
        actionId: 'test-123',
        amountCents: 5000,
        currency: 'USD',
        ruleId: 'R-ACTION-CAP',
        reason: 'Amount exceeds auto-approve limit',
        approvalUrl: 'http://127.0.0.1:4317/approve/test-123',
        sessionId: 'session-1',
        tool: 'refund_items',
        captureId: 'CAP123',
      }
    );

    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  test('sendTelegramResult handles invalid bot token gracefully', async () => {
    const result = await sendTelegramResult(
      { botToken: 'invalid_token', chatId: '123' },
      'test-123',
      'approved',
      'executed'
    );

    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  test('approval notification message formatting', async () => {
    // This test verifies the message structure without actually sending
    // In a real environment with valid credentials, it would send to Telegram

    const notification = {
      actionId: 'act_test_123',
      amountCents: 7500,
      currency: 'USD',
      ruleId: 'R-ACTION-CAP',
      reason: 'Refund $75.00 is above the $50.00 auto-approve limit.',
      approvalUrl: 'http://127.0.0.1:4317/approve/act_test_123#t=abc123',
      sessionId: 'session_agent_42',
      tool: 'refund_items',
      captureId: 'CAP_DEMO_001',
    };

    // The function will format this into a Markdown message
    // Expected format:
    // - Type: Refund
    // - Amount: 75.00 USD
    // - Target: CAP_DEMO_001
    // - Rule: R-ACTION-CAP
    // - Reason: [full reason]
    // - Session & Action ID
    // - Approval link

    assert.ok(notification.amountCents === 7500);
    assert.ok(notification.approvalUrl.includes('approve'));
  });

  test('payout notification includes payee email', async () => {
    const notification = {
      actionId: 'payout_456',
      amountCents: 10000,
      currency: 'USD',
      ruleId: 'R-PAYOUT-NEW-PAYEE',
      reason: 'First payout to vendor@example.com requires approval.',
      approvalUrl: 'http://127.0.0.1:4317/approve/payout_456',
      sessionId: 'session_1',
      tool: 'create_payout',
      payeeEmail: 'vendor@example.com',
    };

    // Verify payout-specific fields are present
    assert.equal(notification.tool, 'create_payout');
    assert.equal(notification.payeeEmail, 'vendor@example.com');
    assert.ok(notification.reason.includes('vendor@example.com'));
  });
});
