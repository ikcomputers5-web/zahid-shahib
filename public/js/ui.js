import { state, money, cartTotals, cartDetails, addToCart, toggleWishlist, isWished } from './state.js';
import { api } from './api.js';
import { navigate } from './nav.js';

/* ------------------------------------------------------------------ icons */

const paths = {
  arrowRight: '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M20 12H5"/><path d="M11 6l-6 6 6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  bag: '<path d="M6 8h12l1.2 12H4.8L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  heart: '<path d="M12 20s-7-4.35-7-9a4 4 0 017-2.65A4 4 0 0119 11c0 4.65-7 9-7 9z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  star: '<polygon points="12 2.5 15 9 22 9.9 17 14.6 18.2 21.6 12 18.3 5.8 21.6 7 14.6 2 9.9 9 9"/>',
  truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.4" cy="18" r="1.6"/>',
  shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  scissors: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 7.5L20 18M20 6L8 16.5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".9" fill="currentColor" stroke="none"/>',
  facebook: '<path d="M14.5 8.5H17V5.5h-2.5c-2 0-3.5 1.5-3.5 3.5v2H9v3h2v6h3v-6h2.5l.5-3H14v-1.5c0-.3.2-.5.5-.5z"/>',
  tiktok: '<path d="M14 4v9.5a3.5 3.5 0 11-3.5-3.5"/><path d="M14 4c.4 2.4 2 4 4.5 4.2"/>',
  youtube: '<rect x="2.5" y="6" width="19" height="12" rx="3.4"/><path d="M10.5 9.8l5 2.7-5 2.7V9.8z"/>',
  pinterest: '<circle cx="12" cy="12" r="9"/><path d="M9.5 20l2-7"/><path d="M9.8 12.5c-1-2.6.6-5 3-5 2 0 3.4 1.4 3.4 3.4 0 2.4-1.4 4-3.2 4-1 0-1.8-.8-1.5-1.8"/>',
  whatsapp: '<path d="M20 11.6a8 8 0 01-11.7 7L4 20l1.4-4.2A8 8 0 1120 11.6z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5.5 0 1-.4 1-1l-1.5-.8-1 .8c-1-.4-1.8-1.2-2.2-2.2l.8-1L10.8 9c-.6 0-1.8 0-1.8.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  phone: '<path d="M7 3.5h3l1.3 4-2 1.3a11 11 0 005 5l1.3-2 4 1.3v3A2.5 2.5 0 0117 18.5 14.5 14.5 0 013.5 5 2.5 2.5 0 016 3.5z"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M15 6.5V5a1.5 1.5 0 00-1.5-1.5H5A1.5 1.5 0 003.5 5v8.5A1.5 1.5 0 005 15h1.5"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21M11 8.5v5M8.5 11h5"/>',
  leaf: '<path d="M20 4C10 4 4 8 4 15a5 5 0 005 5c7 0 11-6 11-16z"/><path d="M4 20c3-6 7-8 12-10"/>',
  hanger: '<path d="M12 7a2 2 0 112-2"/><path d="M12 7v2l8 6.5H4L12 9z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8.5 10V8a3.5 3.5 0 017 0v2"/>',
  gift: '<rect x="3" y="8" width="18" height="12" rx="1"/><path d="M3 12h18M12 8v12"/><path d="M12 8S9 3.5 6.8 5.6C5 7.4 8.5 8 12 8zM12 8s3-4.5 5.2-2.4C19 7.4 15.5 8 12 8z"/>'
};

export function icon(name, cls = '') {
  const body = paths[name] || '';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* ---------------------------------------------------------------- helpers */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function nl2br(text) {
  return escapeHtml(text).replace(/\n/g, '<br />');
}

export function price(value) {
  return money(value);
}

export function stars(rating = 5, muted = false) {
  const full = Math.round(Number(rating) || 0);
  return `<span class="stars ${muted ? 'stars--muted' : ''}" aria-label="${rating} out of 5">${Array.from({ length: 5 })
    .map(() => icon('star'))
    .join('')}</span>`;
}

export function formatDate(value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', opts);
}

export function toast(message, type = 'info', timeout = 3800) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const symbol = type === 'error' ? 'close' : type === 'success' ? 'check' : 'sparkle';
  el.innerHTML = `${icon(symbol)}<span>${escapeHtml(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 320);
  }, timeout);
}

export async function copyText(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, 'success');
  } catch (_) {
    toast('Select and copy: ' + text, 'info');
  }
}

/* ------------------------------------------------------------------ chrome */

function navItems() {
  const cats = state.categories.filter((c) => c.slug !== 'new-drops');
  return [
    { label: 'New Drops', href: '/shop?drop=1', dot: true },
    ...cats.map((c) => ({ label: c.name.replace(' & Summer', ''), href: `/shop?category=${c.slug}` }))
  ];
}

export function renderChrome() {
  const s = state.settings;
  if (!s) return;

  const announcement = document.getElementById('announcement');
  if (announcement) {
    if (s.announcementActive && s.announcement && !state.announcementHidden) {
      announcement.classList.remove('is-hidden');
      announcement.innerHTML = `
        <span>${escapeHtml(s.announcement)}</span>
        <button class="announcement__close" type="button" data-close-announcement aria-label="Dismiss announcement">${icon('close')}</button>`;
    } else {
      announcement.classList.add('is-hidden');
      announcement.innerHTML = '';
    }
  }

  const header = document.getElementById('site-header');
  if (header) {
    const user = state.user;
    const fb = state.firebase || {};
    const showAuth = fb.enabled;
    const authBtn = !showAuth ? '' : user
      ? `<div class="auth-chip" style="display:flex;align-items:center;gap:8px">
          <a href="/account" class="auth-user" style="display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit">
            ${user.picture ? `<img src="${escapeHtml(user.picture)}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid var(--line)" />` : `<span style="width:28px;height:28px;border-radius:50%;background:var(--sand);display:grid;place-items:center;font-size:11px;font-weight:500">${escapeHtml((user.name||user.email||'U').charAt(0).toUpperCase())}</span>`}
            <span class="hide-sm" style="font-size:12px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(user.name || user.email)}</span>
          </a>
          <button class="icon-btn" type="button" data-sign-out aria-label="Sign out" title="Sign out" style="font-size:10px">↗</button>
        </div>`
      : `<button class="btn btn--sm" type="button" data-sign-in style="padding:8px 14px;font-size:11px;letter-spacing:.06em;display:flex;align-items:center;gap:8px"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in</button>`;

    header.innerHTML = `
      <div class="container header__inner">
        <button class="icon-btn menu-btn" type="button" data-open-nav aria-label="Open menu" aria-expanded="false">${icon('menu')}</button>
        <nav class="nav" aria-label="Primary">
          ${navItems()
            .map(
              (item) =>
                `<a class="nav__link" href="${item.href}">${escapeHtml(item.label)}${item.dot ? '<span class="dot"></span>' : ''}</a>`
            )
            .join('')}
        </nav>
        <a class="logo" href="/" aria-label="${escapeHtml(s.storeName)} home">
          <span class="logo__name">${escapeHtml(s.storeName)}</span>
          <span class="logo__meta logo__meta--long">Est. 2019 · Lahore</span>
        </a>
        <div class="header__actions">
          <button class="icon-btn" type="button" data-open-search aria-label="Search">${icon('search')}</button>
          <a class="icon-btn hide-sm" href="/wishlist" aria-label="Wishlist">${icon('heart')}<span class="count" data-wish-count>${state.wishlist.length}</span></a>
          <button class="icon-btn" type="button" data-open-cart aria-label="Open bag">${icon('bag')}<span class="count" data-cart-count>${cartDetails().count}</span></button>
          ${authBtn}
        </div>
      </div>`;
    const menuBtn = header.querySelector('[data-open-nav]');
    menuBtn?.addEventListener('click', openMobileNav);
  }

  renderMobileNav();
  renderFooter();
  refreshCounts();
}

function renderMobileNav() {
  const s = state.settings;
  const el = document.getElementById('mobile-nav');
  if (!el || !s) return;
  el.innerHTML = `
    <div class="mobile-nav__top">
      <span class="logo__name" style="font-size:18px">${escapeHtml(s.storeName)}</span>
      <button class="icon-btn" type="button" data-close-nav aria-label="Close menu">${icon('close')}</button>
    </div>
    <nav class="mobile-nav__links" aria-label="Mobile">
      ${navItems()
        .map((item) => `<a href="${item.href}">${escapeHtml(item.label)}<span class="arrow">${icon('arrowRight')}</span></a>`)
        .join('')}
      <a href="/about">Our story<span class="arrow">${icon('arrowRight')}</span></a>
      <a href="/track">Track order<span class="arrow">${icon('arrowRight')}</span></a>
      <a href="/quiz">Find your muse<span class="arrow">${icon('arrowRight')}</span></a>
      ${state.firebase?.enabled ? (state.user ? `<a href="/account">My orders<span class="arrow">${icon('arrowRight')}</span></a><button type="button" data-sign-out style="text-align:left;padding:14px 0;font-size:15px;color:var(--muted)">Sign out · ${escapeHtml(state.user.email)}</button>` : `<a href="#" data-sign-in>Sign in with Google<span class="arrow">${icon('arrowRight')}</span></a>`) : ''}
    </nav>
    <div class="mobile-nav__foot">
      <a href="tel:${escapeHtml(s.phone.replace(/\s/g, ''))}">${escapeHtml(s.phone)}</a>
      <a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a>
      <div class="mobile-nav__socials">
        <a href="${escapeHtml(s.instagram)}" target="_blank" rel="noopener">Instagram</a>
        <a href="${escapeHtml(s.facebook)}" target="_blank" rel="noopener">Facebook</a>
        <a href="${escapeHtml(s.tiktok)}" target="_blank" rel="noopener">TikTok</a>
      </div>
    </div>`;
  el.querySelector('[data-close-nav]')?.addEventListener('click', closeMobileNav);
}

export function openMobileNav() {
  const el = document.getElementById('mobile-nav');
  el?.classList.add('is-open');
  el?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');
}

export function closeMobileNav() {
  const el = document.getElementById('mobile-nav');
  el?.classList.remove('is-open');
  el?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-locked');
}

function socialList() {
  const s = state.settings;
  const list = [
    ['instagram', s.instagram],
    ['facebook', s.facebook],
    ['tiktok', s.tiktok],
    ['youtube', s.youtube],
    ['pinterest', s.pinterest]
  ].filter(([, url]) => url);
  return list
    .map(
      ([name, url]) =>
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="${name}" title="${name}">${icon(name)}</a>`
    )
    .join('');
}

export function renderFooter() {
  const s = state.settings;
  const el = document.getElementById('site-footer');
  if (!el || !s) return;
  const cats = state.categories.filter((c) => c.slug !== 'new-drops');
  el.innerHTML = `
    <div class="container">
      <div class="footer__grid">
        <div>
          <span class="logo__name">${escapeHtml(s.storeName)}</span>
          <p class="footer__blurb">${escapeHtml(s.tagline)}. Hand-embroidered lawn, luxe pret, formals and bridal — made in small runs in Lahore.</p>
          <div class="socials">${socialList()}</div>
        </div>
        <div class="footer__col">
          <h3>Shop</h3>
          <ul>
            ${cats.map((c) => `<li><a href="/shop?category=${c.slug}">${escapeHtml(c.name)}</a></li>`).join('')}
            <li><a href="/shop?drop=1">The Festive Drop</a></li>
          </ul>
        </div>
        <div class="footer__col">
          <h3>Care</h3>
          <ul>
            <li><a href="/track">Track your order</a></li>
            <li><a href="/contact">Contact us</a></li>
            <li><a href="/about">Our story</a></li>
            <li><a href="/quiz">Find your muse</a></li>
            <li><a href="/shop" data-size-guide>Size &amp; fit guide</a></li>
          </ul>
        </div>
        <div class="footer__col">
          <h3>Visit the atelier</h3>
          <div class="footer__contact">
            <div class="footer__contact-item">${icon('pin')}<span>${escapeHtml(s.address)}</span></div>
            <div class="footer__contact-item">${icon('clock')}<span>${escapeHtml(s.hours)}</span></div>
            <div class="footer__contact-item">${icon('phone')}<a href="tel:${escapeHtml(s.phone.replace(/\s/g, ''))}">${escapeHtml(s.phone)}</a></div>
            <div class="footer__contact-item">${icon('mail')}<a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a></div>
          </div>
        </div>
      </div>
      <div class="footer__bottom">
        <span>© ${new Date().getFullYear()} ${escapeHtml(s.storeName)} · Handmade in Pakistan</span>
        <div class="footer__pay">
          <span>Cash on delivery</span><span>Bank transfer</span><span>Visa</span><span>Mastercard</span>
        </div>
        <a class="footer__admin" href="/admin">${icon('lock')} Store admin</a>
      </div>
    </div>`;
}

export function refreshCounts() {
  const cart = cartDetails().count;
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = cart;
    el.style.display = cart ? '' : 'none';
  });
  document.querySelectorAll('[data-wish-count]').forEach((el) => {
    el.textContent = state.wishlist.length;
    el.style.display = state.wishlist.length ? '' : 'none';
  });
  document.querySelectorAll('[data-wish]').forEach((btn) => {
    const active = isWished(btn.dataset.wish);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

/* ---------------------------------------------------------------- scrim */

const scrim = () => document.getElementById('scrim');

function lockBody() {
  document.body.classList.add('is-locked');
}

function unlockIfIdle() {
  const drawerOpen = document.getElementById('cart-drawer')?.classList.contains('is-open');
  const filtersOpen = document.querySelector('.filters.is-open');
  if (!drawerOpen && !filtersOpen) document.body.classList.remove('is-locked');
}

export function showScrim(onClick) {
  const el = scrim();
  if (!el) return;
  el.hidden = false;
  el.onclick = onClick;
  requestAnimationFrame(() => el.classList.add('is-open'));
  lockBody();
}

export function hideScrim() {
  const el = scrim();
  if (!el) return;
  el.classList.remove('is-open');
  el.onclick = null;
  setTimeout(() => {
    if (!el.classList.contains('is-open')) el.hidden = true;
  }, 340);
  unlockIfIdle();
}

/* ------------------------------------------------------------ cart drawer */

export function renderCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  if (!drawer) return;
  const { lines, count } = cartDetails();
  const t = cartTotals();

  if (!lines.length) {
    drawer.innerHTML = `
      <div class="drawer__head">
        <div class="drawer__title">Your bag <span>0 items</span></div>
        <button class="drawer__close" type="button" data-close-cart aria-label="Close bag">${icon('close')}</button>
      </div>
      <div class="drawer__body">
        <div class="drawer__empty">
          ${icon('bag')}
          <h3 style="font-size:24px">Your bag is empty</h3>
          <p>Discover the festive drop — hand-embellished pieces in limited numbers.</p>
          <a class="btn btn--sm" href="/shop?drop=1">Shop the drop</a>
        </div>
      </div>`;
    return;
  }

  const remaining = Math.max(0, t.threshold - t.subtotal);
  const pct = t.threshold ? Math.min(100, (t.subtotal / t.threshold) * 100) : 100;

  drawer.innerHTML = `
    <div class="drawer__head">
      <div class="drawer__title">Your bag <span>${count} item${count > 1 ? 's' : ''}</span></div>
      <button class="drawer__close" type="button" data-close-cart aria-label="Close bag">${icon('close')}</button>
    </div>
    <div class="drawer__body">
      ${lines.map((line) => drawerItem(line)).join('')}
    </div>
    <div class="drawer__foot">
      <div class="ship-meter">
        <div class="ship-meter__text">
          <span>${remaining > 0 ? `Add <strong>${price(remaining)}</strong> for free delivery` : 'You have unlocked free delivery'}</span>
          <span>${Math.round(pct)}%</span>
        </div>
        <div class="ship-meter__track"><div class="ship-meter__fill" style="width:${pct}%"></div></div>
      </div>
      <div class="drawer__totals"><span>Subtotal</span><strong>${price(t.subtotal)}</strong></div>
      <div class="drawer__actions">
        <a class="btn btn--block" href="/cart">View bag &amp; checkout</a>
        <button class="btn btn--ghost btn--block" type="button" data-close-cart>Continue shopping</button>
      </div>
      <p class="drawer__note">${icon('shield')} Free alterations · 14-day exchange</p>
    </div>`;
}

function drawerItem(line) {
  return `
    <div class="drawer-item" data-line="${escapeHtml(line.slug)}|${escapeHtml(line.size)}|${escapeHtml(line.color)}">
      <a class="drawer-item__img" href="/product/${line.slug}"><img src="${line.product.images[0]}" alt="${escapeHtml(line.product.name)}" loading="lazy" /></a>
      <div class="drawer-item__body">
        <a class="drawer-item__name" href="/product/${line.slug}">${escapeHtml(line.product.name)}</a>
        <span class="drawer-item__meta">${escapeHtml(line.size)}${line.color ? ' · ' + escapeHtml(line.color) : ''}</span>
        <div class="drawer-item__qty">
          <button type="button" data-line-qty="${escapeHtml(line.slug)}|${escapeHtml(line.size)}|${escapeHtml(line.color)}" data-delta="-1" aria-label="Decrease quantity">${icon('minus')}</button>
          <span>${line.qty}</span>
          <button type="button" data-line-qty="${escapeHtml(line.slug)}|${escapeHtml(line.size)}|${escapeHtml(line.color)}" data-delta="1" aria-label="Increase quantity">${icon('plus')}</button>
        </div>
      </div>
      <div class="drawer-item__right">
        <span>${price(line.lineTotal)}</span>
        <button class="drawer-item__remove" type="button" data-line-remove="${escapeHtml(line.slug)}|${escapeHtml(line.size)}|${escapeHtml(line.color)}">Remove</button>
      </div>
    </div>`;
}

export function openCart() {
  closeMobileNav();
  renderCartDrawer();
  const drawer = document.getElementById('cart-drawer');
  drawer?.classList.add('is-open');
  drawer?.setAttribute('aria-hidden', 'false');
  showScrim(closeCart);
}

export function closeCart() {
  const drawer = document.getElementById('cart-drawer');
  drawer?.classList.remove('is-open');
  drawer?.setAttribute('aria-hidden', 'true');
  hideScrim();
}

/* -------------------------------------------------------------- search UI */

let searchBound = false;

export function openSearch() {
  let root = document.getElementById('search-root');
  if (!root) return;
  root.innerHTML = `
    <div class="search-panel" role="dialog" aria-modal="true" aria-label="Search the collection">
      <div class="search-panel__top">
        <form class="search-panel__form" data-search-form>
          ${icon('search')}
          <input type="search" name="q" placeholder="Search pieces, fabrics, collections…" autocomplete="off" aria-label="Search" />
        </form>
        <button class="search-panel__close" type="button" data-close-search aria-label="Close search">${icon('close')}</button>
      </div>
      <div class="search-panel__body">
        <div class="search-suggest">
          <span>Try</span>
          ${['Bridal', 'Lawn', 'Emerald', 'Jhumka', 'Chiffon', 'Unstitched']
            .map((term) => `<button class="chip" type="button" data-search-term="${term}">${term}</button>`)
            .join('')}
        </div>
        <div class="search-results" data-search-results></div>
      </div>
    </div>`;

  const panel = root.querySelector('.search-panel');
  requestAnimationFrame(() => panel.classList.add('is-open'));
  const input = panel.querySelector('input');
  setTimeout(() => input.focus(), 120);
  document.body.classList.add('is-locked');

  const results = panel.querySelector('[data-search-results]');
  const run = debounce(async (term) => {
    if (!term.trim()) {
      results.innerHTML = `<p class="search-results__empty">Start typing to search the atelier.</p>`;
      return;
    }
    results.innerHTML = `<p class="search-results__empty">Searching…</p>`;
    try {
      const { products } = await api.products(`?q=${encodeURIComponent(term)}&max=8`);
      results.innerHTML = products.length
        ? products.map((p) => productCard(p)).join('')
        : `<p class="search-results__empty">No pieces match “${escapeHtml(term)}”. Try “lawn”, “bridal” or “dupatta”.</p>`;
      refreshCounts();
    } catch (_) {
      results.innerHTML = `<p class="search-results__empty">Search is unavailable right now.</p>`;
    }
  }, 250);

  if (!searchBound) {
    searchBound = true;
  }
  panel.addEventListener('click', (e) => {
    const term = e.target.closest('[data-search-term]')?.dataset.searchTerm;
    if (term) {
      input.value = term;
      run(term);
    }
    if (e.target.closest('[data-close-search]')) closeSearch();
    if (e.target.closest('a')) closeSearch();
  });
  panel.querySelector('[data-search-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    closeSearch();
    navigate(`/shop?q=${encodeURIComponent(q)}`);
  });
  input.addEventListener('input', () => run(input.value));
  run('');
}

export function closeSearch() {
  const panel = document.querySelector('.search-panel');
  if (!panel) return;
  panel.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  setTimeout(() => {
    document.getElementById('search-root').innerHTML = '';
  }, 320);
}

export function debounce(fn, wait = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* ------------------------------------------------------------------ modal */

export function openModal(html, { size = '' } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return null;
  root.innerHTML = `
    <div class="modal-wrap" role="dialog" aria-modal="true">
      <div class="modal-wrap__scrim" data-modal-close></div>
      <div class="modal ${size}">
        <button class="modal__close" type="button" data-modal-close aria-label="Close">${icon('close')}</button>
        ${html}
      </div>
    </div>`;
  document.body.classList.add('is-locked');
  const wrap = root.querySelector('.modal-wrap');
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-close]')) closeModal();
  });
  return wrap;
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = '';
  document.body.classList.remove('is-locked');
}

export function sizeGuideModal() {
  openModal(
    `<div style="padding:clamp(26px,3.5vw,42px)">
      <p class="eyebrow">Fit notes</p>
      <h2 style="font-size:32px;margin-top:10px">Size &amp; fit guide</h2>
      <p style="margin-top:10px;color:var(--muted);font-size:13px">Measurements in inches. Our stitched pieces run true to size; if you are between sizes, size up — alterations are on us.</p>
      <table class="size-guide-table">
        <thead><tr><th>Size</th><th>Bust</th><th>Waist</th><th>Hip</th><th>Shirt length</th></tr></thead>
        <tbody>
          <tr><td>XS</td><td>32</td><td>26</td><td>35</td><td>40</td></tr>
          <tr><td>S</td><td>34</td><td>28</td><td>37</td><td>41</td></tr>
          <tr><td>M</td><td>36</td><td>30</td><td>39</td><td>42</td></tr>
          <tr><td>L</td><td>38</td><td>32</td><td>41</td><td>43</td></tr>
          <tr><td>XL</td><td>40</td><td>34</td><td>43</td><td>44</td></tr>
        </tbody>
      </table>
      <p style="margin-top:18px;font-size:12px;color:var(--muted)">Need help? WhatsApp us on ${escapeHtml(state.settings?.phone || '')} — we reply in minutes during store hours.</p>
    </div>`,
    { size: 'modal--sm' }
  );
}

export function quickView(product) {
  if (!product) return;
  const wrap = openModal(`
    <div class="quickview">
      <div class="quickview__media"><img src="${product.images[0]}" alt="${escapeHtml(product.name)}" /></div>
      <div class="quickview__body">
        <span class="eyebrow eyebrow--plain">${escapeHtml(product.collection)}</span>
        <h2 class="quickview__title">${escapeHtml(product.name)}</h2>
        <p class="text-muted" style="font-size:13px;margin-top:-6px">${escapeHtml(product.subtitle)}</p>
        <div class="quickview__price">${price(product.price)} ${product.compareAt ? `<span class="was" style="text-decoration:line-through;color:var(--muted);font-size:12px;margin-left:6px">${price(product.compareAt)}</span>` : ''}</div>
        <p class="quickview__desc">${escapeHtml(product.description).slice(0, 190)}…</p>
        <form data-qv-form>
          <div class="pdp__option-head"><strong>Select size</strong><button type="button" data-size-guide>Size guide</button></div>
          <div class="sizes">
            ${product.sizes
              .map(
                (size, i) =>
                  `<button class="size ${i === 0 ? 'is-active' : ''}" type="button" data-qv-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`
              )
              .join('')}
          </div>
          <div style="display:flex;gap:8px;margin-top:18px">
            <button class="btn" type="submit" style="flex:1">Add to bag · ${price(product.price)}</button>
            <button class="btn btn--ghost" type="button" data-wish="${product.slug}" aria-label="Add to wishlist">${icon('heart')}</button>
          </div>
        </form>
        <a class="link-arrow" href="/product/${product.slug}" style="align-self:flex-start">View full details ${icon('arrowRight')}</a>
      </div>
    </div>`);

  let size = product.sizes[0];
  wrap.querySelectorAll('[data-qv-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('[data-qv-size]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      size = btn.dataset.qvSize;
    });
  });
  wrap.querySelector('[data-size-guide]')?.addEventListener('click', sizeGuideModal);
  wrap.querySelector('[data-qv-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addToCart(product, { size, qty: 1 });
    closeModal();
    openCart();
  });
  refreshCounts();
}

/* ---------------------------------------------------------- product card */

export function productCard(product, { compact = false } = {}) {
  if (!product) return '';
  const soldOut = (product.stock || 0) <= 0;
  const sale = product.compareAt && product.compareAt > product.price;
  const badges = [];
  if (soldOut) badges.push('<span class="badge badge--sold">Sold out</span>');
  if (product.isDrop && !soldOut) badges.push('<span class="badge badge--drop">Drop</span>');
  else if (product.isNew && !soldOut) badges.push('<span class="badge">New in</span>');
  if (sale && !soldOut) badges.push('<span class="badge badge--sale">Sale</span>');

  return `
    <article class="product-card ${soldOut ? 'product-card--sold' : ''}" data-product-card>
      <div class="product-card__media">
        <a href="/product/${product.slug}" aria-label="${escapeHtml(product.name)} — ${escapeHtml(product.subtitle)}">
          <img src="${product.images[0]}" alt="${escapeHtml(product.name)}" loading="lazy" />
          ${product.images[1] ? `<img class="is-alt" src="${product.images[1]}" alt="" loading="lazy" />` : ''}
        </a>
        <div class="product-card__badges">${badges.join('')}</div>
        <button class="wish-btn ${isWished(product.slug) ? 'is-active' : ''}" type="button" data-wish="${product.slug}" aria-label="Add ${escapeHtml(product.name)} to wishlist">${icon('heart')}</button>
        <button class="wish-btn" type="button" style="top:52px" data-qv="${product.slug}" aria-label="Quick view ${escapeHtml(product.name)}">${icon('zoom')}</button>
        ${
          soldOut
            ? ''
            : `<div class="quick-add">
                <select aria-label="Select size for ${escapeHtml(product.name)}" data-quick-size>
                  ${product.sizes.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
                </select>
                <button type="button" data-quick-add="${product.slug}">Add</button>
              </div>`
        }
      </div>
      <div class="product-card__body">
        <span class="product-card__collection">${escapeHtml(product.collection)}</span>
        <h3 class="product-card__name"><a href="/product/${product.slug}">${escapeHtml(product.name)}</a></h3>
        ${compact ? '' : `<p class="product-card__sub">${escapeHtml(product.subtitle)}</p>`}
        <div class="product-card__price">
          <span>${price(product.price)}</span>
          ${sale ? `<span class="was">${price(product.compareAt)}</span>` : ''}
        </div>
      </div>
    </article>`;
}

/* -------------------------------------------------------------- countdown */

export function countdownMarkup() {
  const settings = state.settings;
  const ends = new Date(settings?.dropEndsAt || 0).getTime();
  const expired = !ends || ends <= Date.now();
  return `
    <div class="drop-bar">
      <div class="drop-bar__left">
        <span class="drop-bar__label"><span class="pulse"></span> Drop closes in</span>
        <span class="drop-bar__name">${escapeHtml(settings?.dropTitle || 'The festive drop')}</span>
        ${
          expired
            ? '<span class="drop-bar__name" style="font-family:var(--sans);font-size:11px;letter-spacing:.18em;text-transform:uppercase">The drop has closed</span>'
            : `<div class="countdown" data-countdown aria-live="off">
                <div class="countdown__unit"><span class="countdown__num" data-cd="d">00</span><span class="countdown__lbl">days</span></div>
                <span class="countdown__sep">·</span>
                <div class="countdown__unit"><span class="countdown__num" data-cd="h">00</span><span class="countdown__lbl">hrs</span></div>
                <span class="countdown__sep">·</span>
                <div class="countdown__unit"><span class="countdown__num" data-cd="m">00</span><span class="countdown__lbl">min</span></div>
                <span class="countdown__sep">·</span>
                <div class="countdown__unit"><span class="countdown__num" data-cd="s">00</span><span class="countdown__lbl">sec</span></div>
              </div>`
        }
      </div>
      <a class="drop-bar__cta" href="/shop?drop=1">Shop the drop <span>${icon('arrowRight')}</span></a>
    </div>`;
}

export function startCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const ends = new Date(state.settings?.dropEndsAt || 0).getTime();
    if (!ends) return;
    const tick = () => {
      const diff = ends - Date.now();
      if (diff <= 0) {
        el.closest('.drop-bar__left')?.querySelector('.drop-bar__label')?.replaceChildren();
        el.innerHTML = '<span style="font-size:11px;letter-spacing:.18em;text-transform:uppercase">Drop closed</span>';
        clearInterval(el._timer);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const set = (key, val) => {
        const node = el.querySelector(`[data-cd="${key}"]`);
        if (node) node.textContent = String(val).padStart(2, '0');
      };
      set('d', d);
      set('h', h);
      set('m', m);
      set('s', s);
    };
    tick();
    clearInterval(el._timer);
    el._timer = setInterval(tick, 1000);
  });
}

/* ----------------------------------------------------------- reveal/scroll */

let observer;
export function setupReveal(scope = document) {
  if (!('IntersectionObserver' in window)) {
    scope.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    return;
  }
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.04 }
    );
  }
  scope.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => observer.observe(el));
}

/* --------------------------------------------------------- delivery dates */

export function deliveryEstimate() {
  const d = new Date();
  d.setDate(d.getDate() + 4);
  const start = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const end = new Date(d);
  end.setDate(end.getDate() + 2);
  return { start, end: end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) };
}

export function shippingSummary() {
  return state.settings?.freeShippingThreshold
    ? `Free delivery on orders above ${price(state.settings.freeShippingThreshold)}`
    : '';
}

export { paths as iconPaths };
