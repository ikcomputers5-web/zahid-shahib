'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const { read } = require('../src/db');
const server = app.listen(0, '127.0.0.1');
after(() => server.close());

async function request(url) {
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  return fetch(`http://127.0.0.1:${server.address().port}${url}`);
}

test('sitemap.xml is served as XML and lists storefront pages', async () => {
  const res = await request('/sitemap.xml');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/xml/);
  const xml = await res.text();
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  for (const path of ['/', '/shop', '/about', '/contact', '/quiz', '/track']) {
    assert.match(xml, new RegExp(`<loc>[^<]+${path === '/' ? '\\/' : path}</loc>`), path);
  }
});

test('sitemap.xml includes a URL for every category and product in the database', async () => {
  const res = await request('/sitemap.xml');
  const xml = await res.text();
  const db = read();
  for (const category of db.categories) {
    assert.ok(xml.includes(`/shop?category=${encodeURIComponent(category.slug)}`), category.slug);
  }
  for (const product of db.products) {
    assert.ok(xml.includes(`/product/${encodeURIComponent(product.slug)}`), product.slug);
  }
  // Private pages must not be listed.
  assert.ok(!xml.includes('/admin'));
  assert.ok(!xml.includes('/order/'));
  assert.ok(!xml.includes('/api/'));
});

test('sitemap URLs use SITE_URL when configured', async () => {
  process.env.SITE_URL = 'https://ismailelegance.pk/';
  try {
    const res = await request('/sitemap.xml');
    const xml = await res.text();
    assert.ok(xml.includes('<loc>https://ismailelegance.pk/shop</loc>'));
    assert.ok(!xml.includes('127.0.0.1'));
  } finally {
    delete process.env.SITE_URL;
  }
});

test('robots.txt points to the sitemap and keeps private areas out', async () => {
  const res = await request('/robots.txt');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const body = await res.text();
  assert.match(body, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
  assert.match(body, /Disallow: \/admin/);
  assert.match(body, /Disallow: \/api\//);
});

test('SPA routes still render the storefront shell', async () => {
  const res = await request('/shop');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<main id="app"/);
});
