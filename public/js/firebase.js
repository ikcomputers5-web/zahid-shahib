// Firebase client helper — works with compat CDN or modular import
// Expects window.firebase to be loaded via compat CDN, or uses dynamic import fallback.

const STORAGE_KEY = 'ie_firebase_user';

let app = null;
let auth = null;
let provider = null;
let firebaseConfig = null;
let initialized = false;
let currentUser = null;
const listeners = new Set();

function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setStoredUser(user) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function getFirebaseConfig() {
  return firebaseConfig;
}

export function isFirebaseEnabled() {
  return Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
}

export function getCurrentUser() {
  return currentUser || getStoredUser();
}

export function isSignedIn() {
  return Boolean(getCurrentUser());
}

export async function initFirebase(config) {
  firebaseConfig = config || null;
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    initialized = false;
    return { enabled: false, reason: 'Firebase not configured. Set FIREBASE_API_KEY etc. in your environment.' };
  }

  // Try compat CDN first (loaded via script tag in index.html / admin.html)
  try {
    if (typeof window !== 'undefined' && window.firebase && window.firebase.initializeApp) {
      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        app = window.firebase.initializeApp(firebaseConfig);
      } else {
        app = window.firebase.app();
      }
      auth = window.firebase.auth();
      provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // Listen for auth state
      auth.onAuthStateChanged((user) => {
        if (user) {
          currentUser = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email,
            picture: user.photoURL,
            emailVerified: user.emailVerified
          };
          setStoredUser(currentUser);
        } else {
          // Keep stored user until explicit signOut, to handle page reloads where firebase hasn't restored yet
          const stored = getStoredUser();
          if (!stored) currentUser = null;
        }
        emit(currentUser);
      });

      // Try to restore from stored user optimistically
      const stored = getStoredUser();
      if (stored) currentUser = stored;

      initialized = true;
      return { enabled: true };
    }
  } catch (e) {
    console.warn('[firebase] compat init failed', e);
  }

  // Fallback: try modular SDK via dynamic import (if installed via npm)
  try {
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    const apps = getApps();
    app = apps.length ? apps[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = { uid: user.uid, email: user.email, name: user.displayName || user.email, picture: user.photoURL, emailVerified: user.emailVerified };
        setStoredUser(currentUser);
      } else {
        currentUser = null;
        setStoredUser(null);
      }
      emit(currentUser);
    });

    // Attach modular methods to our wrapper
    auth._modular = { signInWithPopup, signOut, GoogleAuthProvider };

    initialized = true;
    return { enabled: true };
  } catch (e) {
    console.error('[firebase] modular init failed', e);
    return { enabled: false, reason: e.message };
  }
}

function emit(user) {
  listeners.forEach(fn => { try { fn(user); } catch {} });
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function signInWithGoogle() {
  if (!initialized || !auth) throw new Error('Firebase is not configured. Add your Firebase project keys to .env and restart the server.');
  try {
    let result;
    if (auth._modular) {
      const { signInWithPopup } = auth._modular;
      result = await signInWithPopup(auth, provider);
      const user = result.user;
      currentUser = { uid: user.uid, email: user.email, name: user.displayName || user.email, picture: user.photoURL, emailVerified: user.emailVerified };
      setStoredUser(currentUser);
      emit(currentUser);
      // Notify backend (upsert user)
      try {
        const idToken = await user.getIdToken();
        await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
        return { user: currentUser, idToken };
      } catch {}
      return { user: currentUser, idToken: await user.getIdToken() };
    } else {
      result = await auth.signInWithPopup(provider);
      const user = result.user;
      currentUser = { uid: user.uid, email: user.email, name: user.displayName || user.email, picture: user.photoURL, emailVerified: user.emailVerified };
      setStoredUser(currentUser);
      emit(currentUser);
      const idToken = await user.getIdToken();
      try {
        await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
      } catch {}
      return { user: currentUser, idToken };
    }
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') throw new Error('Sign-in was cancelled.');
    if (err.code === 'auth/unauthorized-domain') throw new Error('This domain is not authorized in Firebase Console → Authentication → Settings → Authorized domains.');
    throw new Error(err.message || 'Google sign-in failed.');
  }
}

export async function signOutUser() {
  try {
    if (auth) {
      if (auth._modular) await auth._modular.signOut(auth);
      else await auth.signOut();
    }
  } catch {}
  currentUser = null;
  setStoredUser(null);
  emit(null);
  // Also clear any admin cookie via backend
  try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
}

export async function getIdToken(forceRefresh = false) {
  if (!auth) {
    // Fallback: try to get token from current Firebase user if available via window.firebase
    try {
      const u = window.firebase?.auth()?.currentUser;
      if (u) return await u.getIdToken(forceRefresh);
    } catch {}
    // For demo without service account setup, we encode a mock JWT that backend will decode
    const stored = getStoredUser();
    if (stored) {
      // Create a mock JWT payload that backend's fallback decoder accepts
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: stored.uid,
        uid: stored.uid,
        email: stored.email,
        name: stored.name,
        picture: stored.picture,
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      })).toString('base64url');
      return `${header}.${payload}.mock`;
    }
    return null;
  }
  try {
    const user = auth.currentUser || window.firebase?.auth()?.currentUser;
    if (user) return await user.getIdToken(forceRefresh);
  } catch {}
  // Compat fallback: stored user mock token
  const stored = getStoredUser();
  if (stored) {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const payload = btoa(JSON.stringify({
      sub: stored.uid, uid: stored.uid, email: stored.email, name: stored.name, picture: stored.picture, email_verified: true,
      exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000)
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${header}.${payload}.mock`;
  }
  return null;
}

// For admin: sign in and return idToken for backend session exchange
export async function signInForAdmin() {
  const { idToken, user } = await signInWithGoogle();
  // Exchange Firebase token for local admin session
  const res = await fetch('/api/admin/firebase-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ idToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Admin Google sign-in failed.');
  return { user, idToken, sessionToken: data.token };
}
