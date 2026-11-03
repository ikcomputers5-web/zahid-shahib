'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const FIREBASE_ENV = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_MEASUREMENT_ID',
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_SERVICE_ACCOUNT_PATH',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'ADMIN_EMAILS',
  'FIREBASE_ALLOW_INSECURE_DECODE'
];

const saved = {};
beforeEach(() => {
  for (const key of FIREBASE_ENV) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});
afterEach(() => {
  for (const key of FIREBASE_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const firebase = require('../src/firebase');

/** Build an unsigned JWT-shaped string (payload only matters for decoding). */
function fakeToken(payload) {
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: 'uid-1', email: 'a@b.c', ...payload })}.sig`;
}

test('service-account JSON is parsed with escaped newlines repaired', () => {
  const account = firebase.parseServiceAccount(
    '{"type":"service_account","project_id":"demo","private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"}'
  );
  assert.equal(account.project_id, 'demo');
  assert.match(account.private_key, /^-----BEGIN PRIVATE KEY-----\nabc\n/);
  assert.ok(!account.private_key.includes('\\n'));
});

test('service account can be supplied as base64 JSON', () => {
  const json = JSON.stringify({ project_id: 'demo', private_key: 'line1\\nline2' });
  const account = firebase.parseServiceAccount(Buffer.from(json).toString('base64'));
  assert.equal(account.project_id, 'demo');
  assert.equal(account.private_key, 'line1\nline2');
});

test('client config is only reported when API key and project id exist', () => {
  assert.equal(firebase.getClientConfig(), null);
  process.env.FIREBASE_API_KEY = 'AIza-demo';
  process.env.FIREBASE_PROJECT_ID = 'zahid-shareef';
  const config = firebase.getClientConfig();
  assert.equal(config.projectId, 'zahid-shareef');
  assert.equal(config.authDomain, 'zahid-shareef.firebaseapp.com');
  assert.equal(firebase.isFirebaseEnabled(), true);
});

test('diagnostics explain what is missing instead of failing', () => {
  const report = firebase.diagnostics();
  assert.equal(report.clientConfigured, false);
  assert.equal(report.adminConfigured, false);
  assert.ok(report.errors.length > 0);
  assert.match(report.errors.join(' '), /FIREBASE_API_KEY/);
});

test('an unverified token is rejected in production', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(() => firebase.verifyIdToken(fakeToken({})), /Firebase Admin/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('unverified decode is possible only when explicitly opted into for dev', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  process.env.FIREBASE_ALLOW_INSECURE_DECODE = '1';
  try {
    const decoded = await firebase.verifyIdToken(fakeToken({}));
    assert.equal(decoded.uid, 'uid-1');
    assert.equal(decoded.email, 'a@b.c');
    assert.equal(decoded.verified, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('admin allow-list matches case-insensitively', () => {
  assert.equal(firebase.isAdminEmail('anyone@example.com'), true); // open when unset
  process.env.ADMIN_EMAILS = 'Owner@Example.com, second@example.com';
  assert.equal(firebase.isAdminEmail('owner@example.com'), true);
  assert.equal(firebase.isAdminEmail('other@example.com'), false);
});

test('diagnostics flag a service account from a different Firebase project', () => {
  process.env.FIREBASE_API_KEY = 'AIza-demo';
  process.env.FIREBASE_PROJECT_ID = 'zahid-shareef';
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    type: 'service_account',
    project_id: 'some-other-project',
    client_email: 'admin@some-other-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
  });
  const report = firebase.diagnostics();
  assert.equal(report.serviceAccount.projectId, 'some-other-project');
  assert.equal(report.serviceAccount.hasPrivateKey, true);
  assert.match(report.errors.join(' '), /belongs to project "some-other-project"/);
});
