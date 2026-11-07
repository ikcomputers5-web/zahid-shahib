'use strict';

/** The only two storefront categories. Keep in sync with public/js/catalog.js. */
const SUIT_CATEGORIES = Object.freeze([
  Object.freeze({
    slug: '2-piece-suits',
    name: '2 Piece Suits',
    blurb: 'Shirt + trouser · the everyday edit',
    image: '/images/products/pret-elan.jpg',
    order: 0
  }),
  Object.freeze({
    slug: '3-piece-suits',
    name: '3 Piece Suits',
    blurb: 'Shirt + trouser + dupatta · the complete look',
    image: '/images/products/lawn-rania.jpg',
    order: 1
  })
]);

const SUIT_SLUGS = new Set(SUIT_CATEGORIES.map((category) => category.slug));
const LEGACY_CATEGORIES = Object.freeze({
  lawn: '3-piece-suits',
  bridal: '3-piece-suits',
  formals: '3-piece-suits',
  pret: '2-piece-suits',
  'new-drops': '',
  unstitched: '',
  accessories: ''
});

function suitCategory(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (SUIT_SLUGS.has(slug)) return slug;
  if (/^2[\s-]*piece(?:[\s-]*suits?)?$/.test(slug)) return '2-piece-suits';
  if (/^3[\s-]*piece(?:[\s-]*suits?)?$/.test(slug)) return '3-piece-suits';
  return Object.hasOwn(LEGACY_CATEGORIES, slug) ? LEGACY_CATEGORIES[slug] : '';
}

function pieceCount(value) {
  const match = String(value || '').match(/\b([23])\s*[-]?\s*piece\b/i);
  return match ? Number(match[1]) : null;
}

function categoryForProduct(product) {
  const count = pieceCount(product.pieces);
  if (count) return `${count}-piece-suits`;
  // Older catalogues stored the count only in the category name.
  return suitCategory(product.category);
}

function categoryName(slug) {
  return SUIT_CATEGORIES.find((category) => category.slug === suitCategory(slug))?.name || 'Needs category';
}

function isPublishedProduct(product) {
  return SUIT_SLUGS.has(product.category);
}

/**
 * One-time, non-destructive catalogue migration. Suits are assigned by their
 * recorded piece count. Accessories and other non-suit stock stay in the admin
 * with needsCategory=true, but are not published under an invented suit type.
 * Orders, prices, photos, credentials and owner-edited content are untouched.
 */
function migrateCatalog(db) {
  if (!db || db.catalogVersion >= 2) return false;
  db.categories = SUIT_CATEGORIES.map((category) => ({ ...category }));
  if (!Array.isArray(db.products)) db.products = [];
  for (const product of db.products) {
    const category = categoryForProduct(product);
    if (category) {
      product.category = category;
      product.needsCategory = false;
      const count = category.charAt(0);
      if (!pieceCount(product.pieces)) product.pieces = `${count} Piece`;
    } else {
      product.category = null;
      product.needsCategory = true;
    }
  }
  // Repair retired category links without replacing the owner's slide content.
  for (const slide of db.settings?.heroSlides || []) {
    try {
      const url = new URL(slide.ctaHref || '/shop', 'https://store.local');
      const old = url.searchParams.get('category');
      if (url.pathname === '/shop' && old && !SUIT_SLUGS.has(old)) {
        const replacement = suitCategory(old);
        if (replacement) url.searchParams.set('category', replacement);
        else url.searchParams.delete('category');
        slide.ctaHref = url.pathname + (url.search ? url.searchParams.toString().replace(/^/, '?') : '');
      }
    } catch (_) { /* Leave malformed owner content alone. */ }
  }
  db.catalogVersion = 2;
  return true;
}

module.exports = { SUIT_CATEGORIES, SUIT_SLUGS, suitCategory, pieceCount, categoryForProduct, categoryName, isPublishedProduct, migrateCatalog };
