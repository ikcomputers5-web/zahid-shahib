'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SUIT_CATEGORIES, suitCategory, categoryForProduct, migrateCatalog, isPublishedProduct } = require('../src/catalog');
const { buildSeed } = require('../src/seed');

const ROOT = path.join(__dirname, '..');

test('the demo catalogue has exactly the two suit categories', () => {
  const db = buildSeed();
  assert.deepEqual(db.categories.map((c) => c.slug), ['2-piece-suits', '3-piece-suits']);
  assert.equal(db.catalogVersion, 2);
  assert.ok(db.products.length > 0);
  for (const product of db.products) {
    assert.ok(isPublishedProduct(product));
    assert.equal(product.category, `${product.pieces.charAt(0)}-piece-suits`);
  }
  for (const slide of db.settings.heroSlides) {
    const category = new URL(slide.ctaHref, 'https://store.local').searchParams.get('category');
    if (category) assert.ok(SUIT_CATEGORIES.some((c) => c.slug === category));
  }
});

test('legacy links and piece counts resolve to the new categories', () => {
  assert.equal(suitCategory('pret'), '2-piece-suits');
  assert.equal(suitCategory('bridal'), '3-piece-suits');
  assert.equal(suitCategory('2 piece suits'), '2-piece-suits');
  assert.equal(suitCategory('accessories'), '');
  assert.equal(categoryForProduct({ category: 'unstitched', pieces: '2 Piece Unstitched' }), '2-piece-suits');
  assert.equal(categoryForProduct({ category: 'accessories', pieces: 'Pair' }), '');
});

test('migration preserves stock, orders and credentials and runs only once', () => {
  const db = buildSeed();
  delete db.catalogVersion;
  db.products.forEach((p, i) => { p.category = i % 2 ? 'pret' : 'lawn'; });
  const accessory = { id: 'p_accessory', slug: 'old-accessory', name: 'Old accessory', category: 'accessories', pieces: 'Pair', stock: 7, price: 5000 };
  db.products.push(accessory);
  db.orders = [{ id: 'ord_existing', number: 'IE-123456', total: 5000 }];
  const credentials = { salt: db.settings.adminPasswordSalt, hash: db.settings.adminPasswordHash };
  const snapshot = JSON.stringify({ orders: db.orders, stock: db.products.map((p) => p.stock), credentials });
  assert.equal(migrateCatalog(db), true);
  assert.equal(db.products.length, 19);
  assert.equal(db.products.find((p) => p.id === accessory.id).stock, 7);
  assert.equal(db.products.find((p) => p.id === accessory.id).needsCategory, true);
  assert.equal(isPublishedProduct(db.products.find((p) => p.id === accessory.id)), false);
  assert.equal(JSON.stringify({ orders: db.orders, stock: db.products.map((p) => p.stock), credentials: { salt: db.settings.adminPasswordSalt, hash: db.settings.adminPasswordHash } }), snapshot);
  const migrated = JSON.stringify(db);
  assert.equal(migrateCatalog(db), false);
  assert.equal(JSON.stringify(db), migrated);
});

test('local boot persists the catalogue migration without reseeding real data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ismail-catalog-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'data'));
    const old = buildSeed();
    delete old.catalogVersion;
    old.visits = 99;
    old.settings.storeName = 'Owner store';
    old.orders = [{ id: 'ord_keep', number: 'IE-111111' }];
    old.products.push({ id: 'p_keep', slug: 'old-jhumka', name: 'Old jhumka', category: 'accessories', pieces: 'Pair', stock: 4, price: 100 });
    fs.writeFileSync(path.join(dir, 'data/db.json'), JSON.stringify(old));
    const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') };
    delete env.VERCEL;
    execFileSync(process.execPath, ['-e', "const db = require('./src/db'); db.read(); db.persistCredentialsIfChanged();"], { cwd: dir, env });
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'data/db.json')));
    assert.equal(stored.catalogVersion, 2);
    assert.equal(stored.visits, 99);
    assert.equal(stored.settings.storeName, 'Owner store');
    assert.equal(stored.orders[0].id, 'ord_keep');
    assert.equal(stored.products.find((p) => p.id === 'p_keep').stock, 4);
    assert.deepEqual(stored.categories.map((c) => c.slug), ['2-piece-suits', '3-piece-suits']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('admin product writes normalise aliases, reject unknown categories and keep piece counts in sync', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ismail-admin-catalog-'));
  try {
    fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'public'), path.join(dir, 'public'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'server.js'), path.join(dir, 'server.js'));
    const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules'), ADMIN_PASSWORD: 'CatalogTest#123', ADMIN_EMAIL: 'owner@example.com' };
    delete env.VERCEL;
    const script = `
      const app = require('./server');
      const server = app.listen(0, '127.0.0.1', async () => {
        const base = 'http://127.0.0.1:' + server.address().port;
        const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', password: 'CatalogTest#123' }) });
        const cookie = login.headers.get('set-cookie').split(';')[0];
        const post = (body) => fetch(base + '/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
        const bad = await post({ name: 'Bad suit', price: 100, images: ['/images/products/pret-amal.jpg'], category: 'bridal' });
        const unknown = await post({ name: 'Unknown', price: 100, images: ['/images/products/pret-amal.jpg'], category: 'shoes' });
        const good = await post({ name: 'Good suit', price: 100, images: ['/images/products/pret-amal.jpg'], category: '3-piece-suits', pieces: '2 Piece Unstitched', isNew: true });
        const boot = await (await fetch(base + '/api/bootstrap')).json();
        const filtered = await (await fetch(base + '/api/products?category=2-piece-suits')).json();
        const arrivals = await (await fetch(base + '/api/products?new=1&sort=newest')).json();
        server.close();
        console.log(JSON.stringify({ bad: bad.status, unknown: unknown.status, good: await good.json(), categories: boot.categories, filtered: filtered.products, arrivals: arrivals.products }));
      });
    `;
    const out = execFileSync(process.execPath, ['-e', script], { cwd: dir, env }).toString();
    const result = JSON.parse(out.trim().split('\n').pop());
    // Legacy category names are accepted only as aliases and normalised immediately.
    assert.equal(result.bad, 201);
    assert.equal(result.unknown, 400);
    assert.equal(result.good.product.category, '3-piece-suits');
    assert.equal(result.good.product.pieces, '3 Piece Unstitched');
    assert.deepEqual(result.categories.map((c) => c.slug), ['2-piece-suits', '3-piece-suits']);
    assert.ok(result.filtered.every((p) => p.category === '2-piece-suits'));
    assert.equal(result.arrivals[0].id, result.good.product.id);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('browser arrivals helper is curated, newest-first and limited to suit categories', async () => {
  const { newArrivals, shopCategories } = await import('../public/js/catalog.js');
  const products = [
    { id: 'old', isNew: true, category: '2-piece-suits', createdAt: '2026-01-01' },
    { id: 'new', isNew: true, category: '3-piece-suits', createdAt: '2026-02-01' },
    { id: 'not-new', isNew: false, category: '2-piece-suits', createdAt: '2026-03-01' },
    { id: 'accessory', isNew: true, category: 'accessories', createdAt: '2026-04-01' }
  ];
  assert.deepEqual(newArrivals(products).map((p) => p.id), ['new', 'old']);
  assert.deepEqual(shopCategories([]).map((c) => c.name), ['2 Piece Suits', '3 Piece Suits']);
});
