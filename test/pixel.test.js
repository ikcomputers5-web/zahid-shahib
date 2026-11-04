'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');
const server = app.listen(0, '127.0.0.1');
after(() => server.close());

// The repo-root "pixel" file (added on GitHub) holds the store's real snippet.
const FILE_PIXEL_ID = '1161597902969594';

async function request(url) {
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  return fetch(`http://127.0.0.1:${server.address().port}${url}`);
}

test('with META_PIXEL_ID unset, the repo-root "pixel" file is injected into every storefront route', async () => {
  delete process.env.META_PIXEL_ID;
  for (const url of ['/', '/shop', '/product/noor-jahan-ivory-bridal']) {
    const res = await request(url);
    assert.equal(res.status, 200, url);
    const html = await res.text();
    assert.ok(html.includes(`fbq('init', '${FILE_PIXEL_ID}')`), url);
    assert.ok(html.includes('https://connect.facebook.net/en_US/fbevents.js'), url);
    assert.ok(html.includes(`https://www.facebook.com/tr?id=${FILE_PIXEL_ID}&ev=PageView&noscript=1`), url);
    assert.ok(!html.includes('META_PIXEL -->'), url);
  }
});

test('META_PIXEL_ID env var takes precedence over the "pixel" file', async () => {
  process.env.META_PIXEL_ID = '123456789012345';
  try {
    const res = await request('/');
    const html = await res.text();
    assert.ok(html.includes("fbq('init', '123456789012345')"));
    assert.ok(!html.includes(FILE_PIXEL_ID));
  } finally {
    delete process.env.META_PIXEL_ID;
  }
});

test('a non-numeric META_PIXEL_ID falls back to the "pixel" file instead of shipping a broken snippet', async () => {
  process.env.META_PIXEL_ID = 'not-a-pixel-id';
  try {
    const res = await request('/');
    const html = await res.text();
    assert.ok(!html.includes('not-a-pixel-id'));
    assert.ok(html.includes(`fbq('init', '${FILE_PIXEL_ID}')`));
  } finally {
    delete process.env.META_PIXEL_ID;
  }
});

test('the admin panel never gets the pixel', async () => {
  process.env.META_PIXEL_ID = '123456789012345';
  try {
    const res = await request('/admin');
    const html = await res.text();
    assert.ok(!html.includes('fbevents.js'));
    assert.ok(!html.includes('123456789012345'));
  } finally {
    delete process.env.META_PIXEL_ID;
  }
});
