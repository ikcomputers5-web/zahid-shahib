const KEYS = {
  cart: 'ie_cart_v1',
  wishlist: 'ie_wishlist_v1',
  promo: 'ie_promo_v1',
  recent: 'ie_recent_v1',
  announcement: 'ie_announcement_v1'
};

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    /* storage may be unavailable */
  }
}

export const state = {
  settings: null,
  categories: [],
  products: [],
  promos: [],
  cart: readStore(KEYS.cart, []),
  wishlist: readStore(KEYS.wishlist, []),
  promo: readStore(KEYS.promo, null),
  recent: readStore(KEYS.recent, []),
  announcementHidden: readStore(KEYS.announcement, false)
};

const bus = new EventTarget();

export function emit(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, handler) {
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
}

/* --------------------------------------------------------------- helpers */

export function productBySlug(slug) {
  return state.products.find((p) => p.slug === slug);
}

export function money(value, withCurrency = true) {
  const symbol = withCurrency ? (state.settings?.currency || 'PKR') + ' ' : '';
  return symbol + Math.round(Number(value) || 0).toLocaleString('en-PK');
}

export function discountPercent(product) {
  if (!product?.compareAt || product.compareAt <= product.price) return 0;
  return Math.round(((product.compareAt - product.price) / product.compareAt) * 100);
}

/* ------------------------------------------------------------------ cart */

const cartKey = (item) => `${item.slug}|${item.size}|${item.color || ''}`;

function persistCart() {
  writeStore(KEYS.cart, state.cart);
  emit('cart', state.cart);
}

export function addToCart(product, { size, color, qty = 1 } = {}) {
  if (!product) return null;
  const item = {
    slug: product.slug,
    size: size || product.sizes[0],
    color: color || product.colors?.[0]?.name || '',
    qty: Math.max(1, Number(qty) || 1)
  };
  const existing = state.cart.find((line) => cartKey(line) === cartKey(item));
  const max = Math.max(1, product.stock || 20);
  if (existing) {
    existing.qty = Math.min(max, existing.qty + item.qty);
  } else {
    state.cart.push(item);
  }
  persistCart();
  return item;
}

export function updateCartQty(line, qty) {
  const target = state.cart.find((item) => cartKey(item) === cartKey(line));
  if (!target) return;
  const product = productBySlug(target.slug);
  const max = Math.max(1, product?.stock || 20);
  const next = Math.min(max, Math.max(0, Number(qty) || 0));
  if (next === 0) {
    removeFromCart(target);
    return;
  }
  target.qty = next;
  persistCart();
}

export function removeFromCart(line) {
  state.cart = state.cart.filter((item) => cartKey(item) !== cartKey(line));
  persistCart();
  revalidatePromo();
}

export function clearCart() {
  state.cart = [];
  persistCart();
  clearPromo(false);
}

export function cartDetails() {
  const lines = state.cart
    .map((item) => {
      const product = productBySlug(item.slug);
      if (!product) return null;
      return { ...item, product, lineTotal: product.price * item.qty };
    })
    .filter(Boolean);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { lines, count, subtotal };
}

export function cartTotals() {
  const { subtotal, count } = cartDetails();
  const settings = state.settings || {};
  const promo = state.promo;
  const discount =
    promo?.type === 'percent'
      ? Math.round((subtotal * promo.value) / 100)
      : promo?.type === 'fixed'
        ? Math.min(promo.value, subtotal)
        : 0;
  const freeShipping =
    (promo?.freeShipping && subtotal > 0) || subtotal >= (settings.freeShippingThreshold || 0) || subtotal === 0;
  const shipping = freeShipping ? 0 : settings.shippingFee || 0;
  return {
    subtotal,
    count,
    discount,
    shipping,
    freeShipping,
    total: Math.max(0, subtotal - discount) + shipping,
    threshold: settings.freeShippingThreshold || 0
  };
}

/* ----------------------------------------------------------------- promo */

export function setPromo(promo) {
  state.promo = promo;
  writeStore(KEYS.promo, promo);
  emit('promo', promo);
}

export function clearPromo(shouldEmit = true) {
  state.promo = null;
  writeStore(KEYS.promo, null);
  if (shouldEmit) emit('promo', null);
}

export function revalidatePromo() {
  const promo = state.promo;
  if (!promo) return;
  const subtotal = cartTotals().subtotal;
  const needsRemoval =
    (promo.minOrder && subtotal < promo.minOrder) ||
    (promo.type === 'percent' && subtotal === 0);
  if (needsRemoval) {
    clearPromo();
  }
}

/* -------------------------------------------------------------- wishlist */

export function isWished(slug) {
  return state.wishlist.includes(slug);
}

export function toggleWishlist(slug) {
  const exists = state.wishlist.includes(slug);
  state.wishlist = exists ? state.wishlist.filter((s) => s !== slug) : [slug, ...state.wishlist];
  writeStore(KEYS.wishlist, state.wishlist);
  emit('wishlist', state.wishlist);
  return !exists;
}

/* ---------------------------------------------------------------- recent */

export function pushRecent(slug) {
  state.recent = [slug, ...state.recent.filter((s) => s !== slug)].slice(0, 8);
  writeStore(KEYS.recent, state.recent);
}

/* ---------------------------------------------------------- announcement */

export function hideAnnouncement() {
  state.announcementHidden = true;
  writeStore(KEYS.announcement, true);
}

export function showAnnouncement() {
  state.announcementHidden = false;
  writeStore(KEYS.announcement, false);
}
