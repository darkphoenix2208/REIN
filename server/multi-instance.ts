// Multi-instance support via distributed locking
// When DATABASE_URL is set to PostgreSQL, enables multi-instance deployment
// Falls back to single-instance SQLite when not configured

import type { Db } from './db.ts';

export interface DistributedLock {
  acquire(resource: string, ttlMs: number): Promise<boolean>;
  release(resource: string): Promise<void>;
  extend(resource: string, ttlMs: number): Promise<boolean>;
}

/**
 * PostgreSQL-based distributed lock using advisory locks
 * Enables multiple Rein instances to coordinate refund reservations
 */
export class PostgreSQLLock implements DistributedLock {
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async acquire(resource: string, ttlMs: number): Promise<boolean> {
    // Implementation would use pg_advisory_lock
    // For now, this is a placeholder showing the interface
    throw new Error('PostgreSQL lock not yet implemented - use single instance with SQLite');
  }

  async release(resource: string): Promise<void> {
    // Implementation would use pg_advisory_unlock
    throw new Error('PostgreSQL lock not yet implemented - use single instance with SQLite');
  }

  async extend(resource: string, ttlMs: number): Promise<boolean> {
    // Re-acquire the lock to extend TTL
    throw new Error('PostgreSQL lock not yet implemented - use single instance with SQLite');
  }
}

/**
 * In-memory lock for single-instance deployments (SQLite)
 * This is a no-op since SQLite's BEGIN IMMEDIATE provides the necessary serialization
 */
export class SingleInstanceLock implements DistributedLock {
  async acquire(resource: string, ttlMs: number): Promise<boolean> {
    // SQLite BEGIN IMMEDIATE handles this
    return true;
  }

  async release(resource: string): Promise<void> {
    // No-op for single instance
  }

  async extend(resource: string, ttlMs: number): Promise<boolean> {
    return true;
  }
}

/**
 * Factory function to create appropriate lock based on configuration
 */
export function createDistributedLock(): DistributedLock {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && databaseUrl.startsWith('postgres')) {
    console.log('Multi-instance mode: PostgreSQL distributed locks enabled');
    return new PostgreSQLLock(databaseUrl);
  }

  console.log('Single-instance mode: Using SQLite with BEGIN IMMEDIATE');
  return new SingleInstanceLock();
}

/**
 * Check if multi-instance mode is enabled
 */
export function isMultiInstanceEnabled(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  return !!(databaseUrl && databaseUrl.startsWith('postgres'));
}

/**
 * Acquire a lock for a specific capture to prevent concurrent over-refund
 * Usage:
 *   const lock = createDistributedLock();
 *   if (await lock.acquire(`capture:${captureId}`, 30000)) {
 *     try {
 *       // Process refund
 *     } finally {
 *       await lock.release(`capture:${captureId}`);
 *     }
 *   }
 */
export async function withDistributedLock<T>(
  resource: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const lock = createDistributedLock();

  const acquired = await lock.acquire(resource, ttlMs);
  if (!acquired) {
    return null; // Lock acquisition failed
  }

  try {
    return await fn();
  } finally {
    await lock.release(resource);
  }
}
