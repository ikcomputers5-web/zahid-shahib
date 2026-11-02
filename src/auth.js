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

module.exports = { verifyPassword, issueSession, destroySession, sessionValid, readToken, requireAdmin, tooManyAttempts, noteAttempt, SESSION_TTL };
