const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: jsonHeaders,
    credentials: 'same-origin',
    ...options
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
    throw error;
  }
  return data;
}

export const api = {
  bootstrap: () => request('/api/bootstrap'),
  products: (query = '') => request('/api/products' + query),
  product: (slug) => request(`/api/products/${encodeURIComponent(slug)}`),
  validatePromo: (code, subtotal) =>
    request('/api/promo/validate', { method: 'POST', body: JSON.stringify({ code, subtotal }) }),
  createOrder: (payload) => request('/api/orders', { method: 'POST', body: JSON.stringify(payload) }),
  trackOrder: (number, phone) =>
    request(`/api/orders/${encodeURIComponent(number)}?phone=${encodeURIComponent(phone)}`),
  contact: (payload) => request('/api/contact', { method: 'POST', body: JSON.stringify(payload) }),
  subscribe: (email, source = 'newsletter') =>
    request('/api/subscribe', { method: 'POST', body: JSON.stringify({ email, source }) })
};
