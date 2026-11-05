'use strict';

try { require('dotenv').config(); } catch {}
const express = require('express');
const path = require('path');
const { read, ensureReady, persistCredentialsIfChanged, READ_ONLY, REMOTE } = require('./src/db');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');
const { buildSitemap, buildRobotsTxt, baseUrlFrom } = require('./src/sitemap');
const { renderIndexHtml } = require('./src/pixel');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  // Never report a successful order or admin change when it cannot be saved.
  // This only triggers in read-only preview mode (serverless host without a
  // durable database). Promo validation is a read-only POST and remains available.
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const promoValidation = req.method === 'POST' && req.path === '/promo/validate';
  const authCheck = req.method === 'POST' && (req.path === '/auth/google' || req.path === '/auth/me');
  if (READ_ONLY && !safeMethod && !promoValidation && !authCheck) {
    return res.status(503).json({ error: 'This store is currently in preview mode. Orders and other submissions are unavailable.' });
  }

  // On a serverless host with Supabase configured, load the shared database
  // before the request touches it. Mutations re-read first so a save starts
  // from the latest data instead of overwriting another instance's changes.
  const mutating = !safeMethod;
  ensureReady({ refresh: mutating, throwOnError: mutating }).then(
    () => next(),
    (err) => {
      console.error('[server] database unavailable:', err.message);
      res.status(503).json({
        error:
          'The shared database could not be reached, so nothing was changed. Please retry in a moment.',
        code: 'DB_UNAVAILABLE'
      });
    }
  );
});
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Search-engine files. Registered before the static middleware and the SPA
// catch-all so they are never swallowed by index.html. The sitemap is built
// from the live catalogue, so product URLs stay current; SITE_URL (or the
// request origin) provides the absolute base.
app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buildSitemap(baseUrlFrom(req)));
});

app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buildRobotsTxt(baseUrlFrom(req)));
});

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// Single page storefront — every other GET renders the app shell, with the
// Meta Pixel snippet injected when META_PIXEL_ID is configured.
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderIndexHtml());
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

read(); // ensure the database exists before the first request
// ADMIN_PASSWORD / ADMIN_EMAIL (or a generated first-boot password) own the
// admin credentials; make them durable before serving traffic. In remote mode
// the shared database is not loaded yet — ensureReady() persists them instead.
if (!REMOTE) persistCredentialsIfChanged().catch(() => {});

module.exports = app;

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ismail Elegance running on http://0.0.0.0:${PORT}`);
    console.log(`Storefront  →  http://localhost:${PORT}/`);
    console.log(`Admin panel →  http://localhost:${PORT}/admin`);
  });
}
