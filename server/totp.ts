// TOTP (Time-Based One-Time Password) verification using standard TOTP algorithm (RFC 6238)
import { createHmac } from 'node:crypto';

/**
 * Generate a TOTP code for the given secret and timestamp
 * @param secret Base32-encoded secret (like Google Authenticator)
 * @param timeWindow Time window in 30-second intervals (0 = current, -1 = previous, +1 = next)
 */
export function generateTOTP(secret: string, timeWindow = 0): string {
  const epoch = Math.floor(Date.now() / 1000);
  const time = Math.floor(epoch / 30) + timeWindow;
  
  // Convert time to 8-byte buffer
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(time));
  
  // Decode base32 secret (simplified - assumes uppercase alphanumeric only)
  const key = base32Decode(secret);
  
  // HMAC-SHA1
  const hmac = createHmac('sha1', key);
  hmac.update(buffer);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1]! & 0x0f;
  const code = (
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff)
  ) % 1000000;
  
  return String(code).padStart(6, '0');
}

/**
 * Verify a TOTP code against a secret
 * @param code 6-digit TOTP code from user
 * @param secret Base32-encoded secret
 * @param allowedWindow Number of time windows to check (0 = exact, 1 = ±30s, 2 = ±60s)
 */
export function verifyTOTP(code: string, secret: string, allowedWindow = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  
  for (let i = -allowedWindow; i <= allowedWindow; i++) {
    if (generateTOTP(secret, i) === code) return true;
  }
  
  return false;
}

/**
 * Simplified base32 decoder (uppercase A-Z, 2-7)
 */
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  
  for (const char of base32.toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue; // Skip padding and invalid chars
    
    buffer = (buffer << 5) | val;
    bitsInBuffer += 5;
    
    if (bitsInBuffer >= 8) {
      bytes.push((buffer >> (bitsInBuffer - 8)) & 0xff);
      bitsInBuffer -= 8;
    }
  }
  
  return Buffer.from(bytes);
}

/**
 * Generate a random base32 secret for TOTP
 */
export function generateTOTPSecret(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = Buffer.alloc(20); // 160 bits
  for (let i = 0; i < 20; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  
  let result = '';
  let buffer = 0;
  let bitsInBuffer = 0;
  
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;
    
    while (bitsInBuffer >= 5) {
      const index = (buffer >> (bitsInBuffer - 5)) & 0x1f;
      result += alphabet[index];
      bitsInBuffer -= 5;
    }
  }
  
  if (bitsInBuffer > 0) {
    const index = (buffer << (5 - bitsInBuffer)) & 0x1f;
    result += alphabet[index];
  }
  
  return result;
}
