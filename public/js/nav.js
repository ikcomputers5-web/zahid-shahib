export function navigate(path, { replace = false, scroll = true } = {}) {
  if (!path) return;
  const current = window.location.pathname + window.location.search;
  if (path === current) {
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (replace) {
    history.replaceState({}, '', path);
  } else {
    history.pushState({}, '', path);
  }
  window.dispatchEvent(new CustomEvent('ie:navigate', { detail: { path } }));
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

export function queryParams() {
  return new URLSearchParams(window.location.search);
}

export function setQuery(params, { replace = true } = {}) {
  const search = new URLSearchParams(params).toString();
  const path = window.location.pathname + (search ? `?${search}` : '');
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
}
