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

// How long a serverless instance may reuse its in-memory copy before it
// re-reads the shared database. Short, because the admin panel must see its
// own writes immediately even when a different instance handles the request.
const REMOTE_CACHE_MS = Math.max(0, Number(process.env.REMOTE_DB_CACHE_MS || 1500));

let cache = null;
let writeTimer = null;
let writeQueue = Promise.resolve();
let lastLoadedAt = 0;
let loadError = null;
let everLoaded = false;
let refreshPromise = null;

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(buildSeed(), null, 2));
  }
}

async function loadRemote({ seedIfMissing = true } = {}) {
  const remote = await storage.downloadDb();
  if (remote) {
    cache = migrate(remote);
  } else if (cache) {
    // Keep the copy we already have rather than replacing real data with demo data.
    return cache;
  } else if (seedIfMissing) {
    // First boot on a serverless host: seed the bucket so every instance and
    // the admin panel read the same data.
    cache = migrate(buildSeed());
    await storage.uploadDb(JSON.stringify(cache, null, 2));
  }
  lastLoadedAt = Date.now();
  everLoaded = true;
  loadError = null;
  return cache;
}

/**
 * Loads the database when running on a serverless host. Resolves immediately
 * otherwise.
 *
 * @param {object} [options]
 * @param {boolean} [options.refresh] Re-read from storage even if the cache is
 *   fresh. Mutating requests use this so their read-modify-write starts from
 *   the latest data instead of clobbering another instance's changes.
 * @param {boolean} [options.throwOnError] Reject instead of serving stale data.
 */
function ensureReady({ refresh = false, throwOnError = false } = {}) {
  if (!REMOTE) {
    read();
    return Promise.resolve(cache);
  }

  const fresh = everLoaded && !refresh && Date.now() - lastLoadedAt < REMOTE_CACHE_MS;
  if (fresh) return Promise.resolve(cache);

  // Coalesce concurrent loads/refreshes into one storage request.
  if (!refreshPromise) {
    refreshPromise = loadRemote({ seedIfMissing: !everLoaded })
      .catch((err) => {
        loadError = err;
        console.error('[db] remote load failed:', err.message);
        // Reads keep working from a demo catalogue so the storefront is never
        // blank, but `save()` refuses to write while this error stands — that
        // would overwrite the real database with demo data.
        if (!cache) cache = migrate(buildSeed());
        if (throwOnError) throw err;
        return cache;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
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
  // Older databases predate email+password admin login — backfill the email.
  if (!db.settings.adminEmail) db.settings.adminEmail = process.env.ADMIN_EMAIL || 'admin@ismailelegance.pk';
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
  if (REMOTE && (loadError || (!everLoaded && !cache))) {
    // Writing here would overwrite the real database with demo data.
    throw new Error(
      'Storage is temporarily unavailable, so this change was not saved. Please retry in a moment.'
    );
  }
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
  const p = writeQueue.then(async () => {
    await persist();
    lastLoadedAt = Date.now();
    everLoaded = true;
    loadError = null;
  });
  writeQueue = p.catch(() => {});
  return p;
}

/** Status for /api/health — never exposes data, only where it lives. */
function status() {
  return {
    mode: READ_ONLY ? 'preview' : REMOTE ? 'remote' : 'local',
    remote: REMOTE,
    readOnly: READ_ONLY,
    loaded: REMOTE ? Boolean(everLoaded || cache) : true,
    lastLoadedAt: lastLoadedAt ? new Date(lastLoadedAt).toISOString() : null,
    lastError: loadError ? loadError.message : null
  };
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

module.exports = {
  read,
  save,
  ensureReady,
  status,
  uid,
  DB_FILE,
  READ_ONLY,
  REMOTE
};
