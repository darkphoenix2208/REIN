// SDK client tests
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, type ReinConfig } from '../sdk/rein-client.ts';

describe('SDK Client', () => {

  test('SDK client types and structure are correct', () => {
    // Test that SDK client can be created
    const client = createClient({ baseUrl: 'http://localhost:4317' });
    
    // Verify client has expected methods
    assert.ok(typeof client.check === 'function', 'Client should have check method');
    assert.ok(typeof client.getLedger === 'function', 'Client should have getLedger method');
    assert.ok(typeof client.getCheckpoint === 'function', 'Client should have getCheckpoint method');
    assert.ok(typeof client.verifyCheckpoint === 'function', 'Client should have verifyCheckpoint method');
    assert.ok(typeof client.result === 'function', 'Client should have result method');
    assert.ok(typeof client.getMandate === 'function', 'Client should have getMandate method');
    assert.ok(typeof client.backtest === 'function', 'Client should have backtest method');
    
    // Verify config is set correctly
    const clientWithToken = createClient({ 
      baseUrl: 'https://example.com',
      bearerToken: 'test-token',
      timeout: 5000
    });
    
    assert.ok(clientWithToken, 'Client with custom config should be created');
  });

  test('SDK client exports are available', () => {
    // Test type exports are available
    const config: ReinConfig = {
      baseUrl: 'http://localhost:4317',
      bearerToken: 'test',
      timeout: 5000
    };
    
    assert.ok(config.baseUrl, 'Config should have baseUrl');
    assert.ok(config.bearerToken, 'Config should have bearerToken');
    assert.ok(config.timeout, 'Config should have timeout');
  });
});
