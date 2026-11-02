'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Verify startup without allowing any writes to the deployment directory.
process.env.VERCEL = '1';
const originalMkdir = fs.mkdirSync;
const originalWrite = fs.writeFileSync;
fs.mkdirSync = () => { throw new Error('read-only filesystem'); };
fs.writeFileSync = () => { throw new Error('read-only filesystem'); };
const app = require('../server');
fs.mkdirSync = originalMkdir;
fs.writeFileSync = originalWrite;
const server = app.listen(0, '127.0.0.1');
after(() => server.close());

async function request(url, options) {
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  return fetch(`http://127.0.0.1:${server.address().port}${url}`, options);
}

test('serverless storefront and client routes load without a writable database', async () => {
  for (const url of ['/', '/shop', '/admin', '/css/styles.css']) {
    const res = await request(url);
    assert.equal(res.status, 200, url);
    assert.ok((await res.text()).length > 100, url);
  }
  const res = await request('/api/bootstrap');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.readOnly, true);
  assert.ok(data.products.length > 0);
  assert.equal(data.settings.adminPasswordHash, undefined);
});

test('serverless mutations are rejected rather than silently lost', async () => {
  for (const url of ['/api/orders', '/api/contact', '/api/subscribe', '/api/admin/login', '/api/admin/upload']) {
    const res = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 503, url);
    assert.match((await res.json()).error, /preview mode/);
  }
  const promo = await request('/api/promo/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'invalid', subtotal: 1000 }) });
  assert.equal(promo.status, 400);
});

test('local database still persists and repairs corrupt JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ismail-db-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    for (const name of ['db.js', 'seed.js']) fs.copyFileSync(path.join(__dirname, '..', 'src', name), path.join(dir, 'src', name));
    const env = { ...process.env };
    delete env.VERCEL;
    const run = (script) => execFileSync(process.execPath, ['-e', script], { cwd: dir, env });
    run("const db = require('./src/db'); db.read().visits = 42; db.save();");
    const dbFile = path.join(dir, 'data', 'db.json');
    assert.equal(JSON.parse(fs.readFileSync(dbFile)).visits, 42);
    fs.writeFileSync(dbFile, 'not json');
    run("const db = require('./src/db'); if (!db.read().products.length) process.exit(1);");
    assert.ok(JSON.parse(fs.readFileSync(dbFile)).products.length > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
