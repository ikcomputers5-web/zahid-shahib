'use strict';

const fs = require('fs');
const path = require('path');
const { buildSeed } = require('./seed');
const storage = require('./storage');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
// Vercel's deployment filesystem is read-only, and /tmp is not durable or
// shared between instances. There we need Supabase for durable storage
// (REMOTE); without it we fall back to a read-only preview seeded from the
// demo catalogue (READ_ONLY). On any persistent host the JSON file is used.
const REMOTE = Boolean(process.env.VERCEL) && storage.isSupabaseEnabled();
const READ_ONLY = Boolean(process.env.VERCEL) && !REMOTE;

let cache = null;
let writeTimer = null;
let writeQueue = Promise.resolve();
let readyPromise = null;

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(buildSeed(), null, 2));
  }
}

async function loadRemote() {
  const remote = await storage.downloadDb();
  cache = remote ? migrate(remote) : migrate(buildSeed());
  if (!remote) {
    // First boot on a serverless host: seed the bucket so later instances
    // and the admin panel all read the same data.
    await storage.uploadDb(JSON.stringify(cache, null, 2));
  }
}

/** Loads the database when running on a serverless host. Resolves immediately otherwise. */
function ensureReady() {
  if (!REMOTE) {
    read();
    return Promise.resolve();
  }
  if (!readyPromise) {
    readyPromise = loadRemote().catch((err) => {
      console.error('[db] remote load failed, falling back to seed:', err.message);
      cache = cache || buildSeed();
    });
  }
  return readyPromise;
}

function migrate(db) {
  // Ensure new collections exist on older databases
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.adminUsers)) db.adminUsers = [];
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.messages)) db.messages = [];
  if (!Array.isArray(db.subscribers)) db.subscribers = [];
  if (!Array.isArray(db.dropAlerts)) db.dropAlerts = [];
  if (!db.settings) db.settings = buildSeed().settings;
  return db;
}

function read() {
  if (cache) return cache;
  if (READ_ONLY) {
    cache = migrate(buildSeed());
    return cache;
  }
  if (REMOTE) {
    // Not loaded yet — callers on /api have awaited ensureReady() first.
    return migrate(buildSeed());
  }
  ensure();
  try {
    cache = migrate(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  } catch (err) {
    console.error('[db] corrupted database, reseeding:', err.message);
    cache = migrate(buildSeed());
    persistLocal();
  }
  return cache;
}

function persistLocal() {
  ensure();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function persist() {
  if (REMOTE) return storage.uploadDb(JSON.stringify(cache, null, 2));
  persistLocal();
  return Promise.resolve();
}

/**
 * Schedule a persist. Returns a promise that resolves once this save has been
 * written to durable storage (routes should await it before responding, so a
 * serverless instance never reports success for a write that was not stored).
 */
function save() {
  if (READ_ONLY) throw new Error('Database writes are unavailable in read-only preview mode.');
  if (!REMOTE) {
    // Local host: batched, synchronous-on-exit writes to the JSON file.
    if (writeTimer) return Promise.resolve();
    writeTimer = setTimeout(() => {
      writeTimer = null;
      try { persistLocal(); } catch (err) { console.error('[db] persist failed:', err.message); }
    }, 120);
    return Promise.resolve();
  }
  // Serverless: serialize uploads so concurrent requests cannot interleave.
  const p = writeQueue.then(persist);
  writeQueue = p.catch(() => {});
  return p;
}

process.on('exit', () => {
  if (writeTimer && cache && !REMOTE) {
    clearTimeout(writeTimer);
    writeTimer = null;
    try { persistLocal(); } catch (_) {}
  }
});

function uid(prefix = '') {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7)
  ).toLowerCase();
}

module.exports = { read, save, ensureReady, uid, DB_FILE, READ_ONLY, REMOTE };
