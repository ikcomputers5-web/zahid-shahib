'use strict';

const fs = require('fs');

/**
 * Firebase Admin helper.
 *
 * Supports multiple credential formats so deployment is flexible:
 *  - FIREBASE_SERVICE_ACCOUNT  JSON string of the whole service-account file
 *  - FIREBASE_SERVICE_ACCOUNT_PATH  path to service-account JSON file
 *  - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *  - GOOGLE_APPLICATION_CREDENTIALS (Google default)
 *
 * Client-side config (safe to expose) is read from:
 *  - FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
 *    FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID,
 *    FIREBASE_MEASUREMENT_ID
 */

let adminApp = null;
let adminAuth = null;
let initError = null;

function isFirebaseAdminEnabled() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

function isFirebaseClientConfigured() {
  return Boolean(process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID);
}

function isFirebaseEnabled() {
  // Client configured is enough for frontend to show Google button; admin verification
  // will try best-effort and fall back to JWT decode if service account missing.
  return isFirebaseAdminEnabled() || isFirebaseClientConfigured();
}

function getClientConfig() {
  if (!isFirebaseClientConfigured()) return null;
  return {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || undefined
  };
}

function initAdmin() {
  if (adminApp) return adminApp;
  if (initError) throw initError;
  if (!isFirebaseAdminEnabled() && !isFirebaseClientConfigured()) return null;

  try {
    const admin = require('firebase-admin');
    if (admin.apps.length) {
      adminApp = admin.apps[0];
      adminAuth = admin.auth();
      return adminApp;
    }

    let credential = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(svc);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const raw = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8');
      credential = admin.credential.cert(JSON.parse(raw));
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      credential = admin.credential.applicationDefault();
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || undefined;

    if (credential) {
      adminApp = admin.initializeApp({ credential, projectId });
    } else if (projectId) {
      // No service account but projectId present: initialize without credential for best-effort (emulator/dev)
      // Verify will fall back to JWT decode.
      adminApp = admin.initializeApp({ projectId });
    } else {
      return null;
    }
    adminAuth = admin.auth();
    return adminApp;
  } catch (err) {
    initError = err;
    console.error('[firebase] Admin init failed:', err.message);
    return null;
  }
}

function getAuth() {
  if (adminAuth) return adminAuth;
  if (!isFirebaseEnabled()) return null;
  initAdmin();
  return adminAuth;
}

/**
 * Verify a Firebase ID token.
 * Returns decoded token { uid, email, name, picture, email_verified } or throws.
 * If Admin SDK not fully configured, falls back to decoding JWT payload without
 * signature verification (useful for local dev without service account). In production
 * you MUST configure service account for secure verification.
 */
async function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') throw new Error('Missing ID token.');
  const auth = getAuth();

  if (auth) {
    try {
      const decoded = await auth.verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        email: decoded.email || null,
        name: decoded.name || decoded.email || 'Customer',
        picture: decoded.picture || null,
        email_verified: decoded.email_verified || false,
        firebase: decoded
      };
    } catch (err) {
      // If admin is initialized but token is mock/dev, try fallback decode
      // Only allow fallback when explicitly in dev mode or when error is credential-related
      const isDev = process.env.NODE_ENV !== 'production';
      const isCredentialError = /credential|project id|private key/i.test(err.message);
      if (isDev || isCredentialError) {
        console.warn('[firebase] Admin verify failed, falling back to JWT decode:', err.message);
      } else {
        throw new Error('Invalid authentication token: ' + err.message);
      }
    }
  }

  // Fallback: decode JWT payload without verifying signature (DEV ONLY)
  // This allows frontend to work without service account for demo purposes.
  // Do NOT use in production with sensitive decisions.
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Malformed token.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload.sub && !payload.uid && !payload.user_id) throw new Error('Token missing subject.');
    // Check expiry if present
    if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('Token expired.');
    return {
      uid: payload.sub || payload.uid || payload.user_id,
      email: payload.email || null,
      name: payload.name || payload.email || 'Customer',
      picture: payload.picture || null,
      email_verified: payload.email_verified || false,
      firebase: payload
    };
  } catch (err) {
    throw new Error('Invalid authentication token: ' + err.message);
  }
}

function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || process.env.FIREBASE_ADMIN_EMAILS || '';
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function isAdminEmail(email) {
  const allowList = getAdminEmails();
  if (!allowList.length) return true; // open if not configured (demo mode)
  if (!email) return false;
  return allowList.includes(String(email).toLowerCase());
}

module.exports = {
  isFirebaseEnabled,
  isFirebaseAdminEnabled,
  isFirebaseClientConfigured,
  getClientConfig,
  initAdmin,
  getAuth,
  verifyIdToken,
  getAdminEmails,
  isAdminEmail
};
