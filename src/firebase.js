'use strict';

const fs = require('fs');

/**
 * Firebase helper (Admin SDK + browser config).
 *
 * Credential formats supported (first one found wins):
 *  - FIREBASE_SERVICE_ACCOUNT        JSON string (or base64 of it) of the
 *                                    whole service-account file
 *  - FIREBASE_SERVICE_ACCOUNT_PATH   path to the JSON file
 *  - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *  - GOOGLE_APPLICATION_CREDENTIALS  Google application default credentials
 *
 * Browser (public) config:
 *  - FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
 *    FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID,
 *    FIREBASE_MEASUREMENT_ID
 *
 * Security note: an ID token is only accepted once the Admin SDK has verified
 * its signature. The unverified "decode only" path is a local-development
 * helper and must be opted into explicitly with
 * FIREBASE_ALLOW_INSECURE_DECODE=1 outside production.
 */

let adminApp = null;
let adminAuth = null;
let initError = null;
let initialized = false;

/** Trim values copied from dashboards (quotes, stray whitespace, newlines). */
function clean(value) {
  if (value == null) return '';
  let out = String(value).trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function normalizePrivateKey(key) {
  return clean(key).replace(/\\n/g, '\n');
}

/** Parse a service-account blob (plain JSON, escaped JSON or base64). */
function parseServiceAccount(raw) {
  const text = clean(raw);
  if (!text) return null;
  let candidate = text;
  if (!candidate.startsWith('{')) {
    try {
      candidate = Buffer.from(candidate, 'base64').toString('utf8');
    } catch (_) {
      /* not base64 — fall through to JSON.parse for a clear error */
    }
  }
  const parsed = JSON.parse(candidate);
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = normalizePrivateKey(parsed.private_key);
  }
  return parsed;
}

function hasSplitCredentials() {
  return Boolean(
    clean(process.env.FIREBASE_CLIENT_EMAIL) && clean(process.env.FIREBASE_PRIVATE_KEY)
  );
}

function serviceAccountSource() {
  if (clean(process.env.FIREBASE_SERVICE_ACCOUNT)) return 'FIREBASE_SERVICE_ACCOUNT';
  if (clean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) return 'FIREBASE_SERVICE_ACCOUNT_PATH';
  if (hasSplitCredentials()) return 'FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY';
  if (clean(process.env.GOOGLE_APPLICATION_CREDENTIALS)) return 'GOOGLE_APPLICATION_CREDENTIALS';
  return null;
}

function isFirebaseAdminEnabled() {
  return Boolean(serviceAccountSource());
}

function isFirebaseClientConfigured() {
  return Boolean(clean(process.env.FIREBASE_API_KEY) && clean(process.env.FIREBASE_PROJECT_ID));
}

/**
 * Firebase is "enabled" for the storefront only when the browser config is
 * present — that is what shows the Google button and gates checkout. The
 * Admin SDK is reported separately.
 */
function isFirebaseEnabled() {
  return isFirebaseClientConfigured();
}

/** Local-development escape hatch for token verification. Never in production. */
function insecureDecodeAllowed() {
  const flag = clean(process.env.FIREBASE_ALLOW_INSECURE_DECODE).toLowerCase();
  return process.env.NODE_ENV !== 'production' && ['1', 'true', 'yes'].includes(flag);
}

function getClientConfig() {
  if (!isFirebaseClientConfigured()) return null;
  const projectId = clean(process.env.FIREBASE_PROJECT_ID);
  return {
    apiKey: clean(process.env.FIREBASE_API_KEY),
    authDomain: clean(process.env.FIREBASE_AUTH_DOMAIN) || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: clean(process.env.FIREBASE_STORAGE_BUCKET) || `${projectId}.appspot.com`,
    messagingSenderId: clean(process.env.FIREBASE_MESSAGING_SENDER_ID),
    appId: clean(process.env.FIREBASE_APP_ID),
    measurementId: clean(process.env.FIREBASE_MEASUREMENT_ID) || undefined
  };
}

function initAdmin() {
  if (adminApp) return adminApp;
  if (initialized) {
    if (initError) throw initError;
    return null;
  }
  if (!isFirebaseAdminEnabled() && !isFirebaseClientConfigured()) {
    initialized = true;
    return null;
  }

  try {
    const admin = require('firebase-admin');
    if (admin.apps.length) {
      adminApp = admin.apps[0];
      adminAuth = admin.auth();
      initialized = true;
      return adminApp;
    }

    let credential = null;

    if (clean(process.env.FIREBASE_SERVICE_ACCOUNT)) {
      credential = admin.credential.cert(parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT));
    } else if (clean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
      const raw = fs.readFileSync(clean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH), 'utf8');
      credential = admin.credential.cert(parseServiceAccount(raw));
    } else if (hasSplitCredentials()) {
      credential = admin.credential.cert({
        projectId: clean(process.env.FIREBASE_PROJECT_ID) || undefined,
        clientEmail: clean(process.env.FIREBASE_CLIENT_EMAIL),
        privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)
      });
    } else if (clean(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      credential = admin.credential.applicationDefault();
    }

    const projectId = clean(process.env.FIREBASE_PROJECT_ID) || undefined;

    if (credential) {
      adminApp = admin.initializeApp({ credential, projectId });
    } else if (projectId) {
      // Project id only: lets the SDK load for emulator/dev. Verification will
      // still fail closed in production.
      adminApp = admin.initializeApp({ projectId });
    } else {
      initialized = true;
      return null;
    }
    adminAuth = admin.auth();
    initialized = true;
    return adminApp;
  } catch (err) {
    initError = err;
    initialized = true;
    console.error('[firebase] Admin init failed:', err.message);
    return null;
  }
}

function getAuth() {
  if (adminAuth) return adminAuth;
  if (!isFirebaseEnabled() && !isFirebaseAdminEnabled()) return null;
  initAdmin();
  return adminAuth;
}

function decodeWithoutVerification(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed token.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (!payload.sub && !payload.uid && !payload.user_id) throw new Error('Token missing subject.');
  if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('Token expired.');
  return {
    uid: payload.sub || payload.uid || payload.user_id,
    email: payload.email || null,
    name: payload.name || payload.email || 'Customer',
    picture: payload.picture || null,
    email_verified: Boolean(payload.email_verified),
    firebase: payload,
    verified: false
  };
}

/**
 * Verify a Firebase ID token.
 * @returns {Promise<object>} decoded token
 * @throws when the token cannot be verified (or is invalid/expired)
 */
async function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') throw new Error('Missing ID token.');
  const token = idToken.trim();
  const auth = getAuth();

  if (auth) {
    try {
      const decoded = await auth.verifyIdToken(token);
      return {
        uid: decoded.uid,
        email: decoded.email || null,
        name: decoded.name || decoded.email || 'Customer',
        picture: decoded.picture || null,
        email_verified: Boolean(decoded.email_verified),
        firebase: decoded,
        verified: true
      };
    } catch (err) {
      // Never fall back silently — a rejected token must not become a session.
      if (insecureDecodeAllowed()) {
        console.warn('[firebase] verify failed, using insecure dev decode:', err.message);
        return decodeWithoutVerification(token);
      }
      throw new Error('Invalid authentication token: ' + err.message);
    }
  }

  if (insecureDecodeAllowed()) {
    console.warn('[firebase] Admin SDK unavailable — using insecure dev decode.');
    return decodeWithoutVerification(token);
  }

  if (initError) {
    throw new Error(
      'Firebase Admin is not configured correctly on the server (' + initError.message + ').'
    );
  }
  throw new Error(
    'Firebase Admin credentials are missing on the server. Add FIREBASE_SERVICE_ACCOUNT (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).'
  );
}

function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || process.env.FIREBASE_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((s) => clean(s).toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  const allowList = getAdminEmails();
  if (!allowList.length) return true; // open if not configured (demo mode)
  if (!email) return false;
  return allowList.includes(String(email).toLowerCase());
}

/**
 * Safe status report for the admin panel / /api/health. Contains no secrets —
 * only whether each piece is configured, and any error message.
 */
function inspectServiceAccount() {
  const report = {
    source: serviceAccountSource(),
    projectId: null,
    clientEmail: null,
    hasPrivateKey: false,
    valid: false,
    error: null
  };
  const raw = clean(process.env.FIREBASE_SERVICE_ACCOUNT);
  const filePath = clean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  if (!raw && !filePath) {
    if (hasSplitCredentials()) {
      report.projectId = clean(process.env.FIREBASE_PROJECT_ID) || null;
      report.clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL);
      report.hasPrivateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY).includes(
        'BEGIN PRIVATE KEY'
      );
      report.valid = report.hasPrivateKey;
    }
    return report;
  }
  try {
    const account = raw ? parseServiceAccount(raw) : parseServiceAccount(fs.readFileSync(filePath, 'utf8'));
    report.projectId = account.project_id || null;
    report.clientEmail = account.client_email || null;
    report.hasPrivateKey = String(account.private_key || '').includes('BEGIN PRIVATE KEY');
    report.valid =
      (account.type || 'service_account') === 'service_account' &&
      Boolean(report.projectId) &&
      Boolean(report.clientEmail) &&
      report.hasPrivateKey;
    if (!report.valid) {
      report.error =
        'The service account JSON is missing project_id, client_email or a valid private_key.';
    }
  } catch (err) {
    report.error = `FIREBASE_SERVICE_ACCOUNT is not valid JSON (${err.message}).`;
  }
  return report;
}

function diagnostics() {
  const client = getClientConfig();
  const report = {
    clientConfigured: isFirebaseClientConfigured(),
    adminConfigured: isFirebaseAdminEnabled(),
    adminInitialized: false,
    credentialSource: serviceAccountSource(),
    projectId: clean(process.env.FIREBASE_PROJECT_ID) || null,
    authDomain: client?.authDomain || null,
    appIdConfigured: Boolean(client?.appId),
    adminEmailCount: getAdminEmails().length,
    insecureDecode: insecureDecodeAllowed(),
    errors: []
  };

  if (report.clientConfigured) {
    if (!report.appIdConfigured) report.errors.push('FIREBASE_APP_ID is missing.');
    if (!client.authDomain) report.errors.push('FIREBASE_AUTH_DOMAIN is missing.');
    if (
      clean(process.env.FIREBASE_AUTH_DOMAIN) &&
      clean(process.env.FIREBASE_PROJECT_ID) &&
      !clean(process.env.FIREBASE_AUTH_DOMAIN).includes(clean(process.env.FIREBASE_PROJECT_ID)) &&
      !clean(process.env.FIREBASE_AUTH_DOMAIN).endsWith('.firebaseapp.com')
    ) {
      report.errors.push('FIREBASE_AUTH_DOMAIN does not match FIREBASE_PROJECT_ID.');
    }
  } else {
    report.errors.push('FIREBASE_API_KEY and/or FIREBASE_PROJECT_ID are missing.');
  }

  const service = inspectServiceAccount();
  report.serviceAccount = {
    source: service.source,
    projectId: service.projectId,
    clientEmail: service.clientEmail ? 'configured' : null,
    hasPrivateKey: service.hasPrivateKey,
    valid: service.valid
  };

  if (!report.adminConfigured) {
    report.errors.push(
      'No server credentials: add FIREBASE_SERVICE_ACCOUNT (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY).'
    );
  } else {
    if (service.error) report.errors.push(service.error);
    if (service.valid === false && !service.error) {
      report.errors.push('The Firebase service account is incomplete.');
    }
    if (report.projectId && service.projectId && service.projectId !== report.projectId) {
      report.errors.push(
        `FIREBASE_SERVICE_ACCOUNT belongs to project "${service.projectId}" but FIREBASE_PROJECT_ID is "${report.projectId}" — both must be the same Firebase project.`
      );
    }
    try {
      report.adminInitialized = Boolean(initAdmin());
      if (!report.adminInitialized && initError) report.errors.push(initError.message);
    } catch (err) {
      report.errors.push(err.message);
    }
  }

  return report;
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
  isAdminEmail,
  diagnostics,
  parseServiceAccount,
  clean
};
