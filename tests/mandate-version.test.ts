// Mandate versioning tests
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.ts';
import { applySchema } from '../server/schema.ts';
import {
  saveMandateVersion,
  getMandateVersion,
  getCurrentMandateVersion,
  listMandateVersions,
  compareMandateVersions,
} from '../server/mandate-version.ts';
import type { Mandate } from '../server/types.ts';

const tempDb = async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rein-test-')), 't.db');
  const db = await openDb(path);
  applySchema(db);
  return { db, close: () => db.close() };
};

const baseMandate: Mandate = {
  perActionCapCents: 5000,
  hardMaxCents: 10000,
  dailyCapCents: 20000,
  hardDailyCapCents: 40000,
  expiresAt: Date.now() + 86400000,
};

describe('Mandate versioning', () => {
  test('saveMandateVersion stores a new version and returns ID', async () => {
    const { db, close } = await tempDb();

    const id = saveMandateVersion(db, baseMandate, 'admin', 'Initial mandate');

    assert.ok(id > 0, 'Should return a positive ID');

    const version = getMandateVersion(db, id);
    assert.ok(version, 'Should retrieve the saved version');
    assert.equal(version!.id, id);
    assert.equal(version!.activatedBy, 'admin');
    assert.equal(version!.notes, 'Initial mandate');

    const mandate = JSON.parse(version!.mandateJson) as Mandate;
    assert.equal(mandate.perActionCapCents, 5000);
    assert.equal(mandate.hardMaxCents, 10000);

    close();
  });

  test('saveMandateVersion deduplicates identical mandates by hash', async () => {
    const { db, close } = await tempDb();

    const id1 = saveMandateVersion(db, baseMandate, 'admin', 'First');
    const id2 = saveMandateVersion(db, baseMandate, 'admin', 'Second attempt');

    assert.equal(id1, id2, 'Should return same ID for identical mandate');

    const versions = listMandateVersions(db);
    assert.equal(versions.length, 1, 'Should only have one version stored');

    close();
  });

  test('getCurrentMandateVersion returns the latest version', async () => {
    const { db, close } = await tempDb();

    saveMandateVersion(db, baseMandate, 'admin', 'V1');

    const updated = { ...baseMandate, perActionCapCents: 7500 };
    const id2 = saveMandateVersion(db, updated, 'admin', 'V2');

    const current = getCurrentMandateVersion(db);
    assert.ok(current);
    assert.equal(current!.id, id2);
    assert.equal(current!.notes, 'V2');

    const mandate = JSON.parse(current!.mandateJson) as Mandate;
    assert.equal(mandate.perActionCapCents, 7500);

    close();
  });

  test('listMandateVersions returns versions in reverse chronological order', async () => {
    const { db, close } = await tempDb();

    saveMandateVersion(db, baseMandate, 'admin', 'V1');
    saveMandateVersion(db, { ...baseMandate, perActionCapCents: 6000 }, 'admin', 'V2');
    saveMandateVersion(db, { ...baseMandate, perActionCapCents: 7000 }, 'admin', 'V3');

    const versions = listMandateVersions(db);
    assert.equal(versions.length, 3);
    assert.equal(versions[0].notes, 'V3', 'Latest should be first');
    assert.equal(versions[1].notes, 'V2');
    assert.equal(versions[2].notes, 'V1');

    close();
  });

  test('compareMandateVersions detects changes between versions', async () => {
    const { db, close } = await tempDb();

    const id1 = saveMandateVersion(db, baseMandate, 'admin', 'V1');
    const updated = {
      ...baseMandate,
      perActionCapCents: 7500,
      hardMaxCents: 15000,
      payoutAllowlist: ['vendor@example.com'],
    };
    const id2 = saveMandateVersion(db, updated, 'admin', 'V2');

    const comparison = compareMandateVersions(db, id1, id2);

    assert.ok(comparison.from);
    assert.ok(comparison.to);
    assert.equal(comparison.changes.length, 3);
    assert.ok(comparison.changes.some(c => c.includes('perActionCapCents: 5000 → 7500')));
    assert.ok(comparison.changes.some(c => c.includes('hardMaxCents: 10000 → 15000')));
    assert.ok(comparison.changes.some(c => c.includes('payoutAllowlist')));

    close();
  });

  test('mandate version hash is deterministic and detects changes', async () => {
    const { db, close } = await tempDb();

    const id1 = saveMandateVersion(db, baseMandate);
    const v1 = getMandateVersion(db, id1)!;

    const id2 = saveMandateVersion(db, baseMandate);
    const v2 = getMandateVersion(db, id2)!;

    assert.equal(v1.hash, v2.hash, 'Same mandate should have same hash');

    const modified = { ...baseMandate, perActionCapCents: 5001 };
    const id3 = saveMandateVersion(db, modified);
    const v3 = getMandateVersion(db, id3)!;

    assert.notEqual(v1.hash, v3.hash, 'Modified mandate should have different hash');

    close();
  });
});
