import { state, money, cartDetails, cartTotals, addToCart, updateCartQty, removeFromCart, toggleWishlist, isWished, setPromo, clearPromo, revalidatePromo, pushRecent, discountPercent, setUser } from './state.js';
import { api } from './api.js';
import { getCurrentUser, signInWithGoogle, getIdToken, isFirebaseEnabled } from './firebase.js';
import { navigate, queryParams, setQuery } from './nav.js';
import {
  icon,
  escapeHtml,
  nl2br,
  price,
  stars,
  formatDate,
  toast,
  copyText,
  productCard,
  countdownMarkup,
  startCountdowns,
  setupReveal,
  deliveryEstimate,
  quickView,
  sizeGuideModal,
  renderCartDrawer,
  refreshCounts,
  openCart,
  showScrim,
  hideScrim
} from './ui.js';

const app = () => document.getElementById('app');

/* --------------------------------------------------------------- fragments */

function sectionHead({ eyebrow, title, desc, link, linkLabel = 'View all' }) {
  return `
    <div class="section-head reveal">
      <div>
        <span class="eyebrow">${escapeHtml(eyebrow)}</span>
        <h2 class="section-title">${title}</h2>
        ${desc ? `<p class="section-desc">${escapeHtml(desc)}</p>` : ''}
      </div>
      ${link ? `<div class="section-head__side"><a class="link-arrow" href="${link}">${escapeHtml(linkLabel)} ${icon('arrowRight')}</a></div>` : ''}
    </div>`;
}

function emptyState({ title, text, action, href }) {
  return `
    <div class="empty-state">
      ${icon('hanger')}
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      ${action ? `<a class="btn btn--sm" href="${href}">${escapeHtml(action)}</a>` : ''}
    </div>`;
}

function pageHead({ crumbs = [], title, count, desc }) {
  return `
    <div class="page-head">
      <div class="container">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          ${crumbs.map((c) => `<span>/</span>${c.href ? `<a href="${c.href}">${escapeHtml(c.label)}</a>` : `<span style="font-size:9.5px">${escapeHtml(c.label)}</span>`}`).join('')}
        </nav>
        <div class="page-head__row">
          <h1>${escapeHtml(title)}</h1>
          ${count != null ? `<span class="page-head__count">${count}</span>` : ''}
        </div>
        ${desc ? `<p class="page-head__desc">${escapeHtml(desc)}</p>` : ''}
      </div>
    </div>`;
}

function summaryTotals(t, promo) {
  return `
    <div class="summary__rows">
      <div class="summary__row"><span>Subtotal</span><span>${price(t.subtotal)}</span></div>
      ${t.discount ? `<div class="summary__row summary__row--discount"><span>Discount ${promo ? `(${escapeHtml(promo.code)})` : ''}</span><span>− ${price(t.discount)}</span></div>` : ''}
      <div class="summary__row"><span>Delivery</span><span>${t.shipping ? price(t.shipping) : 'Free'}</span></div>
    </div>
    <div class="summary__total"><span>Total</span><strong>${price(t.total)}</strong></div>`;
}

function shipMeter(t) {
  const remaining = Math.max(0, t.threshold - t.subtotal);
  const pct = t.threshold ? Math.min(100, (t.subtotal / t.threshold) * 100) : 100;
  return `
    <div class="ship-meter">
      <div class="ship-meter__text">
        <span>${remaining > 0 ? `Add <strong>${price(remaining)}</strong> for free delivery` : 'Free delivery unlocked'}</span>
        <span>${Math.round(pct)}%</span>
      </div>
      <div class="ship-meter__track"><div class="ship-meter__fill" style="width:${pct}%"></div></div>
    </div>`;
}

/* -------------------------------------------------------------------- home */

export async function homePage() {
  const s = state.settings;
  const drops = state.products.filter((p) => p.isDrop).slice(0, 4);
  const fillers = state.products.filter((p) => !p.isDrop).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const dropRail = [...drops, ...fillers].slice(0, 4);
  const cat = (slug) => state.categories.find((c) => c.slug === slug);
  const heroSlides = s.heroSlides?.length
    ? s.heroSlides
    : [{ image: '/images/products/bridal-meher.jpg', kicker: 'Festive 26', title: 'Heirlooms, re-imagined', subtitle: '', ctaLabel: 'Shop', ctaHref: '/shop' }];

  // The gift card reflects whichever code the owner has live in /admin, so the
  // homepage never advertises a promo that no longer exists.
  const featuredPromo = [...(state.promos || [])]
    .filter((p) => p.type === 'percent' && Number(p.value) > 0)
    .sort((a, b) => (Number(a.minOrder) || 0) - (Number(b.minOrder) || 0) || Number(b.value) - Number(a.value))[0];

  const igHandle = (() => {
    const handle = String(s.instagram || '').replace(/\/+$/, '').split('/').pop();
    return handle ? '@' + handle : '@' + String(s.storeName || 'the atelier').toLowerCase().replace(/[^a-z0-9]/g, '');
  })();

  const tiles = [
    { c: cat('bridal'), cls: 'cat-tile--hero' },
    { c: cat('formals'), cls: 'cat-tile--side' },
    { c: cat('lawn'), cls: 'cat-tile--third' },
    { c: cat('pret'), cls: 'cat-tile--third' },
    { c: cat('accessories'), cls: 'cat-tile--third' }
  ].filter((t) => t.c);

  const testimonials = [
    { text: 'The Noor Jahan arrived in a muslin bag with a hand-written note. I have never felt so looked after by an online store.', name: 'Ayesha K.', city: 'Lahore' },
    { text: 'Ordered lawn on Tuesday, stitched and delivered by Friday. The dupatta is heavier than pieces I have paid double for.', name: 'Nimra J.', city: 'Karachi' },
    { text: 'They talked me through sizing on WhatsApp at 9pm before a wedding. The formal fit like it was made for me — because it was.', name: 'Sana T.', city: 'Islamabad' }
  ];

  app().innerHTML = `
    <section class="hero" data-hero>
      ${heroSlides
        .map(
          (slide, i) => `
        <div class="hero__slide ${i === 0 ? 'is-active' : ''}" aria-hidden="${i === 0 ? 'false' : 'true'}">
          <img src="${escapeHtml(slide.image)}" alt="${escapeHtml(s.storeName)} — ${escapeHtml(slide.kicker)}" ${i === 0 ? '' : 'loading="lazy"'} />
          <div class="hero__veil"></div>
          <div class="container" style="position:relative;height:100%">
            <div class="hero__content">
              <span class="hero__kicker">${escapeHtml(slide.kicker)}</span>
              <h1 class="hero__title">${escapeHtml(slide.title)}</h1>
              <p class="hero__sub">${escapeHtml(slide.subtitle)}</p>
              <div class="hero__cta">
                <a class="btn" href="${escapeHtml(slide.ctaHref || '/shop')}">${escapeHtml(slide.ctaLabel || 'Shop now')}</a>
                <a class="btn btn--outline" href="/about">Inside the atelier</a>
              </div>
            </div>
          </div>
        </div>`
        )
        .join('')}
      <div class="hero__controls">
        <button class="hero__arrow" type="button" data-hero-prev aria-label="Previous slide">${icon('arrowLeft')}</button>
        <button class="hero__arrow" type="button" data-hero-next aria-label="Next slide">${icon('arrowRight')}</button>
      </div>
      <div class="hero__dots">
        ${heroSlides.map((_, i) => `<button type="button" class="${i === 0 ? 'is-active' : ''}" data-hero-dot="${i}" aria-label="Go to slide ${i + 1}"></button>`).join('')}
      </div>
      ${countdownMarkup()}
    </section>

    <section class="trust">
      <div class="trust__grid">
        <div class="trust__item">${icon('truck')} Free delivery over ${price(s.freeShippingThreshold)}</div>
        <div class="trust__item">${icon('scissors')} Free alterations on stitched</div>
        <div class="trust__item">${icon('shield')} ${escapeHtml(s.returnWindow || 14)}-day easy exchange</div>
        <div class="trust__item">${icon('leaf')} Hand-finished in Lahore</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        ${sectionHead({
          eyebrow: 'New this week',
          title: escapeHtml(s.dropTitle || 'The festive drop'),
          desc: s.dropNote || 'Hand-embellished pieces in limited numbers — once they are gone, they are gone.',
          link: '/shop?drop=1',
          linkLabel: 'All new drops'
        })}
        <div class="rail reveal">${dropRail.map((p) => productCard(p)).join('')}</div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="container">
        ${sectionHead({ eyebrow: 'Shop by category', title: 'The house edit', link: '/shop', linkLabel: 'All pieces' })}
        <div class="cat-grid reveal">
          ${tiles
            .map(
              (t, i) => `
            <a class="cat-tile ${t.cls}" href="/shop?category=${t.c.slug}">
              <img src="${t.c.image}" alt="${escapeHtml(t.c.name)}" loading="lazy" />
              <div class="cat-tile__body">
                <div>
                  <div class="cat-tile__name">${escapeHtml(t.c.name)}</div>
                  <div class="cat-tile__blurb">${escapeHtml(t.c.blurb)}</div>
                </div>
                <span class="cat-tile__arrow">${icon('arrowRight')}</span>
              </div>
            </a>`
            )
            .join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        ${sectionHead({ eyebrow: 'Most loved', title: 'Trending in the atelier', link: '/shop', linkLabel: 'Shop everything' })}
        <div class="tabs" role="tablist">
          ${[
            ['new', 'New arrivals'],
            ['pret', 'Luxe pret'],
            ['bridal', 'Bridal'],
            ['formals', 'Formals'],
            ['accessories', 'Accessories']
          ]
            .map(
              ([key, label], i) =>
                `<button class="tab ${i === 0 ? 'is-active' : ''}" type="button" role="tab" aria-selected="${i === 0}" data-trend-tab="${key}">${label}</button>`
            )
            .join('')}
        </div>
        <div class="product-grid reveal" id="trend-grid"></div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="container">
        <div class="editorial reveal">
          <div class="editorial__media">
            <img src="${escapeHtml(s.aboutImage || '/images/boutique/atelier.jpg')}" alt="Inside the Ismail Elegance atelier in Lahore" loading="lazy" />
            <span class="editorial__tag">The atelier · Gulberg III, Lahore</span>
          </div>
          <div class="editorial__body">
            <span class="eyebrow">Our story</span>
            <h2 class="editorial__title">Cloth first.<br />Everything else follows.</h2>
            <p class="editorial__text">We began with a single counter and a stubborn belief: that a woman should be able to buy something in Lahore that feels as considered as anything from Paris. Seven years on, we still choose the fabric before we sketch the shirt.</p>
            <div class="editorial__stats">
              <div class="editorial__stat"><strong>7 yrs</strong><span>On MM Alam Road</span></div>
              <div class="editorial__stat"><strong>38</strong><span>Artisan partners</span></div>
              <div class="editorial__stat"><strong>100%</strong><span>Hand finished</span></div>
            </div>
            <a class="btn btn--ghost" href="/about">Visit the atelier</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="promo-grid reveal">
          <div class="promo-card">
            <span class="promo-card__label">${featuredPromo ? 'A gift for your first order' : 'The list'}</span>
            <h2 class="promo-card__title">${featuredPromo ? `${escapeHtml(featuredPromo.value)}% off your first order, and first access to every drop.` : 'First access to every drop.'}</h2>
            <p class="promo-card__text">New here? Use the code below at checkout. Join the list and we will tell you before a drop goes public — never more than twice a month.</p>
            ${featuredPromo ? `<div class="promo-code"><span>${escapeHtml(featuredPromo.code)}</span><button type="button" data-copy="${escapeHtml(featuredPromo.code)}" aria-label="Copy code">${icon('copy')}</button></div>` : ''}
            <a class="btn btn--light btn--sm" href="/shop">Start shopping</a>
            <span class="promo-card__mark">${featuredPromo ? escapeHtml(featuredPromo.value) : '·'}</span>
          </div>
          <div class="promo-card promo-card--gold">
            <span class="promo-card__label">Not sure where to start?</span>
            <h2 class="promo-card__title">Find your muse in thirty seconds.</h2>
            <p class="promo-card__text">Three questions — the occasion, the silhouette and the palette — and we will show you the pieces we would pull for you.</p>
            <a class="btn btn--light btn--sm" href="/quiz">Take the style quiz</a>
            <span class="promo-card__mark">?</span>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--tight">
      <div class="container">
        ${sectionHead({
          eyebrow: 'From the atelier',
          title: igHandle,
          link: s.instagram,
          linkLabel: 'Follow along'
        })}
        <div class="ig-strip reveal">
          ${(s.instagramPosts || [])
            .slice(0, 8)
            .map(
              (src) => `<a class="ig-strip__item" href="${escapeHtml(s.instagram)}" target="_blank" rel="noopener" aria-label="View on Instagram"><img src="${escapeHtml(src)}" alt="" loading="lazy" /><span class="ig-strip__overlay">${icon('instagram')}</span></a>`
            )
            .join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        ${sectionHead({ eyebrow: 'Word of mouth', title: 'Notes from our customers' })}
        <div class="quotes reveal">
          ${testimonials
            .map(
              (t) => `
            <figure class="quote" style="margin:0">
              <div class="quote__stars">${Array.from({ length: 5 }).map(() => icon('star')).join('')}</div>
              <blockquote class="quote__text">“${escapeHtml(t.text)}”</blockquote>
              <figcaption class="quote__meta">${escapeHtml(t.name)} · ${escapeHtml(t.city)}</figcaption>
            </figure>`
            )
            .join('')}
        </div>
      </div>
    </section>

    <section class="newsletter">
      <div class="container">
        <div class="newsletter__inner reveal">
          <span class="eyebrow" style="justify-content:center">The list</span>
          <h2>Be first to the next drop.</h2>
          <p>Drop alerts, atelier notes and the occasional early-access code. No noise, ever.</p>
          <form class="field-inline" data-newsletter>
            <input type="email" name="email" placeholder="Your email address" aria-label="Email address" required />
            <button class="btn" type="submit">Join the list</button>
          </form>
          <p class="form-note" data-newsletter-note>By joining you agree to receive occasional emails. Unsubscribe any time.</p>
        </div>
      </div>
    </section>`;

  /* hero slider */
  const slides = [...app().querySelectorAll('.hero__slide')];
  const dots = [...app().querySelectorAll('[data-hero-dot]')];
  let index = 0;
  let timer;
  const show = (next) => {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
      slide.setAttribute('aria-hidden', String(i !== index));
    });
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  };
  const auto = () => {
    clearInterval(timer);
    if (slides.length > 1) {
      timer = setInterval(() => show(index + 1), 7000);
      window.__ieHomeTimer = timer;
    }
  };
  app().querySelector('[data-hero-prev]')?.addEventListener('click', () => {
    show(index - 1);
    auto();
  });
  app().querySelector('[data-hero-next]')?.addEventListener('click', () => {
    show(index + 1);
    auto();
  });
  dots.forEach((dot) => dot.addEventListener('click', () => {
    show(Number(dot.dataset.heroDot));
    auto();
  }));
  const hero = app().querySelector('[data-hero]');
  hero?.addEventListener('mouseenter', () => clearInterval(timer));
  hero?.addEventListener('mouseleave', auto);
  auto();

  startCountdowns();

  /* trending tabs */
  const trendGrid = app().querySelector('#trend-grid');
  const groups = {
    new: state.products.filter((p) => p.isNew),
    pret: state.products.filter((p) => p.category === 'pret'),
    bridal: state.products.filter((p) => p.category === 'bridal'),
    formals: state.products.filter((p) => p.category === 'formals'),
    accessories: state.products.filter((p) => p.category === 'accessories')
  };
  const paintTrend = (key) => {
    const list = (groups[key] || []).slice(0, 4);
    trendGrid.innerHTML = list.map((p) => productCard(p)).join('');
    refreshCounts();
  };
  paintTrend('new');
  app().querySelectorAll('[data-trend-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      app().querySelectorAll('[data-trend-tab]').forEach((t) => {
        t.classList.toggle('is-active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      paintTrend(tab.dataset.trendTab);
    });
  });

  /* newsletter */
  const form = app().querySelector('[data-newsletter]');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = app().querySelector('[data-newsletter-note]');
    const email = new FormData(form).get('email');
    try {
      const res = await api.subscribe(email, 'homepage');
      note.textContent = res.message;
      note.className = 'form-note is-success';
      form.reset();
    } catch (err) {
      note.textContent = err.message;
      note.className = 'form-note is-error';
    }
  });

  setupReveal(app());
}

/* -------------------------------------------------------------------- shop */

const filterState = {
  categories: new Set(),
  sizes: new Set(),
  collections: new Set(),
  min: '',
  max: '',
  inStock: false,
  drop: false,
  q: '',
  sort: 'featured'
};

export function shopPage() {
  const params = queryParams();
  const category = params.get('category');
  const collection = params.get('collection');

  filterState.categories = new Set(category ? [category] : []);
  filterState.collections = new Set(collection ? [collection] : []);
  filterState.drop = params.get('drop') === '1';
  filterState.q = params.get('q') || '';
  filterState.sort = params.get('sort') || 'featured';
  filterState.sizes = new Set();
  filterState.min = '';
  filterState.max = '';
  filterState.inStock = false;

  const catObj = state.categories.find((c) => c.slug === category);
  const title = filterState.q
    ? `Results for “${filterState.q}”`
    : filterState.drop
      ? 'The Festive Drop'
      : catObj
        ? catObj.name
        : 'The Collection';
  const desc = filterState.drop
    ? state.settings.dropNote
    : catObj
      ? catObj.blurb
      : 'Hand-finished lawn, luxe pret, formals, bridal and accessories — made in small runs in Lahore.';

  const collections = [...new Set(state.products.map((p) => p.collection))];
  const allSizes = [...new Set(state.products.flatMap((p) => p.sizes))].filter((s) => s !== 'Unstitched' && s !== 'One Size');
  const cats = state.categories.filter((c) => c.slug !== 'new-drops');

  app().innerHTML = `
    ${pageHead({ crumbs: [{ label: 'Shop' }], title, desc })}
    <div class="shop">
      <div class="container">
        <div class="shop__layout">
          <aside class="filters" id="filters" aria-label="Filters">
            <div class="filter-head">
              <h2>Filter</h2>
              <button type="button" data-clear-filters>Clear all</button>
              <button type="button" data-close-filters class="mobile-only" aria-label="Close filters" style="font-size:16px">${icon('close')}</button>
            </div>
            <div class="filter-group">
              <button class="filter-group__title" type="button">Category ${icon('chevronDown')}</button>
              <div class="filter-group__body">
                ${cats
                  .map(
                    (c) => `<label class="check"><input type="checkbox" data-filter-category="${c.slug}"  /> ${escapeHtml(c.name)}<span class="check__count">${state.products.filter((p) => p.category === c.slug).length}</span></label>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="filter-group">
              <button class="filter-group__title" type="button">Price ${icon('chevronDown')}</button>
              <div class="filter-group__body">
                ${[
                  ['', '', 'All prices'],
                  ['0', '15000', 'Under 15,000'],
                  ['15000', '50000', '15,000 – 50,000'],
                  ['50000', '150000', '50,000 – 150,000'],
                  ['150000', '', '150,000 +']
                ]
                  .map(
                    ([min, max, label], i) =>
                      `<label class="check"><input type="radio" name="price" data-filter-price value="${min}-${max}" ${i === 0 ? 'checked' : ''} /> ${label}</label>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="filter-group">
              <button class="filter-group__title" type="button">Size ${icon('chevronDown')}</button>
              <div class="filter-group__body">
                ${allSizes
                  .map(
                    (size) =>
                      `<label class="check"><input type="checkbox" data-filter-size="${escapeHtml(size)}" /> ${escapeHtml(size)}</label>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="filter-group">
              <button class="filter-group__title" type="button">Collection ${icon('chevronDown')}</button>
              <div class="filter-group__body">
                ${collections
                  .map(
                    (c) =>
                      `<label class="check"><input type="checkbox" data-filter-collection="${escapeHtml(c)}" /> ${escapeHtml(c)}</label>`
                  )
                  .join('')}
              </div>
            </div>
            <div class="filter-group">
              <button class="filter-group__title" type="button">Availability ${icon('chevronDown')}</button>
              <div class="filter-group__body">
                <label class="check"><input type="checkbox" data-filter-stock /> In stock only</label>
                <label class="check"><input type="checkbox" data-filter-drop /> Festive drop only</label>
              </div>
            </div>
            <button class="btn btn--block btn--sm mobile-only" type="button" data-close-filters>Show results</button>
          </aside>

          <div>
            <div class="shop-toolbar">
              <button class="filter-toggle" type="button" data-open-filters>${icon('filter')} Filters</button>
              <span class="shop-toolbar__count" data-shop-count></span>
              <div class="shop-toolbar__right">
                <div class="select-wrap">
                  <select data-sort aria-label="Sort by">
                    <option value="featured">Featured</option>
                    <option value="newest">Newest first</option>
                    <option value="price-asc">Price: low to high</option>
                    <option value="price-desc">Price: high to low</option>
                    <option value="rating">Top rated</option>
                  </select>
                  ${icon('chevronDown')}
                </div>
              </div>
            </div>
            <div class="active-filters" data-active-filters></div>
            <div class="product-grid" data-shop-grid></div>
          </div>
        </div>
      </div>
    </div>`;

  const grid = app().querySelector('[data-shop-grid]');
  const countEl = app().querySelector('[data-shop-count]');
  const chipsEl = app().querySelector('[data-active-filters]');
  const sortEl = app().querySelector('[data-sort]');
  sortEl.value = filterState.sort;

  const priceBuckets = {
    '-': ['', ''],
    '0-15000': ['0', '15000'],
    '15000-50000': ['15000', '50000'],
    '50000-150000': ['50000', '150000'],
    '150000-': ['150000', '']
  };

  const matches = () => {
    let list = [...state.products];
    if (filterState.categories.size) list = list.filter((p) => filterState.categories.has(p.category));
    if (filterState.collections.size) list = list.filter((p) => filterState.collections.has(p.collection));
    if (filterState.sizes.size) list = list.filter((p) => p.sizes.some((s) => filterState.sizes.has(s)));
    if (filterState.drop) list = list.filter((p) => p.isDrop);
    if (filterState.inStock) list = list.filter((p) => (p.stock || 0) > 0);
    if (filterState.min !== '') list = list.filter((p) => p.price >= Number(filterState.min));
    if (filterState.max !== '') list = list.filter((p) => p.price <= Number(filterState.max));
    if (filterState.q) {
      const needle = filterState.q.toLowerCase();
      list = list.filter((p) =>
        [p.name, p.subtitle, p.collection, p.category, p.fabric, (p.tags || []).join(' ')].join(' ').toLowerCase().includes(needle)
      );
    }
    const sorters = {
      featured: (a, b) => Number(b.featured) - Number(a.featured) || new Date(b.createdAt) - new Date(a.createdAt),
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating
    };
    return list.sort(sorters[filterState.sort] || sorters.featured);
  };

  const paint = () => {
    const list = matches();
    countEl.textContent = `${list.length} piece${list.length === 1 ? '' : 's'}`;
    grid.innerHTML = list.length
      ? list.map((p) => productCard(p)).join('')
      : emptyState({
          title: 'Nothing matches — yet',
          text: 'Try loosening a filter, or let us show you what just landed.',
          action: 'Reset filters',
          href: '/shop'
        });
    refreshCounts();

    const chips = [];
    filterState.categories.forEach((c) => {
      const cat = state.categories.find((x) => x.slug === c);
      chips.push({ label: cat ? cat.name : c, type: 'category', value: c });
    });
    filterState.sizes.forEach((s) => chips.push({ label: `Size ${s}`, type: 'size', value: s }));
    filterState.collections.forEach((c) => chips.push({ label: c, type: 'collection', value: c }));
    if (filterState.min !== '' || filterState.max !== '') {
      chips.push({ label: `${filterState.min || '0'} – ${filterState.max || '∞'}`, type: 'price' });
    }
    if (filterState.inStock) chips.push({ label: 'In stock', type: 'stock' });
    if (filterState.drop) chips.push({ label: 'Festive drop', type: 'drop' });
    if (filterState.q) chips.push({ label: `“${filterState.q}”`, type: 'q' });

    chipsEl.innerHTML = chips.length
      ? chips
          .map(
            (chip) =>
              `<button type="button" data-chip-type="${chip.type}" data-chip-value="${escapeHtml(chip.value || '')}">${escapeHtml(chip.label)} ${icon('close')}</button>`
          )
          .join('') + `<button type="button" data-chip-type="all" style="background:none;border-bottom:1px solid var(--line-dark);padding:6px 2px">Clear</button>`
      : '';
  };

  const syncUrl = () => {
    const p = {};
    if (filterState.categories.size === 1) p.category = [...filterState.categories][0];
    if (filterState.drop) p.drop = '1';
    if (filterState.q) p.q = filterState.q;
    if (filterState.sort !== 'featured') p.sort = filterState.sort;
    if (filterState.collections.size === 1) p.collection = [...filterState.collections][0];
    setQuery(p);
  };

  const refresh = () => {
    paint();
    syncUrl();
  };

  app().querySelectorAll('[data-filter-category]').forEach((box) => {
    box.checked = filterState.categories.has(box.dataset.filterCategory);
    box.addEventListener('change', () => {
      box.checked ? filterState.categories.add(box.dataset.filterCategory) : filterState.categories.delete(box.dataset.filterCategory);
      refresh();
    });
  });
  app().querySelectorAll('[data-filter-size]').forEach((box) => {
    box.addEventListener('change', () => {
      box.checked ? filterState.sizes.add(box.dataset.filterSize) : filterState.sizes.delete(box.dataset.filterSize);
      refresh();
    });
  });
  app().querySelectorAll('[data-filter-collection]').forEach((box) => {
    box.checked = filterState.collections.has(box.dataset.filterCollection);
    box.addEventListener('change', () => {
      box.checked ? filterState.collections.add(box.dataset.filterCollection) : filterState.collections.delete(box.dataset.filterCollection);
      refresh();
    });
  });
  app().querySelectorAll('[data-filter-price]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const [min, max] = priceBuckets[radio.value] || ['', ''];
      filterState.min = min;
      filterState.max = max;
      refresh();
    });
  });
  app().querySelector('[data-filter-stock]')?.addEventListener('change', (e) => {
    filterState.inStock = e.target.checked;
    refresh();
  });
  app().querySelector('[data-filter-drop]').checked = filterState.drop;
  app().querySelector('[data-filter-drop]')?.addEventListener('change', (e) => {
    filterState.drop = e.target.checked;
    refresh();
  });

  sortEl.addEventListener('change', () => {
    filterState.sort = sortEl.value;
    refresh();
  });

  app().querySelectorAll('.filter-group__title').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('.filter-group').classList.toggle('is-collapsed'));
  });

  app().querySelector('[data-clear-filters]')?.addEventListener('click', () => {
    filterState.categories.clear();
    filterState.sizes.clear();
    filterState.collections.clear();
    filterState.min = '';
    filterState.max = '';
    filterState.inStock = false;
    filterState.q = '';
    filterState.sort = 'featured';
    sortEl.value = 'featured';
    app().querySelectorAll('input[data-filter-category],input[data-filter-size],input[data-filter-collection],input[data-filter-stock],input[data-filter-drop]').forEach((i) => (i.checked = false));
    app().querySelector('input[data-filter-price]').checked = true;
    filterState.drop = false;
    paint();
    syncUrl();
  });

  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip-type]');
    if (!chip) return;
    const { chipType, chipValue } = chip.dataset;
    if (chipType === 'all') {
      app().querySelector('[data-clear-filters]').click();
      return;
    }
    if (chipType === 'category') {
      filterState.categories.delete(chipValue);
      const box = app().querySelector(`[data-filter-category="${chipValue}"]`);
      if (box) box.checked = false;
    }
    if (chipType === 'size') {
      filterState.sizes.delete(chipValue);
      const box = app().querySelector(`[data-filter-size="${chipValue}"]`);
      if (box) box.checked = false;
    }
    if (chipType === 'collection') {
      filterState.collections.delete(chipValue);
      const box = [...app().querySelectorAll('[data-filter-collection]')].find((b) => b.dataset.filterCollection === chipValue);
      if (box) box.checked = false;
    }
    if (chipType === 'price') {
      filterState.min = '';
      filterState.max = '';
      app().querySelector('[data-filter-price]').checked = true;
    }
    if (chipType === 'stock') {
      filterState.inStock = false;
      app().querySelector('[data-filter-stock]').checked = false;
    }
    if (chipType === 'drop') {
      filterState.drop = false;
      app().querySelector('[data-filter-drop]').checked = false;
    }
    if (chipType === 'q') {
      filterState.q = '';
      navigate('/shop', { replace: true, scroll: false });
      return;
    }
    paint();
    syncUrl();
  });

  const filtersEl = app().querySelector('#filters');
  app().querySelector('[data-open-filters]')?.addEventListener('click', () => {
    filtersEl.classList.add('is-open');
    document.body.classList.add('is-locked');
    showScrim(() => {
      filtersEl.classList.remove('is-open');
      hideScrim();
      document.body.classList.remove('is-locked');
    });
  });
  app().querySelectorAll('[data-close-filters]').forEach((btn) =>
    btn.addEventListener('click', () => {
      filtersEl.classList.remove('is-open');
      hideScrim();
      document.body.classList.remove('is-locked');
      paint();
    })
  );

  paint();
  refreshCounts();
}

/* ----------------------------------------------------------------- product */

export async function productPage({ slug }) {
  let product = state.products.find((p) => p.slug === slug);
  if (!product) {
    try {
      const res = await api.product(slug);
      product = res.product;
    } catch (_) {
      app().innerHTML = emptyState({ title: 'Piece not found', text: 'This piece may have sold out or moved collections.', action: 'Back to the collection', href: '/shop' });
      return;
    }
  }
  pushRecent(product.slug);

  const related = state.products
    .filter((p) => p.id !== product.id && (p.category === product.category || p.collection === product.collection))
    .slice(0, 4);
  const recent = state.recent.map((s) => state.products.find((p) => p.slug === s)).filter((p) => p && p.id !== product.id).slice(0, 4);
  const sale = product.compareAt && product.compareAt > product.price;
  const soldOut = (product.stock || 0) <= 0;
  const d = deliveryEstimate();
  const whatsappText = encodeURIComponent(`Hi Ismail Elegance! I'd like to ask about the ${product.name} (${product.slug}).`);

  app().innerHTML = `
    ${pageHead({
      crumbs: [
        { label: 'Shop', href: '/shop' },
        { label: state.categories.find((c) => c.slug === product.category)?.name || product.category, href: `/shop?category=${product.category}` },
        { label: product.name }
      ],
      title: ''
    })}
    <div class="pdp">
      <div class="container">
        <div class="pdp__layout">
          <div class="pdp__gallery">
            <div class="pdp__main" data-pdp-main>
              <img src="${product.images[0]}" alt="${escapeHtml(product.name)} — ${escapeHtml(product.subtitle)}" data-pdp-image />
            </div>
            <div class="pdp__thumbs">
              ${product.images
                .map(
                  (src, i) => `<button class="pdp__thumb ${i === 0 ? 'is-active' : ''}" type="button" data-pdp-thumb="${src}" aria-label="View image ${i + 1}"><img src="${src}" alt="" loading="lazy" /></button>`
                )
                .join('')}
            </div>
          </div>

          <div class="pdp__info">
            <div>
              <span class="pdp__collection">${escapeHtml(product.collection)}</span>
              <h1 class="pdp__title" style="margin-top:6px">${escapeHtml(product.name)}</h1>
              <p class="pdp__sub">${escapeHtml(product.subtitle)}</p>
            </div>
            <div class="pdp__rating">
              ${stars(product.rating || 5)}
              <span>${(product.rating || 5).toFixed(1)} · ${product.reviewCount || 0} reviews</span>
              ${product.isDrop ? '<span class="badge-inline" style="margin-left:auto;background:var(--gold);color:#fff">New drop</span>' : ''}
            </div>
            <div class="pdp__price">
              <span>${price(product.price)}</span>
              ${sale ? `<span class="was">${price(product.compareAt)}</span><span class="save">Save ${discountPercent(product)}%</span>` : ''}
            </div>
            <p class="pdp__desc">${nl2br(product.description)}</p>

            ${
              product.colors?.length
                ? `<div>
                    <div class="pdp__option-head"><strong>Colour</strong><span class="text-muted" data-color-label>${escapeHtml(product.colors[0].name)}</span></div>
                    <div class="swatches">
                      ${product.colors
                        .map(
                          (c, i) => `<button class="swatch ${i === 0 ? 'is-active' : ''}" type="button" style="background:${escapeHtml(c.hex)}" data-color="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}"></button>`
                        )
                        .join('')}
                    </div>
                  </div>`
                : ''
            }

            <div>
              <div class="pdp__option-head"><strong>Size</strong><button type="button" data-size-guide>Size guide</button></div>
              <div class="sizes" data-sizes>
                ${product.sizes
                  .map(
                    (size, i) =>
                      `<button class="size ${i === 0 ? 'is-active' : ''}" type="button" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`
                  )
                  .join('')}
              </div>
            </div>

            <div class="buy-row">
              <div class="qty">
                <button type="button" data-qty="-1" aria-label="Decrease quantity">${icon('minus')}</button>
                <input type="number" value="1" min="1" max="${Math.max(1, product.stock || 1)}" data-qty-input aria-label="Quantity" />
                <button type="button" data-qty="1" aria-label="Increase quantity">${icon('plus')}</button>
              </div>
              <button class="btn ${soldOut ? 'is-disabled' : ''}" type="button" data-add-to-bag ${soldOut ? 'disabled' : ''}>
                ${soldOut ? 'Sold out' : `Add to bag · ${price(product.price)}`}
              </button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
              <span class="stock-note ${soldOut ? '' : 'stock-note--ok'}"><span class="dot"></span>${soldOut ? 'Sold out — join the waitlist on WhatsApp' : product.stock <= 5 ? `Only ${product.stock} left in this size run` : 'In stock, ready to dispatch'}</span>
              <button class="pdp__wish ${isWished(product.slug) ? 'is-active' : ''}" type="button" data-wish="${product.slug}">${icon('heart')} <span>Save for later</span></button>
            </div>
            <div class="pdp__meta">
              <div>${icon('truck')}<span>Free delivery over ${price(state.settings.freeShippingThreshold)} · estimated ${d.start} – ${d.end}</span></div>
              <div>${icon('scissors')}<span>Complimentary alterations on stitched pieces at the Lahore atelier</span></div>
              <div>${icon('shield')}<span>${state.settings.returnWindow}-day exchange · ${sale ? 'Final sale — exchange only' : 'Easy returns on unworn pieces'}</span></div>
            </div>

            <div class="accordion">
              <details open>
                <summary>Details &amp; fabric ${icon('plus')}</summary>
                <div class="accordion__content">
                  <p style="margin-bottom:8px"><strong style="font-weight:500">${escapeHtml(product.pieces)}</strong> · ${escapeHtml(product.fabric)}</p>
                  <ul>${(product.details || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                </div>
              </details>
              <details>
                <summary>Care ${icon('plus')}</summary>
                <div class="accordion__content"><ul>${(product.care || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
              </details>
              <details>
                <summary>Delivery &amp; returns ${icon('plus')}</summary>
                <div class="accordion__content">
                  <p>Orders are dispatched from Lahore within 24–48 hours. Delivery is 2–4 working days across Pakistan and 5–9 working days internationally. Stitched pieces include one free alteration; unstitched fabric is not eligible for return.</p>
                </div>
              </details>
              <details>
                <summary>Reviews (${product.reviews?.length || 0}) ${icon('plus')}</summary>
                <div class="accordion__content">
                  ${
                    product.reviews?.length
                      ? `<div class="reviews">${product.reviews
                          .map(
                            (r) => `<div class="review"><div class="review__head"><strong>${escapeHtml(r.name)}</strong> · ${escapeHtml(r.city)} ${stars(r.rating)}</div><p>${escapeHtml(r.text)}</p></div>`
                          )
                          .join('')}</div>`
                      : `<p>No written reviews yet — but ${product.reviewCount || 0} customers have rated this piece ${(product.rating || 5).toFixed(1)}/5.</p>`
                  }
                </div>
              </details>
            </div>

            <div class="pdp__share">
              <button type="button" data-share style="color:var(--muted)">${icon('copy')} Share this piece</button>
              <a href="https://wa.me/${escapeHtml(state.settings.whatsapp)}?text=${whatsappText}" target="_blank" rel="noopener" style="color:var(--gold)">${icon('whatsapp')} Ask on WhatsApp</a>
            </div>
          </div>
        </div>
      </div>
    </div>

    ${
      related.length
        ? `<section class="section section--tight"><div class="container">
            ${sectionHead({ eyebrow: 'Complete the look', title: 'You may also love', link: `/shop?category=${product.category}`, linkLabel: 'Shop ' + product.category })}
            <div class="product-grid product-grid--related reveal">${related.map((p) => productCard(p)).join('')}</div>
          </div></section>`
        : ''
    }

    ${
      recent.length
        ? `<section class="section section--tight"><div class="container">
            ${sectionHead({ eyebrow: 'Where you left off', title: 'Recently viewed' })}
            <div class="product-grid reveal">${recent.map((p) => productCard(p)).join('')}</div>
          </div></section>`
        : ''
    }`;

  let size = product.sizes[0];
  let color = product.colors?.[0]?.name || '';
  let qty = 1;

  const qtyInput = app().querySelector('[data-qty-input]');
  app().querySelectorAll('[data-qty]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const max = Math.max(1, product.stock || 1);
      qty = Math.min(max, Math.max(1, qty + Number(btn.dataset.qty)));
      qtyInput.value = qty;
    })
  );
  qtyInput?.addEventListener('change', () => {
    qty = Math.max(1, Math.min(product.stock || 1, Number(qtyInput.value) || 1));
    qtyInput.value = qty;
  });

  app().querySelectorAll('[data-size]').forEach((btn) =>
    btn.addEventListener('click', () => {
      app().querySelectorAll('[data-size]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      size = btn.dataset.size;
    })
  );

  app().querySelectorAll('[data-color]').forEach((btn) =>
    btn.addEventListener('click', () => {
      app().querySelectorAll('[data-color]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      color = btn.dataset.color;
      const label = app().querySelector('[data-color-label]');
      if (label) label.textContent = color;
    })
  );

  app().querySelectorAll('[data-pdp-thumb]').forEach((thumb) =>
    thumb.addEventListener('click', () => {
      app().querySelector('[data-pdp-image]').src = thumb.dataset.pdpThumb;
      app().querySelectorAll('[data-pdp-thumb]').forEach((t) => t.classList.toggle('is-active', t === thumb));
    })
  );

  const main = app().querySelector('[data-pdp-main]');
  main?.addEventListener('click', () => main.classList.toggle('is-zoomed'));
  main?.addEventListener('mousemove', (e) => {
    if (!main.classList.contains('is-zoomed')) return;
    const rect = main.getBoundingClientRect();
    const img = main.querySelector('img');
    img.style.transformOrigin = `${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`;
  });

  app().querySelector('[data-add-to-bag]')?.addEventListener('click', () => {
    if (soldOut) return;
    addToCart(product, { size, color, qty });
    renderCartDrawer();
    refreshCounts();
    openCart();
  });

  app().querySelector('[data-size-guide]')?.addEventListener('click', sizeGuideModal);

  app().querySelector('[data-share]')?.addEventListener('click', () => {
    copyText(window.location.href, 'Product link copied');
  });

  setupReveal(app());
  refreshCounts();
}

/* -------------------------------------------------------------------- cart */

function cartMarkup() {
  const { lines } = cartDetails();
  const t = cartTotals();
  const promo = state.promo;
  const codes = state.promos.filter((p) => p.code !== promo?.code).slice(0, 3);

  if (!lines.length) {
    return `${pageHead({ crumbs: [{ label: 'Bag' }], title: 'Your bag' })}
      <div class="cart-page"><div class="container">${emptyState({
        title: 'Your bag is beautifully empty',
        text: 'The festive drop is live — hand-embellished pieces in limited runs. Start with what just landed.',
        action: 'Shop the drop',
        href: '/shop?drop=1'
      })}</div></div>`;
  }

  return `${pageHead({ crumbs: [{ label: 'Bag' }], title: 'Your bag', count: `${lines.reduce((n, l) => n + l.qty, 0)} items` })}
    <div class="cart-page" data-cart-page>
      <div class="container">
        <div class="cart-layout">
          <div>
            <div class="cart-lines">
              ${lines
                .map(
                  (line) => `
                <div class="cart-line">
                  <a class="cart-line__img" href="/product/${line.slug}"><img src="${line.product.images[0]}" alt="${escapeHtml(line.product.name)}" /></a>
                  <div class="cart-line__body">
                    <span class="cart-line__collection">${escapeHtml(line.product.collection)}</span>
                    <a class="cart-line__name" href="/product/${line.slug}">${escapeHtml(line.product.name)}</a>
                    <span class="cart-line__meta">${escapeHtml(line.product.pieces)} · ${escapeHtml(line.size)}${line.color ? ' · ' + escapeHtml(line.color) : ''}</span>
                    <div class="cart-line__controls">
                      <div class="qty">
                        <button type="button" data-cart-qty data-slug="${line.slug}" data-size="${escapeHtml(line.size)}" data-color="${escapeHtml(line.color)}" data-delta="-1" aria-label="Decrease quantity">${icon('minus')}</button>
                        <input type="number" value="${line.qty}" min="1" max="${line.product.stock || 20}" data-cart-qty-input data-slug="${line.slug}" data-size="${escapeHtml(line.size)}" data-color="${escapeHtml(line.color)}" aria-label="Quantity" />
                        <button type="button" data-cart-qty data-slug="${line.slug}" data-size="${escapeHtml(line.size)}" data-color="${escapeHtml(line.color)}" data-delta="1" aria-label="Increase quantity">${icon('plus')}</button>
                      </div>
                      <button class="cart-line__remove" type="button" data-cart-remove data-slug="${line.slug}" data-size="${escapeHtml(line.size)}" data-color="${escapeHtml(line.color)}">Remove</button>
                    </div>
                  </div>
                  <div class="cart-line__price">
                    ${price(line.lineTotal)}
                    ${line.qty > 1 ? `<small>${price(line.product.price)} each</small>` : ''}
                  </div>
                </div>`
                )
                .join('')}
            </div>
            <div style="margin-top:22px"><a class="link-arrow" href="/shop">${icon('arrowLeft')} Continue shopping</a></div>
          </div>

          <aside class="summary" aria-label="Order summary">
            <h2>Order summary</h2>
            ${shipMeter(t)}
            <div class="voucher">
              ${
                promo
                  ? `<div class="voucher__applied"><span>${icon('check')} <strong>${escapeHtml(promo.code)}</strong> applied</span><button type="button" data-remove-promo>Remove</button></div>`
                  : `<form class="voucher__row" data-promo-form>
                      <input type="text" name="code" placeholder="Promo code" aria-label="Promo code" autocomplete="off" />
                      <button class="btn btn--sm" type="submit">Apply</button>
                    </form>
                    <p class="form-note" data-promo-note></p>
                    <div class="voucher__codes">
                      ${codes.map((c) => `<button type="button" data-use-code="${escapeHtml(c.code)}">${escapeHtml(c.code)}</button>`).join('')}
                    </div>`
              }
            </div>
            ${summaryTotals(t, promo)}
            <a class="btn btn--block" href="/checkout" style="margin-top:4px">Checkout securely</a>
            <p class="secure-note">${icon('lock')} Cash on delivery · Bank transfer · Card on delivery</p>
            <p class="summary__note">Taxes included. Free alterations on stitched pieces. Unstitched fabric and jewellery are exchange only.</p>
          </aside>
        </div>
      </div>
    </div>`;
}

export function cartPage() {
  revalidatePromo();
  app().innerHTML = cartMarkup();
  bindCartPage();
  refreshCounts();
}

function bindCartPage() {
  const root = app();
  const paintAgain = () => {
    const y = window.scrollY;
    cartPage();
    window.scrollTo(0, y);
  };

  root.querySelectorAll('[data-cart-qty]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const line = { slug: btn.dataset.slug, size: btn.dataset.size, color: btn.dataset.color };
      const current = state.cart.find((l) => l.slug === line.slug && l.size === line.size && l.color === line.color);
      updateCartQty(line, (current?.qty || 1) + Number(btn.dataset.delta));
      paintAgain();
    });
  });

  root.querySelectorAll('[data-cart-qty-input]').forEach((input) => {
    input.addEventListener('change', () => {
      updateCartQty({ slug: input.dataset.slug, size: input.dataset.size, color: input.dataset.color }, input.value);
      paintAgain();
    });
  });

  root.querySelectorAll('[data-cart-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeFromCart({ slug: btn.dataset.slug, size: btn.dataset.size, color: btn.dataset.color });
      toast('Removed from your bag');
      paintAgain();
    });
  });

  const applyPromo = async (code) => {
    const note = root.querySelector('[data-promo-note]');
    if (!code) return;
    if (note) {
      note.textContent = 'Checking your code…';
      note.className = 'form-note';
    }
    try {
      const res = await api.validatePromo(code, cartTotals().subtotal);
      setPromo({
        code: res.code,
        type: res.type,
        value: res.value,
        freeShipping: res.freeShipping,
        description: res.description,
        minOrder: state.promos.find((p) => p.code === res.code)?.minOrder || 0
      });
      toast(`${res.code} applied — you saved ${price(res.discount || 0)}`, 'success');
      paintAgain();
    } catch (err) {
      if (note) {
        note.textContent = err.message;
        note.className = 'form-note is-error';
      }
    }
  };

  root.querySelector('[data-promo-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    applyPromo(String(new FormData(e.target).get('code') || '').trim());
  });
  root.querySelectorAll('[data-use-code]').forEach((btn) => btn.addEventListener('click', () => applyPromo(btn.dataset.useCode)));
  root.querySelector('[data-remove-promo]')?.addEventListener('click', () => {
    clearPromo();
    toast('Promo code removed');
    paintAgain();
  });

  if (window.__ieCartListener) window.removeEventListener('ie:refresh-cart', window.__ieCartListener);
  const external = () => {
    if (document.querySelector('[data-cart-page]')) paintAgain();
  };
  window.__ieCartListener = external;
  window.addEventListener('ie:refresh-cart', external);
}

/* ---------------------------------------------------------------- checkout */

export async function checkoutPage() {
  const { lines } = cartDetails();
  if (!lines.length) {
    navigate('/cart', { replace: true });
    return;
  }
  const t = cartTotals();

  // Gate: require Google login when Firebase is enabled
  const requireAuth = state.firebase?.requireAuthForOrders || state.firebase?.enabled;
  const fbUser = getCurrentUser() || state.user;

  if (requireAuth && !fbUser) {
    app().innerHTML = `
      ${pageHead({ crumbs: [{ label: 'Bag', href: '/cart' }, { label: 'Checkout' }], title: 'Sign in to checkout', desc: 'Please sign in with Google to place your order — it takes 10 seconds.' })}
      <div class="checkout"><div class="container">
        <div style="max-width:560px;margin:0 auto;text-align:center;padding:48px 24px;background:#fff;border:1px solid var(--line);box-shadow:var(--shadow-sm)">
          <div style="font-size:42px;margin-bottom:12px">🔒</div>
          <h2 style="font-family:var(--serif);font-size:28px">Sign in to place your order</h2>
          <p style="color:var(--muted);margin-top:10px;line-height:1.7">We use Google sign-in to keep your orders secure and to keep spam out of the atelier. Your details are only used to fulfil your order.</p>
          <button class="btn" type="button" data-auth-gate style="margin-top:22px;display:inline-flex;align-items:center;gap:10px;padding:12px 22px">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".7"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity=".7"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity=".7"/></svg>
            Continue with Google
          </button>
          <p class="form-note" data-auth-note style="margin-top:14px"></p>
          <div style="margin-top:18px"><a class="link-arrow" href="/cart">${icon('arrowLeft')} Back to bag</a></div>
          <div style="margin-top:14px;font-size:12px;color:var(--muted)">Having trouble? Email <a href="mailto:${escapeHtml(state.settings.email)}" style="color:var(--gold)">${escapeHtml(state.settings.email)}</a></div>
        </div>
      </div></div>`;
    app().querySelector('[data-auth-gate]')?.addEventListener('click', async () => {
      const note = app().querySelector('[data-auth-note]');
      const btn = app().querySelector('[data-auth-gate]');
      btn.disabled = true; btn.textContent = 'Opening Google…';
      try {
        const { user } = await signInWithGoogle();
        setUser(user);
        toast(`Welcome, ${user.name}!`, 'success');
        checkoutPage();
      } catch (err) {
        if (note) { note.textContent = err.message; note.className = 'form-note is-error'; }
        btn.disabled = false; btn.innerHTML = 'Continue with Google';
      }
    });
    return;
  }

  app().innerHTML = `
    ${pageHead({ crumbs: [{ label: 'Bag', href: '/cart' }, { label: 'Checkout' }], title: 'Checkout', desc: 'Two minutes, and the atelier is on its way.' })}
    <div class="checkout">
      <div class="container">
        <div class="checkout-layout">
          <form class="checkout-form" data-checkout novalidate>
            <section class="form-section">
              <div class="form-section__head"><span class="form-section__num">01</span><h2>Contact</h2></div>
              <div class="form-grid">
                <div class="field field--full"><label for="co-name">Full name *</label><input id="co-name" name="name" autocomplete="name" placeholder="Ayesha Khan" /><span class="field__error" data-error="name"></span></div>
                <div class="field"><label for="co-phone">Phone / WhatsApp *</label><input id="co-phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="03xx xxx xxxx" /><span class="field__error" data-error="phone"></span></div>
                <div class="field"><label for="co-email">Email</label><input id="co-email" name="email" type="email" autocomplete="email" placeholder="you@email.com" /><span class="field__error" data-error="email"></span></div>
              </div>
            </section>

            <section class="form-section">
              <div class="form-section__head"><span class="form-section__num">02</span><h2>Delivery address</h2></div>
              <div class="form-grid">
                <div class="field field--full"><label for="co-address">Street address *</label><input id="co-address" name="address" autocomplete="street-address" placeholder="House / flat, street, area" /><span class="field__error" data-error="address"></span></div>
                <div class="field"><label for="co-city">City *</label><input id="co-city" name="city" autocomplete="address-level2" placeholder="Lahore" /><span class="field__error" data-error="city"></span></div>
                <div class="field"><label for="co-postal">Postal code</label><input id="co-postal" name="postal" autocomplete="postal-code" placeholder="54000" /></div>
                <div class="field field--full"><label for="co-notes">Notes for the atelier</label><textarea id="co-notes" name="notes" placeholder="Alteration requests, delivery timing, a gift note…"></textarea></div>
              </div>
            </section>

            <section class="form-section">
              <div class="form-section__head"><span class="form-section__num">03</span><h2>Payment</h2></div>
              <div class="pay-options">
                <label class="pay-option"><input type="radio" name="payment" value="cod" checked /><span class="pay-option__body"><span class="pay-option__title">Cash on delivery</span><span class="pay-option__text">Pay the courier when your parcel arrives. Available across Pakistan.</span></span></label>
                <label class="pay-option"><input type="radio" name="payment" value="bank" /><span class="pay-option__body"><span class="pay-option__title">Bank transfer</span><span class="pay-option__text">We will WhatsApp transfer details immediately after you place the order.</span></span></label>
                <label class="pay-option"><input type="radio" name="payment" value="card" /><span class="pay-option__body"><span class="pay-option__title">Card on delivery</span><span class="pay-option__text">Our rider carries a card machine. Add a note if you need this.</span></span></label>
              </div>
              <p class="form-note" data-checkout-note></p>
            </section>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:10px 12px;background:#faf7f1;border:1px solid var(--line);font-size:13px">
              <span style="display:flex;align-items:center;gap:10px">
                ${fbUser?.picture ? `<img src="${escapeHtml(fbUser.picture)}" alt="" style="width:28px;height:28px;border-radius:50%" />` : ''}
                <span>Ordering as <strong>${escapeHtml(fbUser.name || fbUser.email)}</strong><br/><span style="color:var(--muted);font-size:11px">${escapeHtml(fbUser.email)}</span></span>
              </span>
              <button type="button" data-checkout-signout style="font-size:11px;color:var(--muted);text-decoration:underline">Not you? Sign out</button>
            </div>
            <button class="btn btn--block" type="submit" data-place-order>Place order · ${price(t.total)}</button>
            <p class="secure-note">${icon('lock')} This is a demo checkout — no payment is taken and no card details are stored.</p>
          </form>

          <aside class="summary checkout-summary order-summary-col" aria-label="Order summary">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
              <h2>Your order</h2>
              <a href="/cart" style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)">Edit bag</a>
            </div>
            <div class="checkout-items">
              ${lines
                .map(
                  (line) => `
                <div class="checkout-item">
                  <div class="checkout-item__img"><img src="${line.product.images[0]}" alt="" /><span>${line.qty}</span></div>
                  <div>
                    <div class="checkout-item__name">${escapeHtml(line.product.name)}</div>
                    <div class="checkout-item__meta">${escapeHtml(line.size)}${line.color ? ' · ' + escapeHtml(line.color) : ''}</div>
                  </div>
                  <div class="checkout-item__price">${price(line.lineTotal)}</div>
                </div>`
                )
                .join('')}
            </div>
            ${summaryTotals(t, state.promo)}
            <p class="summary__note">${state.promo ? `Promo <strong>${escapeHtml(state.promo.code)}</strong> applied.` : 'Have a code? Add it in your bag before checkout.'}</p>
          </aside>
        </div>
      </div>
    </div>`;

  const form = app().querySelector('[data-checkout]');
  const setError = (name, message) => {
    const field = form.querySelector(`[name="${name}"]`)?.closest('.field');
    const err = form.querySelector(`[data-error="${name}"]`);
    if (field) field.classList.toggle('is-invalid', Boolean(message));
    if (err) err.textContent = message || '';
  };

  const validate = () => {
    const values = Object.fromEntries(new FormData(form).entries());
    let ok = true;
    const checks = [
      ['name', values.name?.trim().length >= 2 ? '' : 'Please enter your full name.'],
      ['phone', /^[0-9+\-\s()]{9,20}$/.test((values.phone || '').trim()) ? '' : 'Enter a valid Pakistani phone number.'],
      ['address', (values.address || '').trim().length >= 8 ? '' : 'A complete street address is required.'],
      ['city', (values.city || '').trim().length >= 2 ? '' : 'Please enter your city.']
    ];
    checks.forEach(([name, message]) => {
      setError(name, message);
      if (message) ok = false;
    });
    return { ok, values };
  };

  // Prefill name/email from Google account
  if (fbUser) {
    if (!form.querySelector('[name="name"]').value) form.querySelector('[name="name"]').value = fbUser.name || '';
    if (!form.querySelector('[name="email"]').value) form.querySelector('[name="email"]').value = fbUser.email || '';
  }
  form.querySelector('[data-checkout-signout]')?.addEventListener('click', async () => {
    const { signOutUser } = await import('./firebase.js');
    const { clearUser } = await import('./state.js');
    await signOutUser(); clearUser();
    toast('Signed out — please sign in again to continue.');
    checkoutPage();
  });

  form.querySelectorAll('input, textarea').forEach((input) =>
    input.addEventListener('input', () => {
      if (input.name) setError(input.name, '');
    })
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { ok, values } = validate();
    if (!ok) {
      toast('Please check the highlighted fields.', 'error');
      form.querySelector('.is-invalid input, .is-invalid textarea')?.focus();
      return;
    }
    const btn = form.querySelector('[data-place-order]');
    btn.disabled = true;
    btn.textContent = 'Placing your order…';
    try {
      const res = await api.createOrder({
        items: state.cart.map((l) => ({ slug: l.slug, size: l.size, color: l.color, qty: l.qty })),
        customer: {
          name: values.name,
          phone: values.phone,
          email: values.email,
          address: values.address,
          city: values.city,
          notes: [values.notes, values.postal ? `Postal code: ${values.postal}` : ''].filter(Boolean).join('\n')
        },
        paymentMethod: values.payment,
        promoCode: state.promo?.code || null
      });
      sessionStorage.setItem('ie_last_order', JSON.stringify(res.order));
      clearPromo();
      state.cart = [];
      localStorage.setItem('ie_cart_v1', '[]');
      renderCartDrawer();
      refreshCounts();
      navigate(`/order/${res.order.number}?phone=${encodeURIComponent(res.order.customer.phone)}`, { replace: true });
      window.dispatchEvent(new Event('ie:refresh-cart'));
    } catch (err) {
      toast(err.message, 'error');
      const note = form.querySelector('[data-checkout-note]');
      if (note) {
        note.textContent = err.message;
        note.className = 'form-note is-error';
      }
      btn.disabled = false;
      btn.textContent = `Place order · ${price(cartTotals().total)}`;
    }
  });
}

/* ------------------------------------------------------------- order pages */

function orderDetailsMarkup(order) {
  const statusSteps = ['pending', 'confirmed', 'packed', 'shipped', 'delivered'];
  const currentIndex = Math.max(0, statusSteps.indexOf(order.status));
  const payments = { cod: 'Cash on delivery', bank: 'Bank transfer', card: 'Card on delivery' };
  return `
    <div class="order-summary-box">
      <h2>Order summary</h2>
      ${order.items
        .map(
          (item) => `
        <div class="checkout-item">
          <div class="checkout-item__img"><img src="${item.image}" alt="" /><span>${item.qty}</span></div>
          <div>
            <div class="checkout-item__name">${escapeHtml(item.name)}</div>
            <div class="checkout-item__meta">${escapeHtml(item.size)}${item.color ? ' · ' + escapeHtml(item.color) : ''}</div>
          </div>
          <div class="checkout-item__price">${price(item.lineTotal)}</div>
        </div>`
        )
        .join('')}
      <div class="summary__rows" style="margin-top:8px">
        <div class="summary__row"><span>Subtotal</span><span>${price(order.subtotal)}</span></div>
        ${order.discount ? `<div class="summary__row summary__row--discount"><span>Discount ${order.promoCode ? `(${escapeHtml(order.promoCode)})` : ''}</span><span>− ${price(order.discount)}</span></div>` : ''}
        <div class="summary__row"><span>Delivery</span><span>${order.shipping ? price(order.shipping) : 'Free'}</span></div>
        <div class="summary__row"><span>Payment</span><span>${escapeHtml(payments[order.payment] || order.payment)}</span></div>
      </div>
      <div class="summary__total"><span>Total</span><strong>${price(order.total)}</strong></div>
      <div style="font-size:12px;line-height:1.7;color:var(--ink-soft);border-top:1px solid var(--line);padding-top:14px">
        <strong style="font-weight:500">Deliver to</strong><br />
        ${escapeHtml(order.customer.name)} · ${escapeHtml(order.customer.phone)}<br />
        ${nl2br(order.customer.address)}<br />
        ${escapeHtml(order.customer.city)}
      </div>
    </div>
    <div class="order-done__progress" style="margin-top:22px">
      <h2 style="font-family:var(--sans);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)">Progress</h2>
      <div class="timeline">
        ${statusSteps
          .map(
            (step, i) => `
          <div class="timeline__step ${i <= currentIndex ? 'is-done' : ''}">
            <span class="timeline__dot"></span>
            <div>
              <div class="timeline__title">${step === 'pending' ? 'Order placed' : step[0].toUpperCase() + step.slice(1)}</div>
              <div class="timeline__date">${i === 0 ? formatDate(order.createdAt) : i <= currentIndex ? 'In progress' : 'Pending'}</div>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>`;
}

export async function orderPage({ number }) {
  const params = queryParams();
  let order = null;
  try {
    const cached = JSON.parse(sessionStorage.getItem('ie_last_order') || 'null');
    if (cached && cached.number === number) order = cached;
  } catch (_) {}
  const phone = params.get('phone');

  if (!order && phone) {
    try {
      const res = await api.trackOrder(number, phone);
      order = res.order;
    } catch (_) {}
  }

  if (!order) {
    app().innerHTML = `
      ${pageHead({ crumbs: [{ label: 'Order' }, { label: number }], title: 'Find your order' })}
      <div class="track"><div class="container"><div class="track__box">
        <form class="track__form" data-order-lookup>
          <p style="font-size:13.5px;color:var(--ink-soft)">For your privacy, enter the phone number used on order <strong>${escapeHtml(number)}</strong>.</p>
          <div class="field"><label for="lookup-phone">Phone number</label><input id="lookup-phone" name="phone" inputmode="tel" placeholder="03xx xxx xxxx" required /></div>
          <button class="btn" type="submit">View order</button>
          <p class="form-note" data-lookup-note></p>
        </form>
      </div></div></div>`;
    app().querySelector('[data-order-lookup]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = app().querySelector('[data-lookup-note]');
      try {
        const res = await api.trackOrder(number, new FormData(e.target).get('phone'));
        sessionStorage.setItem('ie_last_order', JSON.stringify(res.order));
        navigate(`/order/${number}?phone=${encodeURIComponent(e.target.phone.value)}`, { replace: true });
      } catch (err) {
        note.textContent = err.message;
        note.className = 'form-note is-error';
      }
    });
    return;
  }

  const waMessage = encodeURIComponent(`Assalam-o-alaikum! I just placed order ${order.number} for ${price(order.total)}. Can you confirm it?`);
  app().innerHTML = `
    ${pageHead({ crumbs: [{ label: 'Order' }, { label: order.number }], title: '' })}
    <div class="order-done">
      <div class="container">
        <div class="order-done__card">
          <div class="order-done__icon">${icon('check')}</div>
          <h1>Shukriya, ${escapeHtml(order.customer.name.split(' ')[0])}.</h1>
          <p class="order-done__lead">Your order is with the atelier. We will WhatsApp you on ${escapeHtml(order.customer.phone)} to confirm sizing and delivery — usually within a couple of hours.</p>
          <div class="order-done__number"><span>Order</span><strong>${escapeHtml(order.number)}</strong></div>
          ${orderDetailsMarkup(order)}
          <div class="order-done__actions">
            <a class="btn" href="/shop">Continue shopping</a>
            <a class="btn btn--ghost" href="https://wa.me/${escapeHtml(state.settings.whatsapp)}?text=${waMessage}" target="_blank" rel="noopener">${icon('whatsapp')} Confirm on WhatsApp</a>
            <a class="btn btn--ghost" href="/track?number=${encodeURIComponent(order.number)}&phone=${encodeURIComponent(order.customer.phone)}">Track order</a>
          </div>
        </div>
      </div>
    </div>`;
  refreshCounts();
}

/* ------------------------------------------------------------------- track */

export async function trackPage() {
  app().innerHTML = `
    ${pageHead({ crumbs: [{ label: 'Track order' }], title: 'Track your order', desc: 'Enter your order number and the phone number you used at checkout.' })}
    <div class="track">
      <div class="container">
        <div class="track__box">
          <form class="track__form" data-track-form>
            <div class="form-grid">
              <div class="field"><label for="track-number">Order number</label><input id="track-number" name="number" placeholder="IE-123456" required /></div>
              <div class="field"><label for="track-phone">Phone number</label><input id="track-phone" name="phone" inputmode="tel" placeholder="03xx xxx xxxx" required /></div>
            </div>
            <button class="btn" type="submit">Find my order</button>
            <p class="form-note" data-track-note>Your order number is on the confirmation screen and in your WhatsApp message.</p>
          </form>
          <div data-track-result></div>
        </div>
      </div>
    </div>`;

  const form = app().querySelector('[data-track-form]');
  const result = app().querySelector('[data-track-result]');
  const prefill = queryParams().get('number');
  if (prefill) form.querySelector('[name="number"]').value = prefill;
  const phonePrefill = queryParams().get('phone');
  if (phonePrefill) form.querySelector('[name="phone"]').value = phonePrefill;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = form.querySelector('[data-track-note]');
    note.textContent = 'Looking up your order…';
    note.className = 'form-note';
    try {
      const trackData = new FormData(form);
      const res = await api.trackOrder(String(trackData.get('number')).trim(), String(trackData.get('phone')).trim());
      const order = res.order;
      note.textContent = '';
      result.innerHTML = `
        <div class="track__result">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
            <div>
              <span class="eyebrow eyebrow--plain">Order ${escapeHtml(order.number)}</span>
              <h2 style="font-size:30px;margin-top:6px">${escapeHtml(order.customer.name)}</h2>
              <p class="text-muted" style="font-size:12px;margin-top:4px">Placed ${formatDate(order.createdAt)}</p>
            </div>
            <span class="order-status order-status--${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>
          </div>
          ${orderDetailsMarkup(order)}
        </div>`;
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      note.textContent = err.message;
      note.className = 'form-note is-error';
      result.innerHTML = '';
    }
  });
}

/* ---------------------------------------------------------------- wishlist */

export function wishlistPage() {
  const items = state.wishlist.map((slug) => state.products.find((p) => p.slug === slug)).filter(Boolean);
  app().innerHTML = `
    ${pageHead({ crumbs: [{ label: 'Wishlist' }], title: 'Your wishlist', count: `${items.length} piece${items.length === 1 ? '' : 's'}` })}
    <div class="wishlist-page">
      <div class="container" data-wishlist-wrap>
        ${
          items.length
            ? `<div class="product-grid">${items.map((p) => productCard(p)).join('')}</div>`
            : emptyState({
                title: 'Nothing saved yet',
                text: 'Tap the heart on any piece to keep it here while you decide.',
                action: 'Browse the collection',
                href: '/shop'
              })
        }
      </div>
    </div>`;
  refreshCounts();
}

export async function accountPage() {
  const user = getCurrentUser() || state.user;
  if (!user) {
    app().innerHTML = `
      ${pageHead({ crumbs: [{ label: 'My account' }], title: 'My account', desc: 'Sign in to see your orders.' })}
      <div class="container" style="max-width:560px;margin:0 auto;padding:32px 16px">
        <div style="text-align:center;padding:40px 24px;background:#fff;border:1px solid var(--line)">
          <h2 style="font-family:var(--serif);font-size:26px">Sign in to view your orders</h2>
          <p style="color:var(--muted);margin-top:10px">Your orders are linked to your Google account.</p>
          <button class="btn" type="button" data-account-signin style="margin-top:18px;display:inline-flex;align-items:center;gap:10px">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84"/></svg>
            Continue with Google
          </button>
          <p class="form-note" data-account-note></p>
        </div>
      </div>`;
    app().querySelector('[data-account-signin]')?.addEventListener('click', async () => {
      try {
        const { user: u } = await signInWithGoogle();
        setUser(u);
        accountPage();
      } catch (err) {
        const note = app().querySelector('[data-account-note]');
        if (note) { note.textContent = err.message; note.className = 'form-note is-error'; }
      }
    });
    return;
  }

  app().innerHTML = `
    ${pageHead({ crumbs: [{ label: 'My account' }], title: `Hi, ${escapeHtml(user.name || user.email)}`, desc: escapeHtml(user.email) })}
    <div class="account-page"><div class="container">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:18px;padding:14px;background:#fff;border:1px solid var(--line)">
        ${user.picture ? `<img src="${escapeHtml(user.picture)}" alt="" style="width:48px;height:48px;border-radius:50%" />` : `<span style="width:48px;height:48px;border-radius:50%;background:var(--sand);display:grid;place-items:center;font-weight:600">${escapeHtml((user.name||user.email).charAt(0).toUpperCase())}</span>`}
        <div style="flex:1"><strong>${escapeHtml(user.name || user.email)}</strong><br/><span style="color:var(--muted);font-size:12px">${escapeHtml(user.email)}</span></div>
        <button class="btn btn--ghost btn--sm" type="button" data-account-signout>Sign out</button>
      </div>
      <div class="account-orders" data-account-orders><p class="form-note">Loading your orders…</p></div>
    </div></div>`;

  app().querySelector('[data-account-signout]')?.addEventListener('click', async () => {
    const { signOutUser } = await import('./firebase.js');
    const { clearUser } = await import('./state.js');
    await signOutUser(); clearUser();
    accountPage();
  });

  const ordersEl = app().querySelector('[data-account-orders]');
  try {
    const { orders } = await api.myOrders();
    if (!orders.length) {
      ordersEl.innerHTML = emptyState({ title: 'No orders yet', text: 'Your orders will appear here after checkout.', action: 'Shop the drop', href: '/shop?drop=1' });
    } else {
      ordersEl.innerHTML = `<div class="table-wrap"><table class="data" style="background:#fff"><thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>
        ${orders.map(o => `<tr class="is-clickable" data-go-order="${escapeHtml(o.number)}"><td><strong>${escapeHtml(o.number)}</strong></td><td>${formatDate(o.createdAt)}</td><td>${o.items.reduce((n,i)=>n+i.qty,0)}</td><td>${price(o.total)}</td><td><span class="status status--${escapeHtml(o.status)}">${escapeHtml(o.status)}</span></td></tr>`).join('')}
      </tbody></table></div>`;
      ordersEl.querySelectorAll('[data-go-order]').forEach(row => row.addEventListener('click', () => navigate('/order/' + encodeURIComponent(row.dataset.goOrder))));
    }
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED' || err.status === 401) {
      ordersEl.innerHTML = `<p class="form-note is-error">Please sign in again: ${escapeHtml(err.message)}</p>`;
    } else {
      ordersEl.innerHTML = `<p class="form-note is-error">${escapeHtml(err.message)}</p>`;
    }
  }
  refreshCounts();
}

/* ------------------------------------------------------------------- about */

export function aboutPage() {
  const s = state.settings;
  const values = s.values || [];
  app().innerHTML = `
    <div class="about-hero">
      <img src="${escapeHtml(s.aboutImage || '/images/boutique/atelier.jpg')}" alt="The Ismail Elegance atelier" />
      <div class="container about-hero__body">
        <span class="eyebrow" style="color:var(--gold-soft)">Since 2019 · Lahore</span>
        <h1>${escapeHtml(s.aboutHeading || 'A Lahore atelier, built on cloth and conversation')}</h1>
      </div>
    </div>
    <section class="section">
      <div class="container about-intro">
        <div>
          <span class="eyebrow">Our story</span>
          <h2 style="margin-top:12px">Small runs. Real hands.<br />Honest cloth.</h2>
        </div>
        <div class="about-intro__text">${nl2br(s.aboutText || '')}</div>
      </div>
    </section>
    <section class="section section--tight">
      <div class="container">
        <div class="values">
          ${values
            .map(
              (v, i) => `<div class="value"><span class="value__num">0${i + 1}</span><h3>${escapeHtml(v.title)}</h3><p>${escapeHtml(v.text)}</p></div>`
            )
            .join('')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="gallery-3 reveal">
          <div><img src="${escapeHtml(s.aboutImage || '/images/boutique/atelier.jpg')}" alt="Inside the atelier" loading="lazy" /></div>
          <div><img src="/images/boutique/boutique-racks.jpg" alt="Racks inside the atelier" loading="lazy" /></div>
          <div><img src="/images/products/fabric-detail.jpg" alt="Hand embroidery detail" loading="lazy" /></div>
        </div>
      </div>
    </section>
    <section class="section section--tight">
      <div class="container">
        <div class="editorial reveal">
          <div class="editorial__media">
            <img src="/images/boutique/salon.jpg" alt="The main salon on MM Alam Road" loading="lazy" />
            <span class="editorial__tag">The salon · ${escapeHtml((s.address || '').split(',')[1]?.trim() || 'Lahore')}</span>
          </div>
          <div class="editorial__body">
            <span class="eyebrow">Come and see</span>
            <h2 class="editorial__title">The kettle is always on.</h2>
            <p class="editorial__text">Our salon on MM Alam Road carries the full collection, plus one-off pieces that never make it online. Come in for a fitting; we will help you choose the dupatta, the jewellery and the alterations.</p>
            <p class="editorial__text" style="margin-top:14px">${escapeHtml(s.address)}<br />${escapeHtml(s.hours)}</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px">
              <a class="btn" href="/contact">Plan a visit</a>
              <a class="btn btn--ghost" href="https://wa.me/${escapeHtml(s.whatsapp)}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp us</a>
            </div>
          </div>
        </div>
      </div>
    </section>`;
  setupReveal(app());
  refreshCounts();
}

/* ----------------------------------------------------------------- contact */

export function contactPage() {
  const s = state.settings;
  app().innerHTML = `
    ${pageHead({ crumbs: [{ label: 'Contact' }], title: 'Talk to the atelier', desc: 'Sizing questions, alterations, bridal appointments or a note about an order — we answer everything ourselves.' })}
    <div class="section">
      <div class="container">
        <div class="contact-layout">
          <div class="contact-details">
            <div class="contact-card">
              <span class="contact-card__icon">${icon('pin')}</span>
              <div><h3>Visit</h3><p>${escapeHtml(s.address)}</p><p class="text-muted" style="font-size:12px;margin-top:4px">${escapeHtml(s.hours)}</p></div>
            </div>
            <div class="contact-card">
              <span class="contact-card__icon">${icon('phone')}</span>
              <div><h3>Call or WhatsApp</h3><a href="tel:${escapeHtml(s.phone.replace(/\s/g, ''))}">${escapeHtml(s.phone)}</a><p style="font-size:12px;margin-top:4px"><a href="https://wa.me/${escapeHtml(s.whatsapp)}" target="_blank" rel="noopener" style="color:var(--gold)">Message us on WhatsApp</a></p></div>
            </div>
            <div class="contact-card">
              <span class="contact-card__icon">${icon('mail')}</span>
              <div><h3>Email</h3><a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a><p class="text-muted" style="font-size:12px;margin-top:4px">Replies within one working day</p></div>
            </div>
            <div class="contact-card" style="border-bottom:0">
              <span class="contact-card__icon">${icon('instagram')}</span>
              <div><h3>Follow</h3>
                <p style="display:flex;flex-wrap:wrap;gap:12px;margin-top:2px">
                  ${[['Instagram', s.instagram], ['Facebook', s.facebook], ['TikTok', s.tiktok], ['Pinterest', s.pinterest]]
                    .filter(([, url]) => url)
                    .map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color:var(--gold)">${label}</a>`)
                    .join('')}
                </p>
              </div>
            </div>
            <div class="map-card">
              <div class="map-card__grid"></div>
              <div class="map-card__pin">${icon('pin')}<strong>Gulberg III</strong><span>MM Alam Road · Lahore</span><a class="link-arrow" href="https://maps.google.com/?q=${encodeURIComponent(s.address)}" target="_blank" rel="noopener" style="font-size:10px">Open in maps ${icon('arrowRight')}</a></div>
            </div>
          </div>

          <form class="contact-form" data-contact-form>
            <div>
              <span class="eyebrow eyebrow--plain">Write to us</span>
              <h2 style="font-size:30px;margin-top:8px">How can we help?</h2>
            </div>
            <div class="form-grid">
              <div class="field"><label for="ct-name">Name *</label><input id="ct-name" name="name" required placeholder="Your name" /></div>
              <div class="field"><label for="ct-phone">Phone / WhatsApp</label><input id="ct-phone" name="phone" inputmode="tel" placeholder="03xx xxx xxxx" /></div>
              <div class="field field--full"><label for="ct-email">Email</label><input id="ct-email" name="email" type="email" placeholder="you@email.com" /></div>
              <div class="field field--full"><label for="ct-message">Message *</label><textarea id="ct-message" name="message" required placeholder="Tell us what you are looking for…"></textarea></div>
            </div>
            <button class="btn" type="submit">Send message</button>
            <p class="form-note" data-contact-note>We read every message. For urgent sizing help, WhatsApp is fastest.</p>
          </form>
        </div>
      </div>
    </div>`;

  const form = app().querySelector('[data-contact-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = form.querySelector('[data-contact-note]');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const fd = new FormData(form);
      const res = await api.contact({
        name: fd.get('name'),
        email: fd.get('email'),
        phone: fd.get('phone'),
        message: fd.get('message')
      });
      note.textContent = res.message;
      note.className = 'form-note is-success';
      form.reset();
    } catch (err) {
      note.textContent = err.message;
      note.className = 'form-note is-error';
    } finally {
      btn.disabled = false;
    }
  });
  refreshCounts();
}

/* -------------------------------------------------------------------- quiz */

const QUIZ = [
  {
    question: 'What are we dressing for?',
    hint: 'Pick the closest occasion — we will do the rest.',
    options: [
      { key: 'wedding', label: 'A wedding', text: 'Mehndi, baraat, valima', marks: { bridal: 2, formals: 2 } },
      { key: 'festive', label: 'A festive evening', text: 'Eid, dinners, mehfil', marks: { formals: 2, pret: 1 } },
      { key: 'everyday', label: 'Everyday', text: 'Work, lunch, school run', marks: { pret: 2, lawn: 2 } },
      { key: 'summer', label: 'Summer days', text: 'Something light and easy', marks: { lawn: 2, unstitched: 1 } }
    ]
  },
  {
    question: 'Which silhouette feels like you?',
    hint: 'There is no wrong answer, only the one you reach for.',
    options: [
      { key: 'flowing', label: 'Flowing & layered', text: 'Ghararas, lehngas, pishwas', marks: { bridal: 2, formals: 1 } },
      { key: 'straight', label: 'Straight & easy', text: 'Kurtas, cigarette pants', marks: { pret: 2, lawn: 1 } },
      { key: 'structured', label: 'Structured & dramatic', text: 'Shararas, capes, organza', marks: { formals: 2, bridal: 1 } },
      { key: 'classic', label: 'Classic three-piece', text: 'Shirt, trouser, dupatta', marks: { lawn: 2, unstitched: 1 } }
    ]
  },
  {
    question: 'And your palette?',
    hint: 'The colours already in your wardrobe.',
    options: [
      { key: 'ivory', label: 'Ivory & antique gold', text: 'Soft, bridal, timeless', marks: { bridal: 2, formals: 1 } },
      { key: 'ink', label: 'Ink, emerald & wine', text: 'Deep and a little moody', marks: { formals: 2, pret: 1 } },
      { key: 'blush', label: 'Blush, rose & sand', text: 'Warm neutrals', marks: { lawn: 2, pret: 1 } },
      { key: 'print', label: 'Prints & colour', text: 'Cobalt, marigold, garden florals', marks: { lawn: 2, unstitched: 1 } }
    ]
  }
];

const QUIZ_RESULTS = {
  bridal: {
    title: 'A bridal soul',
    text: 'You want one piece that carries the whole evening. Start with hand-embellished pishwas and ghararas — and book a fitting; our bridal pieces are made to your measurements.',
    cta: 'Shop bridal'
  },
  formals: {
    title: 'A formal heart',
    text: 'You dress for the room. Chiffon, organza and a little drama — pieces that photograph as well as they move.',
    cta: 'Shop formals'
  },
  pret: {
    title: 'Quietly modern',
    text: 'You want clothes that work as hard as you do. Textured cotton-silk, chikankari and block prints — dressed up or down.',
    cta: 'Shop luxe pret'
  },
  lawn: {
    title: 'A garden romantic',
    text: 'Sunlight, lawn and an easy dupatta. You will live in these all summer — and they will still look considered at dinner.',
    cta: 'Shop lawn'
  },
  unstitched: {
    title: 'A fabric collector',
    text: 'You know your tailor and you know what you like. Our fabric library is where you should start.',
    cta: 'Shop unstitched'
  }
};

export function quizPage() {
    let step = 0;
    const answers = {};

    const paint = () => {
      if (step < QUIZ.length) {
        const q = QUIZ[step];
        app().innerHTML = `
          ${pageHead({ crumbs: [{ label: 'Style quiz' }], title: 'Find your muse' })}
          <div class="quiz-page"><div class="container"><div class="quiz">
            <div class="quiz__progress">${QUIZ.map((_, i) => `<span class="${i <= step ? 'is-active' : ''}"></span>`).join('')}</div>
            <div class="quiz__step">
              <span class="eyebrow" style="justify-content:center">Question ${step + 1} of ${QUIZ.length}</span>
              <h1>${escapeHtml(q.question)}</h1>
              <p>${escapeHtml(q.hint)}</p>
              <div class="quiz__options">
                ${q.options
                  .map(
                    (o, i) => `
                  <button class="quiz__option ${answers[step] === o.key ? 'is-selected' : ''}" type="button" data-quiz-option="${o.key}">
                    <span class="quiz__option__mark">${String(i + 1).padStart(2, '0')}</span>
                    <span><strong>${escapeHtml(o.label)}</strong><span>${escapeHtml(o.text)}</span></span>
                  </button>`
                  )
                  .join('')}
              </div>
              <div class="quiz__nav">
                <button class="btn btn--ghost btn--sm" type="button" data-quiz-back ${step === 0 ? 'disabled' : ''}>${icon('arrowLeft')} Back</button>
                <button class="btn btn--sm" type="button" data-quiz-next ${answers[step] ? '' : 'disabled'}>${step === QUIZ.length - 1 ? 'See my edit' : 'Next'} ${icon('arrowRight')}</button>
              </div>
            </div>
          </div></div></div>`;

        app().querySelectorAll('[data-quiz-option]').forEach((btn) =>
          btn.addEventListener('click', () => {
            answers[step] = btn.dataset.quizOption;
            app().querySelectorAll('[data-quiz-option]').forEach((b) => b.classList.toggle('is-selected', b === btn));
            const next = app().querySelector('[data-quiz-next]');
            if (next) next.disabled = false;
            step += 1;
            setTimeout(paint, step < QUIZ.length ? 160 : 240);
          })
        );
        app().querySelector('[data-quiz-back]')?.addEventListener('click', () => {
          if (step > 0) {
            step -= 1;
            paint();
          }
        });
        app().querySelector('[data-quiz-next]')?.addEventListener('click', () => {
          if (!answers[step]) return;
          step += 1;
          paint();
        });
      } else {
        const scores = { bridal: 0, formals: 0, pret: 0, lawn: 0, unstitched: 0 };
        QUIZ.forEach((q, i) => {
          const option = q.options.find((o) => o.key === answers[i]);
          if (option) Object.entries(option.marks).forEach(([k, v]) => (scores[k] = (scores[k] || 0) + v));
        });
        const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
        const result = QUIZ_RESULTS[winner];
        const picks = state.products.filter((p) => p.category === winner).slice(0, 4);
        app().innerHTML = `
          ${pageHead({ crumbs: [{ label: 'Style quiz' }], title: 'Your edit' })}
          <div class="quiz-page"><div class="container">
            <div class="quiz__result">
              <span class="eyebrow" style="justify-content:center">Your muse</span>
              <h1>${escapeHtml(result.title)}</h1>
              <p class="section-desc" style="margin:14px auto 0">${escapeHtml(result.text)}</p>
              <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:24px">
                <a class="btn" href="/shop?category=${winner}">${escapeHtml(result.cta)}</a>
                <button class="btn btn--ghost" type="button" data-quiz-restart>Start again</button>
              </div>
              <div class="product-grid">${picks.map((p) => productCard(p)).join('')}</div>
            </div>
          </div></div>`;
        refreshCounts();
        app().querySelector('[data-quiz-restart]')?.addEventListener('click', () => {
          step = 0;
          Object.keys(answers).forEach((k) => delete answers[k]);
          paint();
        });
      }
    };
    paint();
}

/* ------------------------------------------------------------------- 404 */

export function notFoundPage() {
  app().innerHTML = `
    <div class="container" style="padding-block:80px">
      ${emptyState({
        title: 'This page has wandered off',
        text: 'The page you are looking for does not exist — but the collection does.',
        action: 'Return home',
        href: '/'
      })}
    </div>`;
}
