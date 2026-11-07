// Mandate versioning: track policy changes over time in the ledger
import { createHash } from 'node:crypto';
import type { Db } from './db.ts';
import type { Mandate } from './types.ts';

export interface MandateVersion {
  id: number;
  mandateJson: string;
  activatedAt: number;
  activatedBy: string | null;
  notes: string | null;
  hash: string;
  effectiveFrom?: number | null;
  effectiveTo?: number | null;
  approver?: string | null;
}

export function mandateHash(mandate: Mandate): string {
  return createHash('sha256').update(JSON.stringify(mandate)).digest('hex');
}

export function saveMandateVersion(
  db: Db,
  mandate: Mandate,
  activatedBy?: string,
  notes?: string,
  options?: { effectiveFrom?: number; effectiveTo?: number; approver?: string }
): number {
  const mandateJson = JSON.stringify(mandate);
  const hash = mandateHash(mandate);
  const now = Date.now();
  const approver = options?.approver ?? activatedBy ?? null;

  // Check if this exact mandate already exists
  const existing = db.one<{ id: number }>(
    'SELECT id FROM mandate_versions WHERE hash=? ORDER BY id DESC LIMIT 1',
    hash
  );

  if (existing) {
    return existing.id;
  }

  db.run(
    'INSERT INTO mandate_versions(mandate_json, activated_at, activated_by, notes, hash, effective_from, effective_to, approver) VALUES (?,?,?,?,?,?,?,?)',
    mandateJson,
    now,
    activatedBy ?? null,
    notes ?? null,
    hash,
    options?.effectiveFrom ?? null,
    options?.effectiveTo ?? null,
    approver
  );

  return db.val<number>('SELECT last_insert_rowid()')!;
}

export function getMandateVersion(db: Db, id: number): MandateVersion | null {
  const row = db.one<any>('SELECT * FROM mandate_versions WHERE id=?', id);

  if (!row) return null;

  return {
    id: row.id,
    mandateJson: row.mandate_json,
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    notes: row.notes,
    hash: row.hash,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    approver: row.approver,
  };
}

export function getCurrentMandateVersion(db: Db): MandateVersion | null {
  const row = db.one<any>('SELECT * FROM mandate_versions ORDER BY id DESC LIMIT 1');

  if (!row) return null;

  return {
    id: row.id,
    mandateJson: row.mandate_json,
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    notes: row.notes,
    hash: row.hash,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    approver: row.approver,
  };
}

export function listMandateVersions(db: Db, limit = 50): MandateVersion[] {
  const rows = db.all<any>(
    'SELECT * FROM mandate_versions ORDER BY id DESC LIMIT ?',
    limit
  );

  return rows.map((row) => ({
    id: row.id,
    mandateJson: row.mandate_json,
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    notes: row.notes,
    hash: row.hash,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    approver: row.approver,
  }));
}

export function compareMandateVersions(
  db: Db,
  fromId: number,
  toId: number
): { from: MandateVersion | null; to: MandateVersion | null; changes: string[] } {
  const from = getMandateVersion(db, fromId);
  const to = getMandateVersion(db, toId);
  const changes: string[] = [];

  if (!from || !to) {
    return { from, to, changes };
  }

  const mFrom = JSON.parse(from.mandateJson);
  const mTo = JSON.parse(to.mandateJson);

  const allKeys = Array.from(new Set([...Object.keys(mFrom), ...Object.keys(mTo)]));
  for (const k of allKeys) {
    const valFrom = mFrom[k];
    const valTo = mTo[k];
    if (JSON.stringify(valFrom) !== JSON.stringify(valTo)) {
      changes.push(`${k}: ${JSON.stringify(valFrom ?? 'unset')} → ${JSON.stringify(valTo ?? 'unset')}`);
    }
  }

  return { from, to, changes };
}

export function getActiveMandateForAction(db: Db, timestamp: number): MandateVersion | null {
  const row = db.one<any>(
    'SELECT * FROM mandate_versions WHERE activated_at <= ? ORDER BY activated_at DESC LIMIT 1',
    timestamp
  );

  if (!row) {
    return getCurrentMandateVersion(db);
  }

  return {
    id: row.id,
    mandateJson: row.mandate_json,
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    notes: row.notes,
    hash: row.hash,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    approver: row.approver,
  };
}
