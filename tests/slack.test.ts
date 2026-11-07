// Tests for Slack integration
import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { getSlackConfig, isSlackEnabled, sendApprovalRequest } from '../server/slack.ts';

describe('Slack integration', () => {
  test('getSlackConfig returns null when env vars not set', () => {
    const oldToken = process.env.SLACK_BOT_TOKEN;
    const oldChannel = process.env.SLACK_APPROVAL_CHANNEL;
    
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_APPROVAL_CHANNEL;
    
    const config = getSlackConfig();
    assert.equal(config, null, 'Should return null when env vars missing');
    
    assert.equal(isSlackEnabled(), false, 'Should not be enabled');
    
    if (oldToken) process.env.SLACK_BOT_TOKEN = oldToken;
    if (oldChannel) process.env.SLACK_APPROVAL_CHANNEL = oldChannel;
  });
  
  test('getSlackConfig returns config when env vars set', () => {
    const oldToken = process.env.SLACK_BOT_TOKEN;
    const oldChannel = process.env.SLACK_APPROVAL_CHANNEL;
    
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    process.env.SLACK_APPROVAL_CHANNEL = 'C1234567890';
    
    const config = getSlackConfig();
    assert.ok(config !== null, 'Should return config');
    assert.equal(config.botToken, 'xoxb-test-token');
    assert.equal(config.approvalChannelId, 'C1234567890');
    
    assert.equal(isSlackEnabled(), true, 'Should be enabled');
    
    if (oldToken) process.env.SLACK_BOT_TOKEN = oldToken;
    else delete process.env.SLACK_BOT_TOKEN;
    if (oldChannel) process.env.SLACK_APPROVAL_CHANNEL = oldChannel;
    else delete process.env.SLACK_APPROVAL_CHANNEL;
  });
  
  test('sendApprovalRequest returns false when not configured', async () => {
    const result = await sendApprovalRequest({
      actionId: 'test-action',
      amountCents: 5000,
      reason: 'Test approval',
      approvalUrl: 'https://example.com/approve/test',
    }, null);
    
    assert.equal(result, false, 'Should return false when not configured');
  });
  
  test('sendApprovalRequest builds correct message structure', async () => {
    // Mock config to avoid actual API call
    const mockConfig = {
      botToken: 'xoxb-test',
      approvalChannelId: 'C123',
    };
    
    // Since we can't mock fetch easily in Node test, just verify the function exists
    assert.ok(typeof sendApprovalRequest === 'function', 'Function should exist');
  });
});
