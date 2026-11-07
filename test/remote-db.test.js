'use strict';

// Simulate a Vercel deployment with Supabase storage available.
process.env.VERCEL = '1';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-key';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../src/storage');

let remote = null;
let downloads = 0;
let uploads = 0;

storage.downloadDb = async () => {
  downloads += 1;
  return remote ? JSON.parse(JSON.stringify(remote)) : null;
};
storage.uploadDb = async (json) => {
  uploads += 1;
  remote = JSON.parse(json);
};

const db = require('../src/db');

test('remote mode seeds the bucket on first boot', async () => {
  await db.ensureReady();
  assert.equal(uploads, 1);
  assert.equal(db.status().mode, 'remote');
  assert.ok(db.read().products.length > 0);
});

test('saves are written to storage and visible after a refresh', async () => {
  const before = db.read().products.length;
  db.read().products.unshift({ id: 'p_test', name: 'Number fix', slug: 'number-fix', price: 12500 });
  await db.save();
  assert.equal(remote.products[0].id, 'p_test');

  // A different instance holds a stale copy; an explicit refresh must see
  // the saved row (this is what made admin edits appear to revert).
  remote.products.push({ id: 'p_other', name: 'Other instance', slug: 'other-instance', price: 100 });
  await db.ensureReady({ refresh: true });
  assert.equal(db.read().products.length, before + 2);
  assert.ok(db.read().products.some((p) => p.id === 'p_other'));
});

test('a legacy remote catalogue is migrated and persisted without losing non-suit stock', async () => {
  delete remote.catalogVersion;
  remote.categories = [{ slug: 'pret', name: 'Luxe Pret', order: 0 }];
  remote.products.push({ id: 'p_legacy_accessory', slug: 'legacy-accessory', name: 'Legacy accessory', category: 'accessories', pieces: 'Pair', stock: 3, price: 100 });
  const before = uploads;
  await db.ensureReady({ refresh: true });
  assert.equal(remote.catalogVersion, 2);
  assert.deepEqual(remote.categories.map((c) => c.slug), ['2-piece-suits', '3-piece-suits']);
  assert.equal(remote.products.find((p) => p.id === 'p_legacy_accessory').stock, 3);
  assert.equal(remote.products.find((p) => p.id === 'p_legacy_accessory').needsCategory, true);
  assert.ok(uploads > before, 'migration is written back to shared storage');
  const afterMigration = uploads;
  await db.ensureReady({ refresh: true });
  assert.equal(uploads, afterMigration, 'a migrated catalogue is not rewritten on every refresh');
});

test('a storage failure never overwrites the real database with demo data', async () => {
  const snapshot = JSON.parse(JSON.stringify(remote));
  const originalDownload = storage.downloadDb;
  storage.downloadDb = async () => {
    throw new Error('bucket unreachable');
  };
  try {
    await assert.rejects(() => db.ensureReady({ refresh: true, throwOnError: true }), /bucket unreachable/);
    assert.throws(() => db.save(), /not saved|unavailable/i);
    assert.deepEqual(remote, snapshot, 'remote database must be untouched');
    assert.equal(db.status().lastError, 'bucket unreachable');
    // Reads keep serving the demo catalogue so the storefront is not blank.
    assert.ok(db.read().products.length > 0);
  } finally {
    storage.downloadDb = originalDownload;
  }
});
