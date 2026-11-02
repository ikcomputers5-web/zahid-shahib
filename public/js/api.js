import { getIdToken } from './firebase.js';

const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const headers = { ...jsonHeaders, ...(options.headers || {}) };

  // Attach Firebase ID token if available (for authenticated orders)
  try {
    const token = await getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}

  const res = await fetch(path, {
    headers,
    credentials: 'same-origin',
    ...options,
    headers
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { error: 'Unexpected response from server.' };
  }
  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = res.status;
    error.data = data;
    error.code = data.code || null;
    throw error;
  }
  return data;
}

export const api = {
  bootstrap: () => request('/api/bootstrap'),
  firebaseConfig: () => request('/api/auth/config'),
  authMe: () => request('/api/auth/me'),
  googleLogin: (idToken) => request('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
  myOrders: () => request('/api/my/orders'),
  products: (query = '') => request('/api/products' + query),
  product: (slug) => request(`/api/products/${encodeURIComponent(slug)}`),
  validatePromo: (code, subtotal) =>
    request('/api/promo/validate', { method: 'POST', body: JSON.stringify({ code, subtotal }) }),
  createOrder: async (payload) => {
    // Include idToken explicitly as fallback for body-based auth
    let idToken = null;
    try { idToken = await getIdToken(); } catch {}
    const body = idToken ? { ...payload, idToken } : payload;
    return request('/api/orders', { method: 'POST', body: JSON.stringify(body) });
  },
  trackOrder: (number, phone) =>
    request(`/api/orders/${encodeURIComponent(number)}?phone=${encodeURIComponent(phone)}`),
  contact: (payload) => request('/api/contact', { method: 'POST', body: JSON.stringify(payload) }),
  subscribe: (email, source = 'newsletter') =>
    request('/api/subscribe', { method: 'POST', body: JSON.stringify({ email, source }) })
};
