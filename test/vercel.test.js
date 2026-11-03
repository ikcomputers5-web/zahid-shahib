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

test('health endpoint reports deployment mode without leaking secrets', async () => {
  const res = await request('/api/health');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.database.mode, 'preview');
  assert.equal(data.database.readOnly, true);
  assert.equal(typeof data.firebase.clientConfigured, 'boolean');
  assert.ok(Array.isArray(data.problems));
  const text = JSON.stringify(data);
  assert.ok(!/AIza|BEGIN PRIVATE KEY|service_account/.test(text));
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
    fs.cpSync(path.join(__dirname, '..', 'src'), path.join(dir, 'src'), { recursive: true });
    const env = {
      ...process.env,
      NODE_PATH: path.join(__dirname, '..', 'node_modules')
    };
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

test('on Vercel, Supabase env vars switch the store from read-only preview to durable remote mode', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const run = (env) =>
    execFileSync(process.execPath, ['-e', "const db = require('./src/db'); console.log(db.READ_ONLY, db.REMOTE);"], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_PATH: path.join(__dirname, '..', 'node_modules'), ...env }
    }).toString().trim();
  // Serverless without a durable backend: read-only preview (this process env).
  assert.equal(run({ VERCEL: '1', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '' }), 'true false');
  // Serverless with Supabase configured: writes go to the remote database.
  assert.equal(run({ VERCEL: '1', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' }), 'false true');
  // Persistent host: always writable, even if Supabase vars are absent.
  assert.equal(run({ VERCEL: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '' }), 'false false');
  assert.ok(srcDir);
});

test('admin sessions are stateless signed tokens that survive instances and reject tampering', () => {
  const auth = require('../src/auth');
  const token = auth.issueSession();
  assert.ok(auth.sessionValid(token), 'fresh token is valid');
  assert.equal(auth.sessionValid(token + 'x'), false, 'tampered signature rejected');
  assert.equal(auth.sessionValid('not-a-token'), false);
  const [payload] = token.split('.');
  const forged = `${Buffer.from(JSON.stringify({ exp: Date.now() + 999999 })).toString('base64url')}.${payload.split('.')[1]}`;
  assert.equal(auth.sessionValid(forged), false, 'forged payload rejected');
  // A token signed with a different secret (e.g. after a password change) is invalid.
  process.env.SESSION_SECRET = 'other-secret';
  try {
    assert.equal(auth.sessionValid(token), false, 'token from another secret rejected');
    assert.ok(auth.sessionValid(auth.issueSession()), 'new token valid under current secret');
  } finally {
    delete process.env.SESSION_SECRET;
  }
  assert.ok(auth.sessionValid(token), 'original secret restored, token valid again');
});
