import { api } from './api.js';
import { state, addToCart, updateCartQty, removeFromCart, toggleWishlist, isWished, productBySlug, cartDetails, hideAnnouncement, showAnnouncement } from './state.js';
import { navigate } from './nav.js';
import { startRouter } from './router.js';
import {
  renderChrome,
  renderCartDrawer,
  refreshCounts,
  openCart,
  closeCart,
  openSearch,
  closeSearch,
  openMobileNav,
  closeMobileNav,
  closeModal,
  hideScrim,
  toast,
  copyText,
  quickView,
  sizeGuideModal,
  productCard
} from './ui.js';

const app = () => document.getElementById('app');

async function boot() {
  app().innerHTML = `<div class="boot"><div class="boot__mark">IE</div><span>Opening the atelier…</span></div>`;
  try {
    const data = await api.bootstrap();
    state.settings = data.settings;
    state.categories = data.categories || [];
    state.products = data.products || [];
    state.promos = data.activePromos || [];
    window.__storeName = data.settings.storeName;

    document.title = `${data.settings.storeName} — ${data.settings.tagline}`;
    renderChrome();
    startRouter();
    setupHeaderScroll();
    setupDelegates();
    setupKeys();
  } catch (err) {
    console.error(err);
    app().innerHTML = `
      <div class="container" style="padding-block:100px;text-align:center">
        <div class="boot__mark" style="color:var(--gold)">IE</div>
        <h1 style="font-size:2.4rem;margin-top:16px">The atelier is closed for a moment</h1>
        <p style="color:var(--muted);margin-top:12px">We could not reach the store. Please refresh the page.</p>
        <div style="margin-top:24px"><button class="btn" onclick="location.reload()">Try again</button></div>
      </div>`;
  }
}

function setupHeaderScroll() {
  const header = document.getElementById('site-header');
  const onScroll = () => header?.classList.toggle('is-stuck', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function setupDelegates() {
  const scrim = document.getElementById('scrim');
  const drawer = document.getElementById('cart-drawer');

  /* internal links */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/admin')) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;
    if (link.hasAttribute('data-size-guide')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (href.startsWith('/#')) return;
    e.preventDefault();
    closeMobileNav();
    navigate(href);
  });

  /* wishlist toggles (cards, pdp, drawer) */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wish]');
    if (!btn) return;
    e.preventDefault();
    const slug = btn.dataset.wish;
    const added = toggleWishlist(slug);
    const product = productBySlug(slug);
    toast(added ? `${product?.name || 'Piece'} saved to your wishlist` : 'Removed from your wishlist', added ? 'success' : 'info');
    refreshCounts();
    if (window.location.pathname === '/wishlist') {
      window.dispatchEvent(new Event('ie:navigate'));
    }
  });

  /* quick add from product cards */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-add]');
    if (!btn) return;
    e.preventDefault();
    const card = btn.closest('[data-product-card]');
    const size = card?.querySelector('[data-quick-size]')?.value;
    const product = productBySlug(btn.dataset.quickAdd);
    if (!product) return;
    addToCart(product, { size, qty: 1 });
    renderCartDrawer();
    refreshCounts();
    openCart();
  });

  /* quick view */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qv]');
    if (!btn) return;
    e.preventDefault();
    quickView(productBySlug(btn.dataset.qv));
  });

  /* copy buttons */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    copyText(btn.dataset.copy, `Code ${btn.dataset.copy} copied`);
  });

  /* cart drawer */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-cart]')) {
      e.preventDefault();
      openCart();
    }
    if (e.target.closest('[data-close-cart]')) {
      e.preventDefault();
      closeCart();
    }
    if (e.target.closest('[data-open-search]')) {
      e.preventDefault();
      openSearch();
    }
    if (e.target.closest('[data-close-search]')) {
      e.preventDefault();
      closeSearch();
    }
    if (e.target.closest('[data-open-nav]')) {
      e.preventDefault();
      openMobileNav();
    }
    if (e.target.closest('[data-close-nav]')) {
      e.preventDefault();
      closeMobileNav();
    }
    if (e.target.closest('[data-close-announcement]')) {
      hideAnnouncement();
      document.getElementById('announcement')?.classList.add('is-hidden');
    }
    if (e.target.closest('[data-size-guide]') && !e.target.closest('.modal')) {
      e.preventDefault();
      sizeGuideModal();
    }
  });

  /* drawer quantity controls */
  drawer?.addEventListener('click', (e) => {
    const qtyBtn = e.target.closest('[data-line-qty]');
    if (qtyBtn) {
      const [slug, size, color] = qtyBtn.dataset.lineQty.split('|');
      const line = state.cart.find((l) => l.slug === slug && l.size === size && l.color === color);
      updateCartQty({ slug, size, color }, (line?.qty || 1) + Number(qtyBtn.dataset.delta));
      renderCartDrawer();
      refreshCounts();
      window.dispatchEvent(new Event('ie:refresh-cart'));
      return;
    }
    const removeBtn = e.target.closest('[data-line-remove]');
    if (removeBtn) {
      const [slug, size, color] = removeBtn.dataset.lineRemove.split('|');
      removeFromCart({ slug, size, color });
      renderCartDrawer();
      refreshCounts();
      window.dispatchEvent(new Event('ie:refresh-cart'));
      toast('Removed from your bag');
    }
  });

  scrim?.addEventListener('click', () => {
    closeCart();
    hideScrim();
    document.body.classList.remove('is-locked');
    document.querySelector('.filters.is-open')?.classList.remove('is-open');
  });
}

function setupKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      closeModal();
      closeCart();
      closeMobileNav();
      hideScrim();
      document.body.classList.remove('is-locked');
    }
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (e.key === '/' && !typing) {
      e.preventDefault();
      openSearch();
    }
  });
}

boot();
