/** Storefront category helpers. The two definitions mirror src/catalog.js. */
export const SUIT_CATEGORIES = Object.freeze([
  Object.freeze({ slug: '2-piece-suits', name: '2 Piece Suits', blurb: 'Shirt + trouser · the everyday edit', image: '/images/products/pret-elan.jpg', order: 0 }),
  Object.freeze({ slug: '3-piece-suits', name: '3 Piece Suits', blurb: 'Shirt + trouser + dupatta · the complete look', image: '/images/products/lawn-rania.jpg', order: 1 })
]);

const LEGACY = { lawn: '3-piece-suits', bridal: '3-piece-suits', formals: '3-piece-suits', pret: '2-piece-suits', 'new-drops': '', unstitched: '', accessories: '' };

export function suitCategory(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (SUIT_CATEGORIES.some((category) => category.slug === slug)) return slug;
  if (/^2[\s-]*piece(?:[\s-]*suits?)?$/.test(slug)) return '2-piece-suits';
  if (/^3[\s-]*piece(?:[\s-]*suits?)?$/.test(slug)) return '3-piece-suits';
  return Object.hasOwn(LEGACY, slug) ? LEGACY[slug] : '';
}

export function categoryName(slug) {
  return SUIT_CATEGORIES.find((category) => category.slug === suitCategory(slug))?.name || 'Suit';
}

export function shopCategories(categories = []) {
  return SUIT_CATEGORIES.map((category) => categories.find((item) => item.slug === category.slug) || category);
}

/** A curated edit, not a third category: owner-flagged pieces, newest first. */
export function newArrivals(products = []) {
  return products.filter((product) => product.isNew && SUIT_CATEGORIES.some((category) => category.slug === product.category))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}
