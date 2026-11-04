// Meta Pixel helpers — safe no-ops when META_PIXEL_ID is not configured
// (window.fbq only exists once the base snippet in index.html has loaded).

export function trackPageView() {
  if (typeof window.fbq === 'function') window.fbq('track', 'PageView');
}

/** Fire a standard or custom Meta event, e.g. trackEvent('Purchase', { value: 285000, currency: 'PKR' }). */
export function trackEvent(name, params) {
  if (typeof window.fbq === 'function') window.fbq('track', name, params || {});
}
