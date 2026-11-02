'use strict';

const fs = require('fs');
const path = require('path');
const { buildSeed } = require('./seed');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
// Vercel's deployment filesystem is read-only, and /tmp is not durable or
// shared between instances. Use the seed only for browsing there.
const READ_ONLY = Boolean(process.env.VERCEL);

let cache = null;
let writeTimer = null;

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(buildSeed(), null, 2));
  }
}

function read() {
  if (cache) return cache;
  if (READ_ONLY) {
    cache = buildSeed();
    return cache;
  }
  ensure();
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('[db] corrupted database, reseeding:', err.message);
    cache = buildSeed();
    persist();
  }
  return cache;
}

function persist() {
  ensure();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/** Batched, synchronous-on-exit writes. */
function save() {
  if (READ_ONLY) throw new Error('Database writes are unavailable on Vercel.');
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    persist();
  }, 120);
}

process.on('exit', () => {
  if (writeTimer && cache) {
    clearTimeout(writeTimer);
    writeTimer = null;
    try { persist(); } catch (_) {}
  }
});

function uid(prefix = '') {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7)
  ).toLowerCase();
}

module.exports = { read, save, uid, DB_FILE, READ_ONLY };
