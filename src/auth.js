'use strict';

const crypto = require('crypto');
const { read } = require('./db');

const SESSION_TTL = 12 * 60 * 60 * 1000;
const sessions = new Map();
const attempts = new Map();

function verifyPassword(password) {
  const s = read().settings;
  if (!s.adminPasswordSalt || !s.adminPasswordHash) return false;
  const candidate = crypto.scryptSync(String(password), s.adminPasswordSalt, 64);
  const known = Buffer.from(s.adminPasswordHash, 'hex');
  return candidate.length === known.length && crypto.timingSafeEqual(candidate, known);
}

function issueSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function sessionValid(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
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
