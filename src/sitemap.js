'use strict';

const { read } = require('./db');
const { isPublishedProduct } = require('./catalog');

// Public pages of the single-page storefront. Private or per-user pages
// (/admin, /api, /order/:number, /cart, /checkout, /account, /wishlist)
// are deliberately left out of the sitemap and disallowed in robots.txt.
const STATIC_URLS = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/shop', changefreq: 'daily', priority: '0.9' },
  { path: '/new-arrivals', changefreq: 'daily', priority: '0.8' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.6' },
  { path: '/quiz', changefreq: 'monthly', priority: '0.5' },
  { path: '/track', changefreq: 'monthly', priority: '0.4' }
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Absolute site origin used in the sitemap and robots.txt. SITE_URL wins
 * (set it on Vercel so the URLs do not depend on the deployment alias);
 * otherwise the origin is derived from the incoming request.
 */
function baseUrlFrom(req) {
  const configured = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

function lastmodOf(dateValue) {
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Builds a sitemap.xml document covering the storefront pages, one URL per
 * category (/shop?category=…) and one per product (/product/:slug).
 */
function buildSitemap(baseUrl) {
  const db = read();
  const entries = [];

  for (const entry of STATIC_URLS) {
    entries.push({ loc: baseUrl + entry.path, changefreq: entry.changefreq, priority: entry.priority });
  }

  const categories = [...(db.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const category of categories) {
    if (!category.slug) continue;
    entries.push({
      loc: `${baseUrl}/shop?category=${encodeURIComponent(category.slug)}`,
      changefreq: 'weekly',
      priority: '0.8'
    });
  }

  for (const product of (db.products || []).filter(isPublishedProduct)) {
    if (!product.slug) continue;
    entries.push({
      loc: `${baseUrl}/product/${encodeURIComponent(product.slug)}`,
      lastmod: lastmodOf(product.updatedAt || product.createdAt),
      changefreq: 'weekly',
      priority: '0.7'
    });
  }

  const urls = entries
    .map((entry) => {
      const lines = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) lines.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority) lines.push(`    <priority>${entry.priority}</priority>`);
      return `  <url>\n${lines.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function buildRobotsTxt(baseUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /order/',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /account',
    'Disallow: /wishlist',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    ''
  ].join('\n');
}

module.exports = { buildSitemap, buildRobotsTxt, baseUrlFrom };
