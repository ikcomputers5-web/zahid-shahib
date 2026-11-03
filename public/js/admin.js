/* ==========================================================================
   Ismail Elegance — store admin
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CATEGORIES = [
  ['lawn', 'Lawn & Summer'],
  ['pret', 'Luxe Pret'],
  ['formals', 'Formals'],
  ['bridal', 'Bridal'],
  ['unstitched', 'Unstitched'],
  ['accessories', 'Accessories']
];

const ORDER_STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M15 6.5V5a1.5 1.5 0 00-1.5-1.5H5A1.5 1.5 0 003.5 5v8.5A1.5 1.5 0 005 15h1.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  external: '<path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>'
};

const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const money = (n) => `PKR ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;

/**
 * Tolerant number parsing — mirrors the server. Accepts "12,500", "PKR 12500",
 * "1 250" and Arabic-Indic digits so typing a price never fails silently.
 */
const parseNum = (value, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value == null) return fallback;
  const cleaned = String(value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d.,-]/g, '')
    .replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * A number field with − / + buttons.
 *
 * It is deliberately `type="text"` with `inputmode`: a native number input
 * rejects commas and many mobile keyboards, which is why an admin could not
 * change a price on a phone. The value is parsed tolerantly on submit, and
 * money fields are formatted with thousands separators on blur.
 */
const numField = ({
  name,
  label,
  value = '',
  min = 0,
  max = '',
  step = 1,
  placeholder = '',
  full = false,
  hint = '',
  required = false,
  money = false
}) => `
  <div class="field ${full ? 'field--full' : ''}">
    <label>${label}</label>
    <div class="numfield" data-numfield data-min="${min}" data-max="${max}" data-step-size="${step}">
      <button class="numfield__btn" type="button" data-step="-${step}" aria-label="Decrease ${label}">−</button>
      <input name="${name}" type="text" inputmode="${money ? 'decimal' : 'numeric'}" autocomplete="off"
        ${money ? 'data-format="money"' : ''} value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} />
      <button class="numfield__btn" type="button" data-step="${step}" aria-label="Increase ${label}">+</button>
    </div>
    ${hint ? `<span class="field__hint">${hint}</span>` : ''}
  </div>`;
const date = (value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  value ? new Date(value).toLocaleDateString('en-GB', opts) : '—';
const dateTime = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const store = { settings: null, products: null, promos: null, orders: null, messages: null, subscribers: null, stats: null };

/* -------------------------------------------------------------------- api */

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/admin' + path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_) {}
  if (res.status === 401) {
    showLogin();
    throw new Error('Please sign in again.');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(message, type = 'info') {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

/* -------------------------------------------------------- firebase (admin) */

let firebaseReady = { enabled: false, config: null };

async function initFirebaseForAdmin() {
  try {
    const res = await fetch('/api/admin/firebase-config');
    const data = await res.json();
    firebaseReady = data;
    const statusEl = document.getElementById('firebase-status');
    const btn = document.getElementById('admin-google-btn');
    if (!data.enabled || !data.config) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#6a2f2f">Not configured — set FIREBASE_* in .env to enable.</span>';
      if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
      return;
    }
    // init firebase compat
    if (window.firebase && window.firebase.initializeApp) {
      if (!window.firebase.apps.length) window.firebase.initializeApp(data.config);
      const note = document.getElementById('firebase-status');
      if (note) note.textContent = 'Ready.';
    }
  } catch (e) {
    console.warn('[admin] firebase config failed', e);
  }
}

async function handleAdminGoogleLogin() {
  const note = $('[data-login-note]') || document.getElementById('admin-google-note');
  const btn = document.getElementById('admin-google-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Opening Google…'; }
  if (note) { note.className = 'login__note'; note.textContent = 'Opening Google sign-in…'; }
  try {
    if (!firebaseReady.enabled) throw new Error('Firebase is not configured on the server. Add FIREBASE_API_KEY etc. to your .env and restart.');
    const auth = window.firebase.auth();
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await auth.signInWithPopup(provider);
    const idToken = await result.user.getIdToken();
    if (note) note.textContent = 'Verifying with the server…';
    const res = await fetch('/api/admin/firebase-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ idToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Google sign-in was not accepted by the server.');
    await showShell();
    toast(`Welcome, ${result.user.displayName || result.user.email}!`, 'success');
  } catch (err) {
    const msg = err.message || 'Google sign-in failed.';
    if (msg.includes('popup-closed-by-user')) {
      if (note) { note.textContent = 'Sign-in cancelled.'; }
    } else if (msg.includes('unauthorized-domain')) {
      if (note) { note.className = 'login__note is-error'; note.textContent = 'This domain is not authorized in Firebase Console → Authentication → Settings → Authorized domains.'; }
      toast(msg, 'error');
    } else {
      if (note) { note.className = 'login__note is-error'; note.textContent = msg; }
      toast(msg, 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google'; }
  }
}

/* ----------------------------------------------------------------- login */

function showLogin() {
  $('#boot').hidden = true;
  $('#shell').hidden = true;
  $('#login').hidden = false;
  setTimeout(() => $('#admin-password')?.focus(), 80);
}

async function init() {
  await initFirebaseForAdmin();
  try {
    const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.authenticated) {
      await showShell();
    } else {
      showLogin();
    }
  } catch (_) {
    showLogin();
    const note = $('[data-login-note]');
    if (note) note.textContent = 'Could not reach the server. Please refresh.';
  }
}

document.getElementById('admin-google-btn')?.addEventListener('click', handleAdminGoogleLogin);

$('[data-login-form]')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const note = $('[data-login-note]');
  const password = new FormData(e.target).get('password');
  note.className = 'login__note';
  note.textContent = 'Signing in…';
  try {
    await api('/login', { method: 'POST', body: { password } });
    e.target.reset();
    await showShell();
  } catch (err) {
    note.className = 'login__note is-error';
    note.textContent = err.message;
  }
});

async function showShell() {
  $('#boot').hidden = true;
  $('#login').hidden = true;
  $('#shell').hidden = false;
  await Promise.all([loadSettings(), loadMessages()]);
  const initial = (location.hash || '#dashboard').replace('#', '');
  go(initial);
}

/* ------------------------------------------------------------- navigation */

const VIEWS = {
  dashboard: { title: 'Dashboard', eyebrow: 'Overview', render: renderDashboard },
  products: { title: 'Products', eyebrow: 'Catalogue', render: renderProducts },
  orders: { title: 'Orders', eyebrow: 'Operations', render: renderOrders },
  promos: { title: 'Promo codes', eyebrow: 'Marketing', render: renderPromos },
  storefront: { title: 'Storefront', eyebrow: 'Content', render: renderStorefront },
  contact: { title: 'Contact & social', eyebrow: 'Content', render: renderContact },
  messages: { title: 'Messages', eyebrow: 'Conversations', render: renderMessages },
  audience: { title: 'Audience', eyebrow: 'Marketing', render: renderAudience },
  settings: { title: 'Settings', eyebrow: 'Configuration', render: renderSettings }
};

let currentView = 'dashboard';

async function go(view) {
  if (!VIEWS[view]) view = 'dashboard';
  currentView = view;
  location.hash = view;
  $$('#side-nav [data-view]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === view));
  $('#view-title').textContent = VIEWS[view].title;
  $('#view-eyebrow').textContent = VIEWS[view].eyebrow;
  $('#view').innerHTML = `<div class="empty">Loading…</div>`;
  $('#side')?.classList.remove('is-open');
  try {
    await VIEWS[view].render();
  } catch (err) {
    $('#view').innerHTML = `<div class="card"><div class="empty"><strong>Could not load this view</strong>${esc(err.message)}</div></div>`;
  }
}

$('#side-nav')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-view]');
  if (btn) go(btn.dataset.view);
});

window.addEventListener('hashchange', () => {
  const view = location.hash.replace('#', '');
  if (view && view !== currentView) go(view);
});

function setSide(open) {
  const side = $('#side');
  if (!side) return;
  side.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);
  const btn = $('[data-menu]');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}

const closeSide = () => setSide(false);

$('[data-menu]')?.addEventListener('click', () => setSide(!$('#side')?.classList.contains('is-open')));
$$('[data-close-menu]').forEach((el) => el.addEventListener('click', closeSide));

document.addEventListener('click', (e) => {
  const side = $('#side');
  if (!side?.classList.contains('is-open')) return;
  if (e.target.closest('#side') || e.target.closest('[data-menu]')) return;
  closeSide();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSide();
});

/* Large touch targets: close the drawer after choosing a view. */
$('#side-nav')?.addEventListener('click', (e) => {
  if (e.target.closest('[data-view]')) closeSide();
});

$('[data-logout]')?.addEventListener('click', async () => {
  try {
    await api('/logout', { method: 'POST' });
  } catch (_) {}
  try { if (window.firebase?.auth) await window.firebase.auth().signOut(); } catch {}
  showLogin();
});

$('[data-quick="product"]')?.addEventListener('click', () => productModal());
$('[data-quick="promo"]')?.addEventListener('click', () => promoModal());

/* ------------------------------------------------------------- load cache */

async function loadSettings(force = false) {
  if (store.settings && !force) return store.settings;
  const { settings } = await api('/settings');
  store.settings = settings;
  return settings;
}

async function loadMessages(force = false) {
  if (store.messages && !force) return store.messages;
  const { messages } = await api('/messages');
  store.messages = messages;
  updateMessageBadge();
  return messages;
}

function updateMessageBadge() {
  const unread = (store.messages || []).filter((m) => !m.read).length;
  const badge = $('[data-badge="messages"]');
  if (!badge) return;
  badge.textContent = unread;
  badge.classList.toggle('is-visible', unread > 0);
}

/* ------------------------------------------------------------- dashboard */

async function renderDashboard() {
  const stats = await api('/stats');
  store.stats = stats;
  const max = Math.max(1, ...stats.days.map((d) => d.revenue));

  const cards = [
    { label: 'Revenue', value: money(stats.revenue), meta: `${stats.orders} paid & open orders`, icon: '◆' },
    { label: 'Orders', value: stats.orders, meta: `${stats.pending} awaiting confirmation`, icon: '❑' },
    { label: 'Average order', value: money(stats.avgOrder), meta: `${stats.units} pieces sold`, icon: '✂' },
    { label: 'Audience', value: stats.subscribers, meta: `${stats.unreadMessages} unread messages`, icon: '✉' }
  ];

  $('#view').innerHTML = `
    <div class="stats-grid">
      ${cards
        .map(
          (c) => `<div class="stat"><span class="stat__icon">${c.icon}</span><div class="stat__label">${c.label}</div><div class="stat__value">${esc(c.value)}</div><div class="stat__meta">${esc(c.meta)}</div></div>`
        )
        .join('')}
    </div>

    <div class="dash-grid">
      <div class="card">
        <div class="card__head">
          <div><h2>Revenue, last 14 days</h2><p>Only orders that are not cancelled</p></div>
          <span class="tag tag--gold">${money(stats.days.reduce((s, d) => s + d.revenue, 0))}</span>
        </div>
        <div class="chart">
          <div class="bars" style="display:flex;align-items:flex-end;gap:6px;height:180px">
            ${stats.days
              .map(
                (d) => `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%" title="${esc(d.label)} · ${money(d.revenue)} · ${d.orders} orders">
                  <div style="height:${Math.max(2, (d.revenue / max) * 100)}%;background:${d.revenue ? 'var(--gold)' : 'var(--sand)'};min-height:2px;transition:height .4s"></div>
                </div>`
              )
              .join('')}
          </div>
          <div class="chart__labels">
            ${stats.days.map((d, i) => `<span style="flex:1;text-align:center">${i % 2 === 0 ? esc(d.label) : '·'}</span>`).join('')}
          </div>
        </div>
        <div class="legend"><span><i></i> Revenue</span><span><i class="muted"></i> No orders</span></div>
      </div>

      <div class="card">
        <div class="card__head"><div><h2>Top pieces</h2><p>By revenue, all time</p></div></div>
        ${
          stats.topProducts.length
            ? `<div class="mini-list">${stats.topProducts
                .map(
                  (p) => `<div class="mini-row">
                    <div class="mini-row__img"><img src="${esc(p.image)}" alt="" /></div>
                    <div class="mini-row__body"><strong>${esc(p.name)}</strong><span>${p.qty} sold</span></div>
                    <div class="mini-row__value">${money(p.revenue)}</div>
                  </div>`
                )
                .join('')}</div>`
            : `<div class="empty"><strong>No sales yet</strong>Share a promo code to get the first order in.</div>`
        }
      </div>
    </div>

    <div class="dash-grid dash-grid--bottom">
      <div class="card">
        <div class="card__head"><div><h2>Recent orders</h2><p>Latest activity from the storefront</p></div><button class="abtn abtn--ghost abtn--sm" data-go-orders>All orders</button></div>
        ${
          stats.recentOrders.length
            ? `<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>
              ${stats.recentOrders
                .map(
                  (o) => `<tr class="is-clickable" data-open-order="${o.id}"><td><strong>${esc(o.number)}</strong><br /><span class="tag">${date(o.createdAt, { day: '2-digit', month: 'short' })}</span></td><td>${esc(o.customer.name)}<br /><span style="color:var(--muted);font-size:10px">${esc(o.customer.city)}</span></td><td>${money(o.total)}</td><td><span class="status status--${esc(o.status)}">${esc(o.status)}</span></td></tr>`
                )
                .join('')}
            </tbody></table></div>`
            : `<div class="empty"><strong>No orders yet</strong>Your dashboard will fill up as soon as the first order lands.</div>`
        }
      </div>

      <div class="card">
        <div class="card__head"><div><h2>Needs attention</h2><p>Stock, messages &amp; the drop</p></div></div>
        <div class="mini-list">
          <div class="mini-row"><div class="mini-row__body"><strong>${stats.lowStock} low-stock pieces</strong><span>5 units or fewer</span></div><button class="abtn abtn--ghost abtn--sm" data-go-products>Restock</button></div>
          <div class="mini-row"><div class="mini-row__body"><strong>${stats.unreadMessages} unread messages</strong><span>From the contact form</span></div><button class="abtn abtn--ghost abtn--sm" data-go-messages>Open inbox</button></div>
          <div class="mini-row"><div class="mini-row__body"><strong>${stats.dropProducts} pieces in the drop</strong><span>${esc(store.settings?.dropTitle || 'Festive drop')}</span></div><button class="abtn abtn--ghost abtn--sm" data-go-storefront>Edit drop</button></div>
          <div class="mini-row"><div class="mini-row__body"><strong>${stats.products} live products</strong><span>${stats.promos.filter((p) => p.active).length} active promo codes</span></div><button class="abtn abtn--ghost abtn--sm" data-go-promos>Promos</button></div>
        </div>
        ${
          stats.lowStockList.length
            ? `<div style="margin-top:16px"><div class="section-note" style="margin-bottom:8px">Low stock</div>${stats.lowStockList
                .slice(0, 4)
                .map(
                  (p) => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(p.name)}</span><span class="tag tag--wine">${p.stock} left</span></div>`
                )
                .join('')}</div>`
            : ''
        }
      </div>
    </div>`;

  $$('[data-go-orders]').forEach((b) => b.addEventListener('click', () => go('orders')));
  $$('[data-go-products]').forEach((b) => b.addEventListener('click', () => go('products')));
  $$('[data-go-messages]').forEach((b) => b.addEventListener('click', () => go('messages')));
  $$('[data-go-storefront]').forEach((b) => b.addEventListener('click', () => go('storefront')));
  $$('[data-go-promos]').forEach((b) => b.addEventListener('click', () => go('promos')));
  $$('[data-open-order]').forEach((row) => row.addEventListener('click', () => orderModal(row.dataset.openOrder)));
}

/* --------------------------------------------------------------- products */

async function renderProducts() {
  const { products } = await api('/products');
  store.products = products;
  let query = '';
  let filter = 'all';

  const matches = () => {
    let list = [...products];
    if (filter === 'drop') list = list.filter((p) => p.isDrop);
    if (filter === 'new') list = list.filter((p) => p.isNew);
    if (filter === 'sale') list = list.filter((p) => p.compareAt);
    if (filter === 'low') list = list.filter((p) => p.stock > 0 && p.stock <= 5);
    if (filter === 'out') list = list.filter((p) => p.stock <= 0);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) => `${p.name} ${p.category} ${p.collection} ${p.slug}`.toLowerCase().includes(q));
    }
    return list;
  };

  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="search-input"><span>${icon('search')}</span><input type="search" placeholder="Search products…" data-product-search /></div>
      <div class="filter-pills" data-product-filter>
        ${[
          ['all', 'All'],
          ['drop', 'Drop'],
          ['new', 'New in'],
          ['sale', 'On sale'],
          ['low', 'Low stock'],
          ['out', 'Sold out']
        ]
          .map(([key, label]) => `<button type="button" class="${key === 'all' ? 'is-active' : ''}" data-filter="${key}">${label}</button>`)
          .join('')}
      </div>
      <button class="abtn" type="button" data-add-product style="margin-left:auto">+ Add product</button>
    </div>
    <div class="table-wrap" data-product-table></div>`;

  const paint = () => {
    const list = matches();
    $('[data-product-table]').innerHTML = `
      <table class="data">
        <thead>
          <tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Flags</th><th style="text-align:right">Actions</th></tr>
        </thead>
        <tbody>
          ${
            list.length
              ? list
                  .map(
                    (p) => `
            <tr>
              <td>
                <div class="cell-product">
                  <div class="cell-product__img"><img src="${esc(p.images[0])}" alt="" /></div>
                  <div><strong>${esc(p.name)}</strong><span>${esc(p.collection)} · ${esc(p.pieces || '')}</span></div>
                </div>
              </td>
              <td><span class="tag">${esc(CATEGORIES.find(([slug]) => slug === p.category)?.[1] || p.category)}</span></td>
              <td>${money(p.price)}${p.compareAt ? `<br /><span style="font-size:10px;color:var(--muted);text-decoration:line-through">${money(p.compareAt)}</span>` : ''}</td>
              <td><span class="tag ${p.stock <= 0 ? 'tag--wine' : p.stock <= 5 ? 'tag--gold' : 'tag--green'}">${p.stock}</span></td>
              <td style="white-space:nowrap">
                ${p.isDrop ? '<span class="tag tag--ink">Drop</span> ' : ''}
                ${p.isNew ? '<span class="tag tag--gold">New</span> ' : ''}
                ${p.featured ? '<span class="tag">Featured</span>' : ''}
              </td>
              <td>
                <div class="row-actions">
                  <a class="iconbtn" href="/product/${esc(p.slug)}" target="_blank" rel="noopener" title="View in store">${icon('eye')}</a>
                  <button class="iconbtn" type="button" data-edit="${p.id}" title="Edit">${icon('edit')}</button>
                  <button class="iconbtn" type="button" data-dup="${p.id}" title="Duplicate">${icon('copy')}</button>
                  <button class="iconbtn iconbtn--danger" type="button" data-del="${p.id}" title="Delete">${icon('trash')}</button>
                </div>
              </td>
            </tr>`
                  )
                  .join('')
              : `<tr><td colspan="6"><div class="empty"><strong>No products match</strong>Try another search or clear the filter.</div></td></tr>`
          }
        </tbody>
      </table>`;

    $$('[data-edit]').forEach((btn) => btn.addEventListener('click', () => productModal(products.find((p) => p.id === btn.dataset.edit))));
    $$('[data-dup]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const original = products.find((p) => p.id === btn.dataset.dup);
        if (!original) return;
        try {
          await api('/products', {
            method: 'POST',
            body: { ...original, name: `${original.name} (copy)`, slug: '', isNew: true, isDrop: false, featured: false, stock: 0 }
          });
          toast('Product duplicated — update the stock before publishing.', 'success');
          renderProducts();
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
    $$('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const product = products.find((p) => p.id === btn.dataset.del);
        if (!product) return;
        if (!confirm(`Delete “${product.name}” permanently? This cannot be undone.`)) return;
        try {
          await api(`/products/${product.id}`, { method: 'DELETE' });
          toast('Product deleted.');
          renderProducts();
        } catch (err) {
          toast(err.message, 'error');
        }
      })
    );
  };

  $('[data-product-search]').addEventListener('input', (e) => {
    query = e.target.value;
    paint();
  });
  $('[data-product-filter]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.dataset.filter;
    $$('[data-product-filter] button').forEach((b) => b.classList.toggle('is-active', b === btn));
    paint();
  });
  $('[data-add-product]').addEventListener('click', () => productModal());
  paint();
}

function productModal(product = null) {
  const p = product || {
    name: '',
    subtitle: '',
    category: 'pret',
    collection: 'Everyday Atelier',
    price: '',
    compareAt: '',
    stock: 10,
    sizes: ['S', 'M', 'L'],
    colors: [{ name: '', hex: '#c9b79c' }],
    images: [],
    fabric: '',
    pieces: '2 Piece',
    description: '',
    details: [],
    care: [],
    tags: [],
    isNew: true,
    isDrop: false,
    featured: false
  };

  const colourRows = (p.colors && p.colors.length ? p.colors : [{ name: '', hex: '#c9b79c' }])
    .map(
      (c) => `<div class="chiprow" data-colour-row>
        <input class="chiprow__name" data-colour-name value="${esc(c.name || '')}" placeholder="Ivory Gold" />
        <input class="chiprow__hex" data-colour-hex type="color" value="${esc(c.hex || '#c9b79c')}" aria-label="Colour swatch" />
        <button class="chiprow__del" type="button" data-remove-row aria-label="Remove colour">✕</button>
      </div>`
    )
    .join('');

  const sizeChips = (p.sizes || [])
    .map(
      (s) => `<span class="chip" data-size="${esc(s)}">${esc(s)}<button type="button" data-remove-size aria-label="Remove size ${esc(s)}">✕</button></span>`
    )
    .join('');

  const lineRows = (list) =>
    (list || [])
      .map(
        (row) => `<div class="chiprow chiprow--stack" data-line-row>
          <textarea data-line-input rows="2" placeholder="One point per row">${esc(row)}</textarea>
          <button class="chiprow__del" type="button" data-remove-row aria-label="Remove line">✕</button>
        </div>`
      )
      .join('');

  const body = `
    <form id="product-form">
      <div class="modal__body">
        <div class="form-grid">
          <div class="field"><label>Name *</label><input name="name" value="${esc(p.name)}" required placeholder="Noor Jahan" /></div>
          <div class="field"><label>Subtitle</label><input name="subtitle" value="${esc(p.subtitle || '')}" placeholder="Ivory hand-embellished bridal pishwas" /></div>
          <div class="field"><label>Category</label>
            <select name="category">${CATEGORIES.map(([slug, label]) => `<option value="${slug}" ${p.category === slug ? 'selected' : ''}>${label}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Collection</label><input name="collection" value="${esc(p.collection || '')}" placeholder="Zar Gul · Festive '26" /></div>
        </div>

        <div class="subsection">
          <h3 class="subsection__title">Price &amp; stock</h3>
          <p class="subsection__note">Tap − or + to adjust, or type the number. Commas are fine (12,500).</p>
          <div class="form-grid form-grid--3">
            ${numField({ name: 'price', label: 'Price (PKR) *', value: p.price ?? '', step: 500, min: 0, required: true, money: true })}
            ${numField({ name: 'compareAt', label: 'Compare-at (optional)', value: p.compareAt ?? '', step: 500, min: 0, hint: 'Shown struck through', money: true })}
            ${numField({ name: 'stock', label: 'Stock', value: p.stock ?? 0, step: 1, min: 0, hint: '0 = sold out' })}
          </div>
        </div>

        <div class="subsection">
          <h3 class="subsection__title">Details</h3>
          <div class="form-grid">
            <div class="field"><label>Pieces</label><input name="pieces" value="${esc(p.pieces || '')}" placeholder="3 Piece" /></div>
            <div class="field"><label>Fabric</label><input name="fabric" value="${esc(p.fabric || '')}" placeholder="Raw silk with net dupatta" /></div>
          </div>
        </div>

        <div class="field field--full" style="margin-top:14px">
          <label>Sizes</label>
          <div class="chips" data-size-list>${sizeChips || '<span class="field__hint">No sizes yet — add one below.</span>'}</div>
          <div class="chiprow" style="margin-top:6px">
            <input class="chiprow__name" data-size-input placeholder="e.g. M, XL, Unstitched" />
            <button class="abtn abtn--ghost abtn--sm" type="button" data-add-size>+ Add size</button>
          </div>
        </div>

        <div class="field field--full">
          <label>Colours</label>
          <div class="repeater" data-colour-list>${colourRows}</div>
          <button class="abtn abtn--ghost abtn--sm" type="button" data-add-colour style="margin-top:8px">+ Add colour</button>
        </div>

        <div class="field field--full">
          <label>Images *</label>
          <textarea name="images" data-images hidden>${esc((p.images || []).join('\n'))}</textarea>
          <div class="picker">
            <div class="picker__list" data-image-list></div>
            <div class="picker__add">
              <input type="url" data-image-url placeholder="Image URL — /images/products/example.jpg" />
              <button class="abtn abtn--ghost abtn--sm" type="button" data-add-image>Add</button>
            </div>
            <div class="image-upload">
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple data-upload />
              <span class="field__hint">Pick one or more JPG/PNG/WEBP (max 6 MB each) — every file is added to the gallery.</span>
            </div>
          </div>
        </div>

        <div class="field field--full"><label>Description</label><textarea name="description" placeholder="Tell the story of the piece…">${esc(p.description || '')}</textarea></div>

        <div class="field field--full">
          <label>Details (product page bullet points)</label>
          <div class="repeater" data-line-list="details">${lineRows(p.details)}</div>
          <button class="abtn abtn--ghost abtn--sm" type="button" data-add-line="details" style="margin-top:8px">+ Add detail</button>
        </div>

        <div class="field field--full">
          <label>Care</label>
          <div class="repeater" data-line-list="care">${lineRows(p.care)}</div>
          <button class="abtn abtn--ghost abtn--sm" type="button" data-add-line="care" style="margin-top:8px">+ Add care note</button>
        </div>

        <div class="field field--full"><label>Tags (comma separated)</label><input name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="bridal, hand-embellished" /></div>
        <div class="field field--full">
          <label>Visibility</label>
          <label class="switch"><input type="checkbox" name="isNew" ${p.isNew ? 'checked' : ''} /> Show “New in” badge</label>
          <label class="switch"><input type="checkbox" name="isDrop" ${p.isDrop ? 'checked' : ''} /> Part of the current drop</label>
          <label class="switch"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''} /> Feature in homepage rails</label>
        </div>
      </div>
      <div class="modal__foot">
        <button class="abtn abtn--ghost" type="button" data-close-modal>Cancel</button>
        <button class="abtn" type="submit" data-submit>${product ? 'Save changes' : 'Create product'}</button>
      </div>
    </form>`;

  const modal = showModal({
    title: product ? `Edit ${esc(product.name)}` : 'New product',
    subtitle: product ? 'Changes appear in the store immediately' : 'Add a piece to the catalogue',
    html: body
  });

  const form = $('#product-form', modal);
  const imagesArea = $('[data-images]', form);
  const imageList = $('[data-image-list]', form);
  const sizeList = $('[data-size-list]', form);
  const sizeInput = $('[data-size-input]', form);

  /* ----- images: read / write the hidden textarea, then repaint the gallery */
  const imageUrls = () => imagesArea.value.split('\n').map((u) => u.trim()).filter(Boolean);
  const setImageUrls = (urls) => {
    imagesArea.value = urls.join('\n');
    paintImages();
  };
  const paintImages = () => {
    const urls = imageUrls();
    imageList.innerHTML = urls.length
      ? urls
          .map(
            (url, i) => `<div class="image-row" data-image-row="${i}">
              <span class="image-row__thumb"><img src="${esc(url)}" alt="" loading="lazy" /></span>
              <span class="image-row__url" title="${esc(url)}">${esc(url)}</span>
              <span class="image-row__actions">
                <button type="button" data-image-move="${i}:-1" aria-label="Move image up" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" data-image-move="${i}:1" aria-label="Move image down" ${i === urls.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" data-image-delete="${i}" aria-label="Remove image">✕</button>
              </span>
            </div>`
          )
          .join('')
      : '<p class="field__hint">No images yet — add a URL or upload a file.</p>';
  };
  paintImages();
  imagesArea.addEventListener('input', paintImages);

  imageList.addEventListener('click', (e) => {
    const del = e.target.closest('[data-image-delete]');
    if (del) {
      const urls = imageUrls();
      urls.splice(Number(del.dataset.imageDelete), 1);
      setImageUrls(urls);
      return;
    }
    const move = e.target.closest('[data-image-move]');
    if (move) {
      const [index, delta] = move.dataset.imageMove.split(':').map(Number);
      const urls = imageUrls();
      const target = index + delta;
      if (target < 0 || target >= urls.length) return;
      [urls[index], urls[target]] = [urls[target], urls[index]];
      setImageUrls(urls);
    }
  });

  const addImageUrl = () => {
    const input = $('[data-image-url]', form);
    const url = input.value.trim();
    if (!url) return;
    setImageUrls([...imageUrls(), url]);
    input.value = '';
  };
  $('[data-add-image]', form).addEventListener('click', addImageUrl);
  $('[data-image-url]', form).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addImageUrl();
    }
  });

  /* ----- multi-file upload: every selected file is uploaded and appended */
  $('[data-upload]', form).addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    const label = e.target;
    label.disabled = true;
    let added = 0;
    for (const file of files) {
      if (file.size > 6 * 1024 * 1024) {
        toast(`${file.name} is larger than 6 MB — skipped.`, 'error');
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const res = await api('/upload', { method: 'POST', body: { dataUrl } });
        setImageUrls([...imageUrls(), res.url]);
        added += 1;
      } catch (err) {
        toast(`${file.name}: ${err.message}`, 'error');
      }
    }
    label.disabled = false;
    label.value = '';
    if (added) toast(`${added} image${added > 1 ? 's' : ''} uploaded.`, 'success');
  });

  /* ----- sizes */
  const currentSizes = () => [...sizeList.querySelectorAll('[data-size]')].map((chip) => chip.dataset.size);
  const paintSizes = (sizes) => {
    sizeList.innerHTML = sizes.length
      ? sizes
          .map(
            (size) => `<span class="chip" data-size="${esc(size)}">${esc(size)}<button type="button" data-remove-size aria-label="Remove size ${esc(size)}">✕</button></span>`
          )
          .join('')
      : '<span class="field__hint">No sizes yet — add one below.</span>';
  };
  const addSize = () => {
    const value = sizeInput.value.trim();
    if (!value) return;
    const sizes = currentSizes();
    value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((size) => {
        if (!sizes.includes(size)) sizes.push(size);
      });
    paintSizes(sizes);
    sizeInput.value = '';
  };
  $('[data-add-size]', form).addEventListener('click', addSize);
  sizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSize();
    }
  });
  sizeList.addEventListener('click', (e) => {
    if (e.target.closest('[data-remove-size]')) {
      paintSizes(currentSizes().filter((size) => size !== e.target.closest('[data-size]').dataset.size));
    }
  });

  /* ----- repeatable rows (colours, details, care) */
  const colourList = $('[data-colour-list]', form);
  const colourRowHtml = () => `<div class="chiprow" data-colour-row>
      <input class="chiprow__name" data-colour-name placeholder="Ivory Gold" />
      <input class="chiprow__hex" data-colour-hex type="color" value="#c9b79c" aria-label="Colour swatch" />
      <button class="chiprow__del" type="button" data-remove-row aria-label="Remove colour">✕</button>
    </div>`;
  $('[data-add-colour]', form).addEventListener('click', () => {
    colourList.insertAdjacentHTML('beforeend', colourRowHtml());
    colourList.lastElementChild?.querySelector('[data-colour-name]')?.focus();
  });

  const lineRowHtml = () => `<div class="chiprow chiprow--stack" data-line-row>
      <textarea data-line-input rows="2" placeholder="One point per row"></textarea>
      <button class="chiprow__del" type="button" data-remove-row aria-label="Remove line">✕</button>
    </div>`;
  $$('[data-add-line]', form).forEach((btn) =>
    btn.addEventListener('click', () => {
      const list = $(`[data-line-list="${btn.dataset.addLine}"]`, form);
      list.insertAdjacentHTML('beforeend', lineRowHtml());
      list.lastElementChild?.querySelector('textarea')?.focus();
    })
  );

  form.addEventListener('click', (e) => {
    const del = e.target.closest('[data-remove-row]');
    if (!del) return;
    const row = del.closest('[data-colour-row], [data-line-row]');
    const list = row?.parentElement;
    row?.remove();
    if (list && (list.dataset.colourList !== undefined || list.dataset.lineList) && !list.children.length) {
      list.insertAdjacentHTML('beforeend', list.dataset.colourList !== undefined ? colourRowHtml() : lineRowHtml());
    }
  });

  const collectColours = () =>
    $$('[data-colour-row]', form)
      .map((row) => ({
        name: $('[data-colour-name]', row).value.trim(),
        hex: $('[data-colour-hex]', row).value.trim() || '#c9b79c'
      }))
      .filter((c) => c.name);

  const collectLines = (kind) =>
    $$(`[data-line-list="${kind}"] [data-line-input]`, form)
      .map((el) => el.value.trim())
      .filter(Boolean);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = $('[data-submit]', form);
    const price = parseNum(new FormData(form).get('price'), NaN);
    if (!Number.isFinite(price) || price <= 0) {
      toast('Enter a price greater than 0 — digits only are fine (12,500 works).', 'error');
      $('[name="price"]', form)?.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Saving…';
    const fd = new FormData(form);
    const compareAt = parseNum(fd.get('compareAt'), 0);
    const payload = {
      name: fd.get('name'),
      subtitle: fd.get('subtitle'),
      category: fd.get('category'),
      collection: fd.get('collection'),
      price,
      compareAt: compareAt > 0 ? compareAt : null,
      stock: Math.max(0, Math.round(parseNum(fd.get('stock'), 0))),
      pieces: fd.get('pieces'),
      fabric: fd.get('fabric'),
      sizes: currentSizes(),
      images: imageUrls(),
      description: fd.get('description'),
      details: collectLines('details'),
      care: collectLines('care'),
      tags: fd.get('tags'),
      colors: collectColours(),
      isNew: fd.get('isNew') === 'on',
      isDrop: fd.get('isDrop') === 'on',
      featured: fd.get('featured') === 'on',
      slug: product?.slug || ''
    };
    try {
      if (product) {
        await api(`/products/${product.id}`, { method: 'PUT', body: payload });
        toast('Product updated.', 'success');
      } else {
        await api('/products', { method: 'POST', body: payload });
        toast('Product created.', 'success');
      }
      closeModal();
      if (currentView === 'products') renderProducts();
      if (currentView === 'dashboard') renderDashboard();
      store.stats = null;
    } catch (err) {
      toast(err.message, 'error');
      submit.disabled = false;
      submit.textContent = product ? 'Save changes' : 'Create product';
    }
  });
}

/* ---------------------------------------------------------------- promos */

async function renderPromos() {
  const { promos } = await api('/promos');
  store.promos = promos;

  $('#view').innerHTML = `
    <div class="toolbar">
      <div style="font-size:12px;color:var(--muted)">Codes are checked live at checkout — percentage, flat amount or free delivery.</div>
      <button class="abtn" type="button" data-add-promo style="margin-left:auto">+ New promo code</button>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Code</th><th>Reward</th><th>Minimum</th><th>Used</th><th>Expires</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>
          ${
            promos.length
              ? promos
                  .map(
                    (p) => `
            <tr>
              <td><strong style="letter-spacing:.08em">${esc(p.code)}</strong><br /><span style="font-size:10px;color:var(--muted)">${esc(p.description)}</span></td>
              <td>${p.type === 'percent' ? `${p.value}% off` : p.type === 'fixed' ? `${money(p.value)} off` : 'Free delivery'}</td>
              <td>${p.minOrder ? money(p.minOrder) : '—'}</td>
              <td>${p.used}${p.maxUses ? ` / ${p.maxUses}` : ''}</td>
              <td>${p.expiresAt ? date(p.expiresAt) : 'No expiry'}</td>
              <td><span class="tag ${p.active ? 'tag--green' : 'tag--wine'}">${p.active ? 'Active' : 'Paused'}</span></td>
              <td><div class="row-actions">
                <button class="iconbtn" type="button" data-copy="${esc(p.code)}" title="Copy code">${icon('copy')}</button>
                <button class="iconbtn" type="button" data-edit-promo="${p.id}" title="Edit">${icon('edit')}</button>
                <button class="iconbtn iconbtn--danger" type="button" data-del-promo="${p.id}" title="Delete">${icon('trash')}</button>
              </div></td>
            </tr>`
                  )
                  .join('')
              : `<tr><td colspan="7"><div class="empty"><strong>No promo codes yet</strong>Create one to reward your first customers.</div></td></tr>`
          }
        </tbody>
      </table>
    </div>
    <div class="help-box"><strong>Tip:</strong> the storefront already advertises <strong>WELCOME10</strong>. The active codes are also shown as quick-apply chips in the shopping bag.</div>`;

  $('[data-add-promo]').addEventListener('click', () => promoModal());
  $$('[data-edit-promo]').forEach((b) => b.addEventListener('click', () => promoModal(promos.find((p) => p.id === b.dataset.editPromo))));
  $$('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        toast(`${b.dataset.copy} copied.`, 'success');
      } catch (_) {
        toast(b.dataset.copy);
      }
    })
  );
  $$('[data-del-promo]').forEach((b) =>
    b.addEventListener('click', async () => {
      const promo = promos.find((p) => p.id === b.dataset.delPromo);
      if (!promo || !confirm(`Delete promo code ${promo.code}?`)) return;
      try {
        await api(`/promos/${promo.id}`, { method: 'DELETE' });
        toast('Promo code deleted.');
        renderPromos();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

function promoModal(promo = null) {
  const p = promo || { code: '', type: 'percent', value: 10, minOrder: 0, maxUses: 0, active: true, expiresAt: null, description: '' };
  const html = `
    <form id="promo-form">
      <div class="modal__body">
        <div class="form-grid">
          <div class="field"><label>Code *</label><input name="code" value="${esc(p.code)}" placeholder="EID25" style="text-transform:uppercase" required /></div>
          <div class="field"><label>Reward type</label>
            <select name="type">
              <option value="percent" ${p.type === 'percent' ? 'selected' : ''}>Percentage off</option>
              <option value="fixed" ${p.type === 'fixed' ? 'selected' : ''}>Flat amount off</option>
              <option value="shipping" ${p.type === 'shipping' ? 'selected' : ''}>Free delivery</option>
            </select>
          </div>
          ${numField({ name: 'value', label: 'Value (% or PKR)', value: p.value, step: 5, min: 0 })}
          ${numField({ name: 'minOrder', label: 'Minimum order (PKR)', value: p.minOrder, step: 500, min: 0, money: true })}
          ${numField({ name: 'maxUses', label: 'Usage limit (0 = unlimited)', value: p.maxUses, step: 1, min: 0 })}
          <div class="field"><label>Expires on (optional)</label><input name="expiresAt" type="date" value="${p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : ''}" /></div>
          <div class="field field--full"><label>Customer-facing description</label><input name="description" value="${esc(p.description || '')}" placeholder="25% off orders above PKR 15,000" /></div>
          <div class="field field--full"><label class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} /> Active (customers can use this code)</label></div>
        </div>
      </div>
      <div class="modal__foot">
        <button class="abtn abtn--ghost" type="button" data-close-modal>Cancel</button>
        <button class="abtn" type="submit">${promo ? 'Save promo' : 'Create promo'}</button>
      </div>
    </form>`;

  const modal = showModal({ title: promo ? `Edit ${esc(promo.code)}` : 'New promo code', subtitle: 'Applied at checkout, validated on the server', html, size: 'modal--md' });
  $('#promo-form', modal).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      code: fd.get('code'),
      type: fd.get('type'),
      value: Math.max(0, parseNum(fd.get('value'), 0)),
      minOrder: Math.max(0, parseNum(fd.get('minOrder'), 0)),
      maxUses: Math.max(0, Math.round(parseNum(fd.get('maxUses'), 0))),
      expiresAt: fd.get('expiresAt') || null,
      description: fd.get('description'),
      active: fd.get('active') === 'on'
    };
    try {
      if (promo) await api(`/promos/${promo.id}`, { method: 'PUT', body: payload });
      else await api('/promos', { method: 'POST', body: payload });
      toast(promo ? 'Promo updated.' : 'Promo created.', 'success');
      closeModal();
      renderPromos();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ---------------------------------------------------------------- orders */

async function renderOrders() {
  const { orders } = await api('/orders');
  store.orders = orders;
  let filter = 'all';

  const paint = () => {
    const list = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
    $('#view').innerHTML = `
      <div class="toolbar">
        <div class="filter-pills" data-order-filter>
          <button type="button" class="${filter === 'all' ? 'is-active' : ''}" data-status="all">All (${orders.length})</button>
          ${ORDER_STATUSES.map(
            (status) => `<button type="button" class="${filter === status ? 'is-active' : ''}" data-status="${status}">${status} (${orders.filter((o) => o.status === status).length})</button>`
          ).join('')}
        </div>
        <div class="search-input" style="margin-left:auto"><span>${icon('search')}</span><input type="search" placeholder="Order number or customer…" data-order-search /></div>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>
            ${
              list.length
                ? list
                    .map(
                      (o) => `<tr class="is-clickable" data-order-row="${o.id}">
                        <td><strong>${esc(o.number)}</strong><br /><span style="font-size:10px;color:var(--muted)">${date(o.createdAt)}</span></td>
                        <td>${esc(o.customer.name)}<br /><span style="font-size:10px;color:var(--muted)">${esc(o.customer.city)} · ${esc(o.customer.phone)}</span></td>
                        <td>${o.items.reduce((n, i) => n + i.qty, 0)}</td>
                        <td>${money(o.total)}${o.promoCode ? `<br /><span class="tag tag--gold">${esc(o.promoCode)}</span>` : ''}</td>
                        <td><span class="tag">${o.payment === 'cod' ? 'COD' : o.payment === 'bank' ? 'Bank' : 'Card'}</span></td>
                        <td><span class="status status--${esc(o.status)}">${esc(o.status)}</span></td>
                      </tr>`
                    )
                    .join('')
                : `<tr><td colspan="6"><div class="empty"><strong>No orders here</strong>Orders will appear as soon as customers check out.</div></td></tr>`
            }
          </tbody>
        </table>
      </div>`;

    $$('[data-order-filter] button').forEach((btn) =>
      btn.addEventListener('click', () => {
        filter = btn.dataset.status;
        paint();
      })
    );
    $$('[data-order-row]').forEach((row) => row.addEventListener('click', () => orderModal(row.dataset.orderRow)));
    $('[data-order-search]')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('[data-order-row]').forEach((row) => {
        const order = orders.find((o) => o.id === row.dataset.orderRow);
        const haystack = `${order.number} ${order.customer.name} ${order.customer.phone} ${order.customer.city}`.toLowerCase();
        row.style.display = haystack.includes(q) ? '' : 'none';
      });
    });
  };

  paint();
}

function orderModal(id) {
  const order = (store.orders || []).find((o) => o.id === id) || store.stats?.recentOrders?.find((o) => o.id === id);
  if (!order) return;
  const payments = { cod: 'Cash on delivery', bank: 'Bank transfer', card: 'Card on delivery' };

  const html = `
    <div class="modal__body">
      <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)">Order</div>
          <h3 style="font-family:var(--serif);font-size:30px;font-weight:400">${esc(order.number)}</h3>
          <div style="font-size:11px;color:var(--muted)">${dateTime(order.createdAt)}</div>
        </div>
        <span class="status status--${esc(order.status)}">${esc(order.status)}</span>
      </div>

      <div class="form-grid" style="margin-top:18px">
        <div class="card" style="padding:16px">
          <div class="section-note" style="margin-bottom:8px">Customer</div>
          <strong style="font-size:13px">${esc(order.customer.name)}</strong><br />
          <span style="font-size:12px;color:var(--ink-soft)">${esc(order.customer.phone)}</span><br />
          <span style="font-size:12px;color:var(--ink-soft)">${esc(order.customer.email || 'No email')}</span>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:10px;line-height:1.7;white-space:pre-line">${esc(order.customer.address)}
${esc(order.customer.city)}</div>
          ${order.customer.notes ? `<div class="help-box" style="margin-top:10px"><strong>Note:</strong> ${esc(order.customer.notes)}</div>` : ''}
        </div>
        <div class="card" style="padding:16px">
          <div class="section-note" style="margin-bottom:8px">Payment</div>
          <div style="font-size:12.5px">${esc(payments[order.payment] || order.payment)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">${order.promoCode ? `Promo ${esc(order.promoCode)} · − ${money(order.discount)}` : 'No promo code'}</div>
          <div style="margin-top:12px;font-size:12px;line-height:1.9">
            <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
            ${order.discount ? `<div style="display:flex;justify-content:space-between;color:var(--green)"><span>Discount</span><span>− ${money(order.discount)}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between"><span>Delivery</span><span>${order.shipping ? money(order.shipping) : 'Free'}</span></div>
            <div style="display:flex;justify-content:space-between;font-weight:500;font-size:14px;border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><span>Total</span><span>${money(order.total)}</span></div>
          </div>
        </div>
      </div>

      <div style="margin-top:16px">
        <div class="section-note" style="margin-bottom:8px">Pieces (${order.items.length})</div>
        ${order.items
          .map(
            (item) => `<div class="mini-row">
              <div class="mini-row__img"><img src="${esc(item.image)}" alt="" /></div>
              <div class="mini-row__body"><strong>${esc(item.name)}</strong><span>${esc(item.size)}${item.color ? ' · ' + esc(item.color) : ''} · Qty ${item.qty}</span></div>
              <div class="mini-row__value">${money(item.lineTotal)}</div>
            </div>`
          )
          .join('')}
      </div>

      <div style="margin-top:18px">
        <div class="section-note" style="margin-bottom:8px">Update status</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="order-status-select" style="padding:10px 12px;border:1px solid var(--line-dark);background:var(--paper);font-size:12px">
            ${ORDER_STATUSES.map((s) => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <input id="order-status-note" placeholder="Optional note for the timeline" style="flex:1;min-width:180px;padding:10px 12px;border:1px solid var(--line-dark);background:var(--paper);font-size:12px" />
          <button class="abtn" type="button" data-save-status>Update order</button>
        </div>
        ${
          order.timeline?.length
            ? `<div style="margin-top:14px;display:grid;gap:8px;font-size:11.5px;color:var(--ink-soft)">
                ${order.timeline
                  .slice()
                  .reverse()
                  .map((t) => `<div style="display:flex;gap:10px"><span class="tag">${esc(t.status)}</span><span>${dateTime(t.at)}${t.note ? ' · ' + esc(t.note) : ''}</span></div>`)
                  .join('')}
              </div>`
            : ''
        }
      </div>
    </div>
    <div class="modal__foot">
      <button class="abtn abtn--danger" type="button" data-delete-order>Delete order</button>
      <a class="abtn abtn--ghost" href="https://wa.me/${esc(String(order.customer.phone).replace(/\D/g, '').replace(/^0/, '92'))}" target="_blank" rel="noopener">WhatsApp customer</a>
      <button class="abtn abtn--ghost" type="button" data-close-modal>Close</button>
    </div>`;

  const modal = showModal({ title: 'Order details', subtitle: 'Confirm, pack and ship from here', html });
  $('[data-save-status]', modal).addEventListener('click', async (e) => {
    const status = $('#order-status-select', modal).value;
    const note = $('#order-status-note', modal).value;
    try {
      await api(`/orders/${order.id}`, { method: 'PATCH', body: { status, note } });
      toast('Order updated.', 'success');
      store.orders = null;
      closeModal();
      if (currentView === 'orders') renderOrders();
      else if (currentView === 'dashboard') renderDashboard();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('[data-delete-order]', modal).addEventListener('click', async () => {
    if (!confirm(`Delete order ${order.number}? This cannot be undone.`)) return;
    try {
      await api(`/orders/${order.id}`, { method: 'DELETE' });
      toast('Order deleted.');
      store.orders = null;
      closeModal();
      if (currentView === 'orders') renderOrders();
      else renderDashboard();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ------------------------------------------------------------ storefront */

async function renderStorefront() {
  const settings = await loadSettings();
  const slides = JSON.parse(JSON.stringify(settings.heroSlides || []));
  const values = JSON.parse(JSON.stringify(settings.values || []));

  $('#view').innerHTML = `
    <form id="storefront-form">
      <div class="card">
        <h2 class="section-title">Brand</h2>
        <p class="section-note">The name and line that sit in the header, footer and browser tab.</p>
        <div class="form-grid">
          <div class="field"><label>Store name</label><input name="storeName" value="${esc(settings.storeName)}" /></div>
          <div class="field"><label>Tagline</label><input name="tagline" value="${esc(settings.tagline)}" /></div>
          <div class="field field--full"><label>Announcement bar</label><input name="announcement" value="${esc(settings.announcement)}" placeholder="Free delivery on orders above PKR 10,000" /></div>
          <div class="field field--full"><label class="switch"><input type="checkbox" name="announcementActive" ${settings.announcementActive ? 'checked' : ''} /> Show the announcement bar</label></div>
        </div>
      </div>

      <div class="card">
        <div class="card__head" style="margin-bottom:6px"><div><h2 class="section-title">Hero slides</h2><p class="section-note" style="margin:0">Up to eight. The first slide loads first.</p></div><button class="abtn abtn--ghost abtn--sm" type="button" data-add-slide>+ Add slide</button></div>
        <div data-slides>
          ${slides
            .map(
              (slide, i) => `
            <div class="card" style="background:var(--cream);margin-top:12px" data-slide="${i}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong style="font-family:var(--serif);font-size:18px;font-weight:500">Slide ${i + 1}</strong><button class="iconbtn iconbtn--danger" type="button" data-remove-slide="${i}">${icon('trash')}</button></div>
              <div class="form-grid">
                <div class="field field--full"><label>Image URL</label><input name="s-image" value="${esc(slide.image)}" placeholder="/images/products/hero.jpg" />
                  <div class="image-upload"><input type="file" accept="image/*" data-slide-upload="${i}" /><span class="field__hint">or upload a new image</span></div>
                </div>
                <div class="field"><label>Kicker</label><input name="s-kicker" value="${esc(slide.kicker)}" /></div>
                <div class="field"><label>Button label</label><input name="s-cta" value="${esc(slide.ctaLabel)}" /></div>
                <div class="field"><label>Headline (use Enter for a line break)</label><textarea name="s-title" style="min-height:70px">${esc(slide.title)}</textarea></div>
                <div class="field"><label>Subtitle</label><textarea name="s-sub" style="min-height:70px">${esc(slide.subtitle)}</textarea></div>
                <div class="field field--full"><label>Button link</label><input name="s-href" value="${esc(slide.ctaHref)}" placeholder="/shop?drop=1" /></div>
              </div>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="card">
        <h2 class="section-title">The drop</h2>
        <p class="section-note">Drives the live countdown on the homepage and the “drops” filter in the shop.</p>
        <div class="form-grid">
          <div class="field"><label>Drop title</label><input name="dropTitle" value="${esc(settings.dropTitle)}" /></div>
          <div class="field"><label>Countdown label</label><input name="dropSubtitle" value="${esc(settings.dropSubtitle)}" /></div>
          <div class="field"><label>Drop closes at</label><input name="dropEndsAt" type="datetime-local" value="${settings.dropEndsAt ? new Date(settings.dropEndsAt).toISOString().slice(0, 16) : ''}" /></div>
          <div class="field"><label>Instagram handle / URL</label><input value="${esc(settings.instagram)}" disabled /></div>
          <div class="field field--full"><label>Drop note</label><textarea name="dropNote">${esc(settings.dropNote)}</textarea></div>
        </div>
        <div class="help-box">When the timer hits zero the storefront shows “Drop closed” automatically — no action needed.</div>
      </div>

      <div class="card">
        <h2 class="section-title">The story</h2>
        <p class="section-note">Shown on the About page and the homepage editorial block.</p>
        <div class="form-grid">
          <div class="field field--full"><label>Heading</label><input name="aboutHeading" value="${esc(settings.aboutHeading)}" /></div>
          <div class="field field--full"><label>Story (blank line = new paragraph)</label><textarea name="aboutText" style="min-height:130px">${esc(settings.aboutText)}</textarea></div>
          <div class="field field--full"><label>Story image</label><input name="aboutImage" value="${esc(settings.aboutImage)}" /><div class="image-upload"><input type="file" accept="image/*" data-about-upload /><span class="field__hint">Upload a wide image of the atelier</span></div></div>
        </div>
        <div class="card__head" style="margin:18px 0 8px">
          <div><h3 class="section-title" style="font-size:19px">House values</h3><p class="section-note" style="margin:0">Up to six cards. Add or remove as many as you show on the site.</p></div>
          <button class="abtn abtn--ghost abtn--sm" type="button" data-add-value>+ Add value</button>
        </div>
        <div class="repeater repeater--grid" data-value-list>
          ${values
            .map(
              (v, i) => `<div class="value-card" data-value-row>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Value ${i + 1}</strong><button class="iconbtn iconbtn--danger" type="button" data-remove-row aria-label="Remove value">✕</button></div>
                <div class="field"><label>Title</label><input data-value-title value="${esc(v.title)}" /></div>
                <div class="field"><label>Text</label><textarea data-value-text style="min-height:70px">${esc(v.text)}</textarea></div>
              </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="card">
        <h2 class="section-title">Instagram strip</h2>
        <p class="section-note">One image URL per line — shown in the “from the atelier” grid on the homepage.</p>
        <div class="field"><textarea name="instagramPosts" style="min-height:130px">${esc((settings.instagramPosts || []).join('\n'))}</textarea></div>
      </div>

      <div class="form-actions" style="border-top:0">
        <a class="abtn abtn--ghost" href="/" target="_blank" rel="noopener">Preview storefront ${icon('external')}</a>
        <button class="abtn" type="submit">Save storefront</button>
      </div>
    </form>`;

  const form = $('#storefront-form');

  const valueList = $('[data-value-list]', form);
  const renumberValues = () =>
    $$('[data-value-row]', form).forEach((row, i) => {
      const label = $('strong', row);
      if (label) label.textContent = `Value ${i + 1}`;
    });
  const collectValues = () =>
    $$('[data-value-row]', form)
      .map((row) => ({
        title: $('[data-value-title]', row).value.trim(),
        text: $('[data-value-text]', row).value.trim()
      }))
      .filter((v) => v.title || v.text);

  $('[data-add-value]')?.addEventListener('click', () => {
    if ($$('[data-value-row]', form).length >= 6) {
      toast('Six values is the maximum — remove one first.', 'error');
      return;
    }
    valueList.insertAdjacentHTML(
      'beforeend',
      `<div class="value-card" data-value-row>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Value</strong><button class="iconbtn iconbtn--danger" type="button" data-remove-row aria-label="Remove value">✕</button></div>
        <div class="field"><label>Title</label><input data-value-title placeholder="Hand embroidery" /></div>
        <div class="field"><label>Text</label><textarea data-value-text style="min-height:70px" placeholder="Every motif is stitched by hand in our Lahore atelier."></textarea></div>
      </div>`
    );
    renumberValues();
  });

  form.addEventListener('click', (e) => {
    const del = e.target.closest('[data-remove-row]');
    if (!del || !del.closest('[data-value-row]')) return;
    del.closest('[data-value-row]').remove();
    renumberValues();
  });

  const collectSlides = () =>
    $$('[data-slide]', form).map((block) => ({
      image: $('[name="s-image"]', block).value.trim(),
      kicker: $('[name="s-kicker"]', block).value.trim(),
      title: $('[name="s-title"]', block).value.trim(),
      subtitle: $('[name="s-sub"]', block).value.trim(),
      ctaLabel: $('[name="s-cta"]', block).value.trim(),
      ctaHref: $('[name="s-href"]', block).value.trim(),
      tone: 'dark'
    }));

  const attachSlideEvents = () => {
    $$('[data-remove-slide]', form).forEach((btn) => {
      btn.onclick = () => {
        const block = btn.closest('[data-slide]');
        block.remove();
        renumber();
      };
    });
    $$('[data-slide-upload]', form).forEach((input) => {
      input.onchange = () => uploadInto(input, $('[name="s-image"]', input.closest('[data-slide]')));
    });
  };

  const renumber = () => {
    $$('[data-slide]', form).forEach((block, i) => {
      $('strong', block).textContent = `Slide ${i + 1}`;
    });
    attachSlideEvents();
  };

  $('[data-add-slide]').addEventListener('click', () => {
    if ($$('[data-slide]', form).length >= 8) {
      toast('Eight slides is plenty — remove one first.', 'error');
      return;
    }
    const wrap = $('[data-slides]', form);
    const i = $$('[data-slide]', form).length;
    const div = document.createElement('div');
    div.className = 'card';
    div.style.cssText = 'background:var(--cream);margin-top:12px';
    div.dataset.slide = String(i);
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong style="font-family:var(--serif);font-size:18px;font-weight:500">Slide ${i + 1}</strong><button class="iconbtn iconbtn--danger" type="button" data-remove-slide="${i}">${icon('trash')}</button></div>
      <div class="form-grid">
        <div class="field field--full"><label>Image URL</label><input name="s-image" placeholder="/images/products/hero.jpg" />
          <div class="image-upload"><input type="file" accept="image/*" data-slide-upload="${i}" /><span class="field__hint">or upload a new image</span></div>
        </div>
        <div class="field"><label>Kicker</label><input name="s-kicker" placeholder="Festive '26" /></div>
        <div class="field"><label>Button label</label><input name="s-cta" value="Shop now" /></div>
        <div class="field"><label>Headline</label><textarea name="s-title" style="min-height:70px"></textarea></div>
        <div class="field"><label>Subtitle</label><textarea name="s-sub" style="min-height:70px"></textarea></div>
        <div class="field field--full"><label>Button link</label><input name="s-href" value="/shop" /></div>
      </div>`;
    wrap.appendChild(div);
    attachSlideEvents();
  });

  attachSlideEvents();
  $('[data-about-upload]')?.addEventListener('change', (e) => uploadInto(e.target, $('[name="aboutImage"]', form)));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      storeName: fd.get('storeName'),
      tagline: fd.get('tagline'),
      announcement: fd.get('announcement'),
      announcementActive: fd.get('announcementActive') === 'on',
      dropTitle: fd.get('dropTitle'),
      dropSubtitle: fd.get('dropSubtitle'),
      dropNote: fd.get('dropNote'),
      dropEndsAt: fd.get('dropEndsAt') ? new Date(fd.get('dropEndsAt')).toISOString() : null,
      aboutHeading: fd.get('aboutHeading'),
      aboutText: fd.get('aboutText'),
      aboutImage: fd.get('aboutImage'),
      instagramPosts: String(fd.get('instagramPosts') || '').split('\n').map((s) => s.trim()).filter(Boolean),
      heroSlides: collectSlides(),
      values: collectValues()
    };
    try {
      await api('/settings', { method: 'PUT', body: payload });
      toast('Storefront updated — the live store has it now.', 'success');
      store.settings = null;
      await loadSettings(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadInto(fileInput, targetInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) {
    toast('Image must be smaller than 6 MB.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await api('/upload', { method: 'POST', body: { dataUrl: reader.result } });
      targetInput.value = res.url;
      toast('Image uploaded.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

/* ---------------------------------------------------------- contact page */

async function renderContact() {
  const settings = await loadSettings();
  $('#view').innerHTML = `
    <form id="contact-form">
      <div class="card">
        <h2 class="section-title">Contact details</h2>
        <p class="section-note">These flow straight into the footer, contact page and every WhatsApp link on the store.</p>
        <div class="form-grid">
          <div class="field"><label>Phone</label><input name="phone" value="${esc(settings.phone)}" placeholder="+92 300 000 0000" /></div>
          <div class="field"><label>WhatsApp number (digits only, with country code)</label><input name="whatsapp" value="${esc(settings.whatsapp)}" placeholder="923001234567" /></div>
          <div class="field"><label>Email</label><input name="email" value="${esc(settings.email)}" /></div>
          <div class="field"><label>Opening hours</label><input name="hours" value="${esc(settings.hours)}" /></div>
          <div class="field field--full"><label>Address</label><textarea name="address" style="min-height:70px">${esc(settings.address)}</textarea></div>
        </div>
        <div class="help-box">WhatsApp format: country code first, no plus or spaces — e.g. <strong>923008427710</strong>. This is what the “Ask on WhatsApp” buttons use.</div>
      </div>

      <div class="card">
        <h2 class="section-title">Social profiles</h2>
        <p class="section-note">Leave a field empty to hide that icon. Links open in a new tab.</p>
        <div class="form-grid">
          <div class="field"><label>Instagram</label><input name="instagram" value="${esc(settings.instagram)}" placeholder="https://instagram.com/yourstore" /></div>
          <div class="field"><label>Facebook</label><input name="facebook" value="${esc(settings.facebook)}" placeholder="https://facebook.com/yourstore" /></div>
          <div class="field"><label>TikTok</label><input name="tiktok" value="${esc(settings.tiktok)}" /></div>
          <div class="field"><label>Pinterest</label><input name="pinterest" value="${esc(settings.pinterest)}" /></div>
          <div class="field field--full"><label>YouTube</label><input name="youtube" value="${esc(settings.youtube)}" /></div>
        </div>
      </div>

      <div class="form-actions" style="border-top:0">
        <button class="abtn abtn--ghost" type="button" data-reset-contact>Reset</button>
        <button class="abtn" type="submit">Save contact details</button>
      </div>
    </form>`;

  const form = $('#contact-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await api('/settings', {
        method: 'PUT',
        body: Object.fromEntries(['phone', 'whatsapp', 'email', 'hours', 'address', 'instagram', 'facebook', 'tiktok', 'pinterest', 'youtube'].map((key) => [key, fd.get(key)]))
      });
      toast('Contact details saved — the storefront is updated.', 'success');
      store.settings = null;
      await loadSettings(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('[data-reset-contact]').addEventListener('click', () => renderContact());
}

/* --------------------------------------------------------------- messages */

async function renderMessages() {
  const messages = await loadMessages(true);
  $('#view').innerHTML = `
    <div class="toolbar">
      <div style="font-size:12px;color:var(--muted)">${messages.filter((m) => !m.read).length} unread of ${messages.length} messages</div>
    </div>
    <div class="msg-list">
      ${
        messages.length
          ? messages
              .map(
                (m) => `
        <article class="msg ${m.read ? '' : 'is-unread'}" data-msg="${m.id}">
          <div class="msg__head">
            <div><strong>${esc(m.name)}</strong> <span class="msg__meta">${esc(m.email || '')} ${m.phone ? '· ' + esc(m.phone) : ''}</span></div>
            <span class="msg__meta">${dateTime(m.createdAt)}</span>
          </div>
          <p class="msg__body">${esc(m.message)}</p>
          <div class="msg__actions">
            ${m.email ? `<a href="mailto:${esc(m.email)}?subject=Re: your message to Ismail Elegance">Reply by email</a>` : ''}
            ${m.phone ? `<a href="https://wa.me/${esc(String(m.phone).replace(/\D/g, '').replace(/^0/, '92'))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
            <button type="button" data-mark-read="${m.id}">${m.read ? 'Mark unread' : 'Mark read'}</button>
            <button type="button" data-del-msg="${m.id}">Delete</button>
          </div>
        </article>`
              )
              .join('')
          : `<div class="card"><div class="empty"><strong>Inbox zero</strong>Messages from the contact form land here.</div></div>`
      }
    </div>`;

  $$('[data-mark-read]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const msg = messages.find((m) => m.id === btn.dataset.markRead);
      try {
        await api(`/messages/${msg.id}`, { method: 'PATCH', body: { read: !msg.read } });
        await renderMessages();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
  $$('[data-del-msg]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this message?')) return;
      try {
        await api(`/messages/${btn.dataset.delMsg}`, { method: 'DELETE' });
        await renderMessages();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

/* --------------------------------------------------------------- audience */

async function renderAudience() {
  const { subscribers } = await api('/subscribers');
  store.subscribers = subscribers;
  $('#view').innerHTML = `
    <div class="toolbar">
      <div style="font-size:12px;color:var(--muted)">${subscribers.length} people on the list — drop alerts and newsletter signups.</div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="abtn abtn--ghost" type="button" data-copy-emails>Copy emails</button>
        <button class="abtn" type="button" data-export>Export CSV</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Email</th><th>Source</th><th>Joined</th><th style="text-align:right">Actions</th></tr></thead>
        <tbody>
          ${
            subscribers.length
              ? subscribers
                  .map(
                    (s) => `<tr><td>${esc(s.email)}</td><td><span class="tag">${esc(s.source || 'newsletter')}</span></td><td>${date(s.createdAt)}</td>
                      <td><div class="row-actions"><button class="iconbtn iconbtn--danger" type="button" data-del-sub="${s.id}" title="Remove">${icon('trash')}</button></div></td></tr>`
                  )
                  .join('')
              : `<tr><td colspan="4"><div class="empty"><strong>No subscribers yet</strong>The newsletter form on the homepage feeds this list.</div></td></tr>`
          }
        </tbody>
      </table>
    </div>`;

  $('[data-export]')?.addEventListener('click', () => {
    const rows = [['Email', 'Source', 'Joined'], ...subscribers.map((s) => [s.email, s.source || 'newsletter', date(s.createdAt)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ismail-elegance-audience-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV downloaded.', 'success');
  });
  $('[data-copy-emails]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(subscribers.map((s) => s.email).join(', '));
      toast('Email list copied.', 'success');
    } catch (_) {
      toast('Copy failed — use export instead.', 'error');
    }
  });
  $$('[data-del-sub]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this subscriber?')) return;
      try {
        await api(`/subscribers/${btn.dataset.delSub}`, { method: 'DELETE' });
        await renderAudience();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

/* --------------------------------------------------------------- settings */

async function renderSettings() {
  const settings = await loadSettings();
  $('#view').innerHTML = `
    <div class="card">
      <h2 class="section-title">Delivery &amp; returns</h2>
      <p class="section-note">Used to calculate every bag and checkout total.</p>
      <form id="shipping-form">
        <div class="form-grid form-grid--3">
          ${numField({ name: 'freeShippingThreshold', label: 'Free delivery threshold (PKR)', value: settings.freeShippingThreshold, step: 500, min: 0, money: true })}
          ${numField({ name: 'shippingFee', label: 'Delivery fee (PKR)', value: settings.shippingFee, step: 50, min: 0, money: true })}
          ${numField({ name: 'returnWindow', label: 'Exchange window (days)', value: settings.returnWindow, step: 1, min: 0 })}
        </div>
        <div class="form-actions"><button class="abtn" type="submit">Save delivery settings</button></div>
      </form>
    </div>

    <div class="card">
      <div class="card__head" style="margin-bottom:6px">
        <div><h2 class="section-title">System check</h2><p class="section-note" style="margin:0">Firebase sign-in, storage and database status on this deployment.</p></div>
        <button class="abtn abtn--ghost abtn--sm" type="button" data-refresh-health>Re-check</button>
      </div>
      <div class="health" data-health><div class="empty" style="padding:20px">Checking…</div></div>
    </div>

    <div class="card">
      <h2 class="section-title">Admin password</h2>
      <p class="section-note">Change the demo password before sharing the panel. Use at least 6 characters.</p>
      <form id="password-form">
        <div class="form-grid form-grid--3">
          <div class="field"><label>Current password</label><input name="current" type="password" autocomplete="current-password" required /></div>
          <div class="field"><label>New password</label><input name="next" type="password" autocomplete="new-password" required minlength="6" /></div>
          <div class="field"><label>Confirm new password</label><input name="confirm" type="password" autocomplete="new-password" required minlength="6" /></div>
        </div>
        <div class="form-actions"><button class="abtn" type="submit">Update password</button></div>
      </form>
    </div>

    <div class="card">
      <h2 class="section-title">About this build</h2>
      <p class="section-note">On a Vercel deployment the catalogue lives in Supabase Storage and every save is written there immediately.</p>
      <div class="mini-list">
        <div class="mini-row"><div class="mini-row__body"><strong>Node + Express</strong><span>Storefront and admin share one process</span></div><span class="tag tag--green">Running</span></div>
        <div class="mini-row"><div class="mini-row__body"><strong>${esc(settings.storeName)}</strong><span>${esc(settings.email)} · ${esc(settings.phone)}</span></div><span class="tag">Live</span></div>
        <div class="mini-row"><div class="mini-row__body"><strong>Demo checkout</strong><span>No card data is collected or stored</span></div><span class="tag tag--gold">Simulated</span></div>
      </div>
    </div>`;

  /* ----- system check */
  const healthBox = $('[data-health]');
  const loadHealth = async () => {
    if (!healthBox) return;
    healthBox.innerHTML = '<div class="empty" style="padding:16px">Checking…</div>';
    try {
      const res = await fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json();
      const fb = data.firebase || {};
      const db = data.database || {};
      const row = (label, ok, note) =>
        `<div class="health__row"><span class="health__dot ${ok ? 'is-ok' : 'is-bad'}"></span><div><strong>${label}</strong><span>${esc(note)}</span></div><span class="tag ${ok ? 'tag--green' : 'tag--wine'}">${ok ? 'OK' : 'Check'}</span></div>`;
      healthBox.innerHTML = `
        ${row('Database', db.mode === 'local' || (db.remote && db.loaded), db.mode === 'local' ? 'Local data/db.json (writable)' : db.mode === 'remote' ? `Supabase storage · ${db.loaded ? 'connected' : 'not loaded yet'}` : 'Read-only preview — add Supabase env vars')}
        ${row('Firebase browser config', fb.clientConfigured, fb.clientConfigured ? `Project ${fb.projectId || '—'} · domain ${fb.authDomain || '—'}` : 'FIREBASE_API_KEY / FIREBASE_PROJECT_ID missing')}
        ${row('Firebase Admin SDK', fb.adminInitialized, fb.adminInitialized ? `Verified with ${fb.credentialSource || 'service account'}${fb.serviceAccount?.projectId ? ` · project ${fb.serviceAccount.projectId}` : ''}` : fb.credentialSource ? 'Credentials present but the SDK failed to start' : 'No FIREBASE_SERVICE_ACCOUNT on the server')}
        ${row('Admin allow-list', true, fb.adminEmailCount ? `${fb.adminEmailCount} Google account(s) allowed` : 'Open — any Google account can sign in')}
        ${(data.problems || []).length ? `<div class="health__problems">${data.problems.map((p) => `<p>⚠ ${esc(p)}</p>`).join('')}</div>` : ''}
        <p class="field__hint" style="margin-top:10px">Environment: ${esc(data.environment || '—')}${data.commit ? ` · commit ${esc(String(data.commit).slice(0, 7))}` : ''}. Firebase Console → Authentication → Settings → Authorized domains must include this domain.</p>`;
    } catch (err) {
      healthBox.innerHTML = `<div class="empty" style="padding:16px">Could not reach /api/health — ${esc(err.message)}</div>`;
    }
  };
  loadHealth();
  $('[data-refresh-health]')?.addEventListener('click', loadHealth);

  $('#shipping-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/settings', {
        method: 'PUT',
        body: {
          freeShippingThreshold: Math.max(0, Math.round(parseNum(fd.get('freeShippingThreshold'), 0))),
          shippingFee: Math.max(0, Math.round(parseNum(fd.get('shippingFee'), 0))),
          returnWindow: Math.max(0, Math.round(parseNum(fd.get('returnWindow'), 0)))
        }
      });
      toast('Delivery settings saved.', 'success');
      store.settings = null;
      await loadSettings(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('next') !== fd.get('confirm')) {
      toast('New passwords do not match.', 'error');
      return;
    }
    try {
      await api('/password', { method: 'POST', body: { current: fd.get('current'), next: fd.get('next') } });
      toast('Password updated. Use it next time you sign in.', 'success');
      e.target.reset();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

/* ------------------------------------------------------------------ modal */

function showModal({ title, subtitle = '', html, size = '' }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-wrap">
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal__head">
          <div><h2>${title}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button class="modal__close" type="button" data-close-modal aria-label="Close">${icon('close')}</button>
        </div>
        ${html}
      </div>
    </div>`;
  document.body.style.overflow = 'hidden';
  const wrap = $('.modal-wrap', root);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) closeModal();
  });
  return $('.modal', root);
}

function closeModal() {
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close-modal]')) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* Number steppers (price, stock, delivery…) — delegated so every view,
   including modals created later, gets − / + buttons. */
document.addEventListener('click', (e) => {
  const stepBtn = e.target.closest('[data-step]');
  if (!stepBtn) return;
  const wrap = stepBtn.closest('[data-numfield]');
  const input = wrap?.querySelector('input');
  if (!input) return;
  const step = Number(stepBtn.dataset.step) || 0;
  const min = wrap.dataset.min === '' ? -Infinity : Number(wrap.dataset.min);
  const max = wrap.dataset.max === '' ? Infinity : Number(wrap.dataset.max);
  const next = Math.min(max, Math.max(min, parseNum(input.value, 0) + step));
  input.value = formatFieldValue(input, next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

/* Show money values with thousands separators when the field is not being
   edited, and strip them again on focus so typing is never blocked. */
function formatFieldValue(input, value = parseNum(input.value, NaN)) {
  if (!Number.isFinite(value)) return input.value;
  if (input.dataset.format === 'money') return value.toLocaleString('en-PK');
  return String(value);
}

document.addEventListener('focusin', (e) => {
  const input = e.target;
  if (input.matches && input.matches('[data-format="money"]') && input.value.includes(',')) {
    input.value = String(parseNum(input.value, ''));
  }
});

document.addEventListener('focusout', (e) => {
  const input = e.target;
  if (input.matches && input.matches('[data-format="money"]') && String(input.value).trim()) {
    input.value = formatFieldValue(input);
  }
});

/* Select a number field's contents on focus so typing replaces the old value
   instead of appending to it (a common “I can't change this number” trap). */
document.addEventListener('focusin', (e) => {
  if (e.target.matches('input[type="number"], [data-numfield] input')) {
    requestAnimationFrame(() => {
      try {
        e.target.select();
      } catch (_) {}
    });
  }
});

/* On iOS, tapping a numeric field should open the numeric keypad, and the
   Enter key should submit the form it belongs to. */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[type="number"]')) {
    const form = e.target.form;
    if (form) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }
});

/* ------------------------------------------------- table labels (mobile) */

/**
 * On phones the admin tables are rendered as stacked cards. CSS uses
 * td[data-label] for the field name, so copy the header text onto every cell
 * whenever a table is (re)rendered.
 */
function labelTables(root = document) {
  $$('table.data', root).forEach((table) => {
    const heads = $$('thead th', table).map((th) => th.textContent.trim());
    if (!heads.length) return;
    $$('tbody tr', table).forEach((tr) => {
      $$('td', tr).forEach((td, i) => {
        if (heads[i]) td.dataset.label = heads[i];
      });
    });
  });
}

const tableObserver = new MutationObserver(() => labelTables());
[$('#view'), $('#modal-root')].forEach((host) => {
  if (host) tableObserver.observe(host, { childList: true, subtree: true });
});

/* ------------------------------------------------------------------- boot */

init();
