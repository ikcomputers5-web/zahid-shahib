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
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';
const BUCKET = process.env.SUPABASE_BUCKET || 'product-images';

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

module.exports = { isSupabaseEnabled, uploadToSupabase, BUCKET };
