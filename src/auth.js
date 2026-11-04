'use strict';

const crypto = require('crypto');
const { read } = require('./db');

const SESSION_TTL = 12 * 60 * 60 * 1000;
// Serverless instances have no shared memory, so sessions are stateless:
// a signed token "payload.signature" verified per request. No server-side
// session store is needed, and the brute-force limiter stays best-effort.
const attempts = new Map();

/**
 * Signing secret. Prefer an explicit SESSION_SECRET env var; otherwise derive
 * one from the stored admin password hash, so changing the admin password
 * automatically invalidates every outstanding session.
 */
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const s = read().settings || {};
  return `ie-session:${s.adminPasswordSalt || 'boot'}:${s.adminPasswordHash || 'seed'}`;
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function verifyPassword(password) {
  const s = read().settings;
  if (!s.adminPasswordSalt || !s.adminPasswordHash) return false;
  const candidate = crypto.scryptSync(String(password), s.adminPasswordSalt, 64);
  const known = Buffer.from(s.adminPasswordHash, 'hex');
  return candidate.length === known.length && crypto.timingSafeEqual(candidate, known);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Constant-time comparison so the email check does not leak via timing. */
function emailMatches(email) {
  const expected = normalizeEmail(read().settings?.adminEmail);
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(normalizeEmail(email)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Admin sign-in with email + password. Both must match the stored
 * admin credentials; returns a single boolean so callers can answer
 * "incorrect email or password" without revealing which one failed.
 */
function verifyCredentials(email, password) {
  if (!normalizeEmail(email) || password === undefined || password === null || password === '') return false;
  return emailMatches(email) && verifyPassword(password);
}

function issueSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Stateless logout: tokens are short-lived and cannot be revoked individually. */
function destroySession(_token) {}

function sessionValid(token) {
  if (!token || !token.includes('.')) return false;
  const dot = token.lastIndexOf('.');
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now();
  } catch (_) {
    return false;
  }
}

function readToken(req) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith('ie_admin='));
  if (match) return decodeURIComponent(match.slice('ie_admin='.length));
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function requireAdmin(req, res, next) {
  if (!sessionValid(readToken(req))) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  next();
}

/**
 * Firebase-based admin verification — validates Firebase ID token and issues a local session.
 * Returns decoded user if valid admin, else null.
 */
async function verifyFirebaseAdmin(idToken) {
  if (!idToken) return null;
  const firebase = require('./firebase');
  let decoded;
  try {
    decoded = await firebase.verifyIdToken(idToken);
  } catch (err) {
    throw new Error(err.message || 'Invalid Google token.');
  }
  if (!decoded.email) throw new Error('Google account has no email.');
  if (!firebase.isAdminEmail(decoded.email)) {
    throw new Error('This Google account is not authorized for admin access.');
  }
  return decoded;
}

/**
 * Customer auth helpers — verify Firebase ID token for storefront users.
 */
async function verifyCustomer(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  // If token looks like our local admin session, ignore for customer flow
  if (token.split('.').length === 2 && sessionValid(token)) return null;

  const firebase = require('./firebase');
  // If Firebase not configured but we still want to allow guest fallback,
  // verifyCustomer will try to decode; if fails return null.
  try {
    const decoded = await firebase.verifyIdToken(token);
    return decoded;
  } catch (_err) {
    return null;
  }
}

async function requireCustomer(req, res, next) {
  const firebase = require('./firebase');
  // Only enforce when Firebase is configured — otherwise allow guests (dev/demo mode)
  if (!firebase.isFirebaseEnabled()) return next();
  const customer = await verifyCustomer(req);
  if (!customer) {
    return res.status(401).json({ error: 'Please sign in with Google to continue.', code: 'AUTH_REQUIRED' });
  }
  req.customer = customer;
  next();
}

async function optionalCustomer(req, _res, next) {
  try {
    const customer = await verifyCustomer(req);
    if (customer) req.customer = customer;
  } catch (_) {}
  next();
}

/** Very light brute-force protection: 8 failed attempts per IP per 10 minutes. */
function tooManyAttempts(ip) {
  const record = attempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.first > 10 * 60 * 1000) {
    attempts.delete(ip);
    return false;
  }
  return record.count >= 8;
}

function noteAttempt(ip, success) {
  if (success) {
    attempts.delete(ip);
    return;
  }
  const record = attempts.get(ip) || { count: 0, first: Date.now() };
  record.count += 1;
  attempts.set(ip, record);
}

module.exports = { verifyPassword, verifyCredentials, normalizeEmail, issueSession, destroySession, sessionValid, readToken, requireAdmin, tooManyAttempts, noteAttempt, SESSION_TTL, verifyFirebaseAdmin, verifyCustomer, requireCustomer, optionalCustomer };
