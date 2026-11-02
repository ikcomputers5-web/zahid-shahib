'use strict';

try { require('dotenv').config(); } catch {}
const express = require('express');
const path = require('path');
const { read, ensureReady, READ_ONLY } = require('./src/db');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));

app.use('/api', (req, res, next) => {
  // On a serverless host with Supabase configured, load the remote database
  // before the first request touches it.
  ensureReady().then(() => {
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
    next();
  }, next);
});
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

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

// Single page storefront — every other GET renders the app shell.
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

read(); // ensure the database exists before the first request

module.exports = app;

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ismail Elegance running on http://0.0.0.0:${PORT}`);
    console.log(`Storefront  →  http://localhost:${PORT}/`);
    console.log(`Admin panel →  http://localhost:${PORT}/admin`);
  });
}
