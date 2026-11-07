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
}

export function mandateHash(mandate: Mandate): string {
  return createHash('sha256').update(JSON.stringify(mandate)).digest('hex');
}

export function saveMandateVersion(
  db: Db,
  mandate: Mandate,
  activatedBy?: string,
  notes?: string
): number {
  const mandateJson = JSON.stringify(mandate);
  const hash = mandateHash(mandate);
  const now = Date.now();

  // Check if this exact mandate already exists
  const existing = db.one<{ id: number }>(
    'SELECT id FROM mandate_versions WHERE hash=? ORDER BY id DESC LIMIT 1',
    hash
  );

  if (existing) {
    return existing.id;
  }

  db.run(
    'INSERT INTO mandate_versions(mandate_json, activated_at, activated_by, notes, hash) VALUES (?,?,?,?,?)',
    mandateJson,
    now,
    activatedBy ?? null,
    notes ?? null,
    hash
  );

  return db.val<number>('SELECT last_insert_rowid()')!;
}

export function getMandateVersion(db: Db, id: number): MandateVersion | null {
  const row = db.one<{
    id: number;
    mandate_json: string;
    activated_at: number;
    activated_by: string | null;
    notes: string | null;
    hash: string;
  }>('SELECT * FROM mandate_versions WHERE id=?', id);

  if (!row) return null;

  return {
    id: row.id,
    mandateJson: row.mandate_json,
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    notes: row.notes,
    hash: row.hash,
  };
}

export function getCurrentMandateVersion(db: Db): MandateVersion | null {
  const row = db.one<{
    id: number;
    mandate_json: string;
    activated_at: number;
    activated_by: string | null;
    notes: string | null;
    hash: string;
  }>('SELECT * FROM mandate_versions ORDER BY id DESC LIMIT 1');

  if (!row) return null;

  return {
    id: row.id,
    mandateJson: row.mandate_json,
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    notes: row.notes,
    hash: row.hash,
  };
}

export function listMandateVersions(db: Db, limit = 50): MandateVersion[] {
  const rows = db.all<{
    id: number;
    mandate_json: string;
    activated_at: number;
    activated_by: string | null;
    notes: string | null;
    hash: string;
  }>('SELECT * FROM mandate_versions ORDER BY id DESC LIMIT ?', limit);

  return rows.map(row => ({
    id: row.id,
    mandateJson: row.mandate_json,
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    notes: row.notes,
    hash: row.hash,
  }));
}

export function compareMandateVersions(
  db: Db,
  fromId: number,
  toId: number
): { from: Mandate | null; to: Mandate | null; changes: string[] } {
  const from = getMandateVersion(db, fromId);
  const to = getMandateVersion(db, toId);

  const fromMandate = from ? JSON.parse(from.mandateJson) as Mandate : null;
  const toMandate = to ? JSON.parse(to.mandateJson) as Mandate : null;

  const changes: string[] = [];

  if (!fromMandate || !toMandate) {
    return { from: fromMandate, to: toMandate, changes: ['One or both versions not found'] };
  }

  // Compare all mandate fields
  const fields: (keyof Mandate)[] = [
    'perActionCapCents',
    'hardMaxCents',
    'dailyCapCents',
    'hardDailyCapCents',
    'dupWindowMs',
    'escalateFullOrder',
    'returnWindowDays',
    'blockIfOpenDispute',
    'payoutPerPayeeCapCents',
    'payoutDailyCapCents',
    'payoutHardMaxCents',
    'payoutEscalateNewPayee',
  ];

  for (const field of fields) {
    if (fromMandate[field] !== toMandate[field]) {
      changes.push(`${field}: ${fromMandate[field]} → ${toMandate[field]}`);
    }
  }

  // Compare allowlist
  const fromAllowlist = fromMandate.payoutAllowlist ?? [];
  const toAllowlist = toMandate.payoutAllowlist ?? [];
  if (JSON.stringify(fromAllowlist) !== JSON.stringify(toAllowlist)) {
    changes.push(`payoutAllowlist: [${fromAllowlist.join(', ')}] → [${toAllowlist.join(', ')}]`);
  }

  return { from: fromMandate, to: toMandate, changes };
}
