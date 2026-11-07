import { homePage, shopPage, newArrivalsPage, productPage, cartPage, checkoutPage, orderPage, trackPage, wishlistPage, aboutPage, contactPage, quizPage, accountPage, notFoundPage } from './pages.js';
import { closeCart, closeModal, closeSearch, closeMobileNav, hideScrim } from './ui.js';
import { trackPageView } from './pixel.js';
import { suitCategory } from './catalog.js';

const routes = [
  { pattern: /^\/$/, view: homePage, title: 'Quiet luxury, made in Pakistan' },
  { pattern: /^\/shop$/, view: shopPage, title: 'The Suit Collection' },
  { pattern: /^\/new-arrivals$/, view: newArrivalsPage, title: 'New Arrivals' },
  { pattern: /^\/product\/([^/]+)$/, view: productPage, title: 'Piece', keys: ['slug'] },
  { pattern: /^\/cart$/, view: cartPage, title: 'Your bag' },
  { pattern: /^\/checkout$/, view: checkoutPage, title: 'Checkout' },
  { pattern: /^\/order\/([^/]+)$/, view: orderPage, title: 'Your order', keys: ['number'] },
  { pattern: /^\/track$/, view: trackPage, title: 'Track your order' },
  { pattern: /^\/wishlist$/, view: wishlistPage, title: 'Your wishlist' },
  { pattern: /^\/about$/, view: aboutPage, title: 'Our story' },
  { pattern: /^\/contact$/, view: contactPage, title: 'Contact' },
  { pattern: /^\/quiz$/, view: quizPage, title: 'Find your muse' },
  { pattern: /^\/account$/, view: accountPage, title: 'My account' }
];

let booted = false;
let rendering = false;
// The inline pixel snippet in index.html already fires the initial PageView,
// so only fire again when the SPA navigates to a different path.
let lastTrackedPath = (window.location.pathname.replace(/\/+$/, '') || '/');

function cleanup() {
  if (typeof window.__ieCleanup === 'function') {
    try {
      window.__ieCleanup();
    } catch (_) {}
    window.__ieCleanup = null;
  }
  clearInterval(window.__ieHomeTimer);
  if (window.__ieCartListener) {
    window.removeEventListener('ie:refresh-cart', window.__ieCartListener);
    window.__ieCartListener = null;
  }
}

export async function renderRoute() {
  if (rendering) return;
  rendering = true;
  cleanup();
  closeSearch();
  closeModal();
  closeCart();
  closeMobileNav();
  hideScrim();
  document.body.classList.remove('is-locked');

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  let match = null;
  let params = {};

  for (const route of routes) {
    const found = route.pattern.exec(path);
    if (found) {
      match = route;
      (route.keys || []).forEach((key, i) => {
        params[key] = decodeURIComponent(found[i + 1]);
      });
      break;
    }
  }

  // Retired category URLs still work, but never expose an old category.
  const collectionAlias = /^\/collections\/([^/]+)$/.exec(path);
  const currentUrl = new URL(window.location.href);
  if (collectionAlias || (path === '/shop' && (currentUrl.searchParams.has('category') || currentUrl.searchParams.get('new') === '1'))) {
    const old = collectionAlias ? collectionAlias[1] : currentUrl.searchParams.get('category');
    const canonical = suitCategory(old);
    const newEdit = !collectionAlias && currentUrl.searchParams.get('new') === '1';
    const target = new URL(window.location.origin + (newEdit || old === 'new-drops' ? '/new-arrivals' : '/shop'));
    if (canonical) target.searchParams.set('category', canonical);
    const sort = currentUrl.searchParams.get('sort');
    if (target.pathname === '/new-arrivals' && ['price-asc', 'price-desc'].includes(sort)) target.searchParams.set('sort', sort);
    const destination = target.pathname + target.search;
    if (destination !== path + currentUrl.search) {
      window.location.replace(destination);
      rendering = false;
      return;
    }
  }

  const view = match ? match.view : notFoundPage;
  document.title = match
    ? `${match.title} · ${window.__storeName || 'Ismail Elegance'}`
    : `Page not found · ${window.__storeName || 'Ismail Elegance'}`;

  try {
    await view(params);
  } catch (err) {
    console.error(err);
    document.getElementById('app').innerHTML = `
      <div class="container" style="padding-block:90px;text-align:center">
        <p class="eyebrow" style="justify-content:center">A small hiccup</p>
        <h1 style="font-size:2.6rem;margin-top:12px">That page did not load</h1>
        <p style="color:var(--muted);margin-top:12px">${err.message || 'Please try again.'}</p>
        <div style="margin-top:24px"><a class="btn" href="/">Back to the atelier</a></div>
      </div>`;
  }

  if (lastTrackedPath !== path) {
    lastTrackedPath = path;
    trackPageView();
  }

  rendering = false;
}

export function startRouter() {
  if (!booted) {
    booted = true;
    window.addEventListener('popstate', () => {
      renderRoute();
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
    window.addEventListener('ie:navigate', () => renderRoute());
  }
  renderRoute();
}
