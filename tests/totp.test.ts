// Tests for TOTP (Time-Based One-Time Password) functionality
import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateTOTP, verifyTOTP, generateTOTPSecret } from '../server/totp.ts';

describe('TOTP generation and verification', () => {
  test('generateTOTPSecret creates valid base32 string', () => {
    const secret = generateTOTPSecret();
    assert.ok(secret.length > 0, 'Secret should not be empty');
    assert.match(secret, /^[A-Z2-7]+$/, 'Secret should be valid base32');
  });
  
  test('verifyTOTP accepts valid code', () => {
    const secret = 'JBSWY3DPEHPK3PXP'; // Known test secret
    const code = generateTOTP(secret, 0);
    assert.ok(verifyTOTP(code, secret), 'Should verify valid code');
  });
  
  test('verifyTOTP rejects invalid code', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    assert.ok(!verifyTOTP('000000', secret), 'Should reject invalid code');
    assert.ok(!verifyTOTP('abc123', secret), 'Should reject non-numeric code');
    assert.ok(!verifyTOTP('12345', secret), 'Should reject code with wrong length');
  });
  
  test('verifyTOTP accepts code from previous window', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const previousCode = generateTOTP(secret, -1);
    assert.ok(verifyTOTP(previousCode, secret, 1), 'Should accept code from previous 30s window');
  });
  
  test('verifyTOTP accepts code from next window', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const nextCode = generateTOTP(secret, 1);
    assert.ok(verifyTOTP(nextCode, secret, 1), 'Should accept code from next 30s window');
  });
  
  test('verifyTOTP with allowedWindow=0 only accepts exact time', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const currentCode = generateTOTP(secret, 0);
    const previousCode = generateTOTP(secret, -1);
    
    assert.ok(verifyTOTP(currentCode, secret, 0), 'Should accept current code');
    assert.ok(!verifyTOTP(previousCode, secret, 0), 'Should reject previous code with window=0');
  });
  
  test('generateTOTP produces consistent codes for same time', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const code1 = generateTOTP(secret, 0);
    const code2 = generateTOTP(secret, 0);
    assert.equal(code1, code2, 'Should generate same code for same time window');
  });
  
  test('generateTOTP produces 6-digit codes', () => {
    const secret = generateTOTPSecret();
    const code = generateTOTP(secret);
    assert.match(code, /^\d{6}$/, 'Code should be 6 digits');
  });
});
