'use strict';

/**
 * Image storage.
 *
 * On Vercel the filesystem is read-only, so uploaded images cannot live in
 * public/uploads. When Supabase env vars are present we upload to a Supabase
 * Storage bucket and return its public URL. Without them (local dev) we fall
 * back to writing into public/uploads.
 *
 * Required env vars:
 *   SUPABASE_URL              e.g. https://xxxx.supabase.co
 *   SUPABASE_SECRET_KEY       secret key (sb_secret_...) — newer Supabase format
 *   SUPABASE_SERVICE_ROLE_KEY legacy service_role key — also accepted
 *   SUPABASE_BUCKET           optional, defaults to "product-images"
 *
 * The JSON database is also stored in Supabase when the app runs on a
 * read-only host (Vercel): one private bucket (SUPABASE_DB_BUCKET, default
 * "store-db") holding a single "db.json" object.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';
const BUCKET = process.env.SUPABASE_BUCKET || 'product-images';
const DB_BUCKET = process.env.SUPABASE_DB_BUCKET || 'store-db';
const DB_OBJECT = 'db.json';

let client = null;

function isSupabaseEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function getClient() {
  if (!isSupabaseEnabled()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

/**
 * Upload a buffer to Supabase Storage and return the public URL.
 * @param {Buffer} buffer
 * @param {string} filename  e.g. "abc123.jpg"
 * @param {string} contentType e.g. "image/jpeg"
 * @returns {Promise<string>} public URL
 */
async function uploadToSupabase(buffer, filename, contentType) {
  const sb = getClient();
  const objectPath = `uploads/${filename}`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

/**
 * Download and parse the JSON database from the private DB bucket.
 * @returns {Promise<object|null>} parsed database, or null if not stored yet
 */
async function downloadDb() {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(DB_BUCKET).download(DB_OBJECT);
  if (error) {
    if (String(error.statusCode) === '404' || /not found/i.test(error.message || '')) return null;
    throw new Error(`Supabase db download failed: ${error.message}`);
  }
  const text = await data.text();
  return JSON.parse(text);
}

/**
 * Persist the JSON database into the private DB bucket (overwrites db.json).
 * @param {string} json  serialized database
 */
async function uploadDb(json) {
  const sb = getClient();
  if (!sb) throw new Error('Supabase is not configured.');
  const { error } = await sb.storage
    .from(DB_BUCKET)
    .upload(DB_OBJECT, json, { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`Supabase db save failed: ${error.message}`);
}

module.exports = { isSupabaseEnabled, uploadToSupabase, downloadDb, uploadDb, BUCKET, DB_BUCKET, DB_OBJECT };
