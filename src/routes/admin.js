'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { read, save, uid } = require('../db');
const { hashPassword, adminPasswordEnvTag } = require('../seed');
const auth = require('../auth');
const storage = require('../storage');
const firebase = require('../firebase');
const { toNumber } = require('../numbers');
const { suitCategory } = require('../catalog');

const router = express.Router();

// Forward async handler rejections to the error middleware (Express 4).
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

const SETTINGS_KEYS = [
  'storeName', 'tagline', 'announcement', 'announcementActive', 'phone', 'whatsapp', 'email',
  'address', 'hours', 'instagram', 'facebook', 'tiktok', 'youtube', 'pinterest', 'currency',
  'freeShippingThreshold', 'shippingFee', 'returnWindow', 'dropTitle', 'dropSubtitle', 'dropEndsAt',
  'dropNote', 'heroSlides', 'instagramPosts', 'aboutHeading', 'aboutText', 'aboutImage', 'values',
  'adminEmail'
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ORDER_STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];


function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

function uniqueSlug(base, products, ignoreId) {
  let slug = base || 'piece';
  let i = 2;
  while (products.some((p) => p.slug === slug && p.id !== ignoreId)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

function normalizeProduct(input, products, existing) {
  const name = String(input.name || existing?.name || '').trim();
  if (name.length < 2) throw new Error('Product name is required.');
  const price = Math.round(toNumber(input.price));
  if (!Number.isFinite(price) || price <= 0) throw new Error('A valid price is required.');
  const compareAtNumber = toNumber(input.compareAt, NaN);
  const compareAtRaw = Number.isFinite(compareAtNumber) && compareAtNumber > 0 ? Math.round(compareAtNumber) : null;
  const sizes = (Array.isArray(input.sizes) ? input.sizes : String(input.sizes || '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
  const images = (Array.isArray(input.images) ? input.images : String(input.images || '').split(/\n|,/))
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (!images.length) throw new Error('Add at least one image URL.');

  const colors = (Array.isArray(input.colors) ? input.colors : [])
    .map((c) => ({ name: String(c.name || '').trim(), hex: String(c.hex || '#c9b79c').trim() }))
    .filter((c) => c.name);

  const details = (Array.isArray(input.details) ? input.details : String(input.details || '').split('\n'))
    .map((s) => String(s).trim())
    .filter(Boolean);
  const care = (Array.isArray(input.care) ? input.care : String(input.care || '').split('\n'))
    .map((s) => String(s).trim())
    .filter(Boolean);

  const category = suitCategory(input.category ?? existing?.category);
  if (!category) throw new Error('Choose either 2 Piece Suits or 3 Piece Suits.');
  const requestedPieces = String(input.pieces ?? existing?.pieces ?? '');
  const pieces = `${category.charAt(0)} Piece${/unstitched/i.test(requestedPieces) ? ' Unstitched' : ''}`;

  const base = {
    name,
    subtitle: String(input.subtitle || existing?.subtitle || '').trim(),
    category,
    collection: String(input.collection || existing?.collection || 'Ismail Elegance').trim(),
    price,
    compareAt: compareAtRaw && compareAtRaw > price ? compareAtRaw : null,
    images,
    sizes: sizes.length ? sizes : ['S', 'M', 'L'],
    colors,
    fabric: String(input.fabric || existing?.fabric || '').trim(),
    pieces,
    description: String(input.description || existing?.description || '').trim(),
    details,
    care,
    stock: Math.max(0, Math.round(toNumber(input.stock, 0))),
    isNew: Boolean(input.isNew),
    isDrop: Boolean(input.isDrop),
    featured: Boolean(input.featured),
    tags: (Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(','))
      .map((s) => String(s).trim())
      .filter(Boolean),
    reviews: existing?.reviews || [],
    rating: existing?.rating || 5,
    reviewCount: existing?.reviewCount || 0,
    sold: existing?.sold || 0,
    needsCategory: false
  };

  return {
    ...(existing || {}),
    ...base,
    id: existing?.id || uid('p_'),
    slug: uniqueSlug(slugify(input.slug || name), products, existing?.id),
    createdAt: existing?.createdAt || new Date().toISOString()
  };
}

/* ------------------------------------------------------------------ auth */

router.get('/diagnostics', (req, res) => {
  const dbState = require('../db').status();
  res.json({
    ok: true,
    environment: process.env.VERCEL ? 'vercel' : 'node',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    database: dbState,
    firebase: firebase.diagnostics(),
    adminEmails: firebase.getAdminEmails().length
  });
});

router.get('/firebase-config', (req, res) => {
  const cfg = firebase.getClientConfig();
  res.json({ enabled: firebase.isFirebaseEnabled(), config: cfg });
});

router.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (auth.tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
  }
  const email = auth.normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || !password) {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }
  const ok = auth.verifyCredentials(email, password);
  auth.noteAttempt(ip, ok);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });
  const token = auth.issueSession();
  res.setHeader('Set-Cookie', `ie_admin=${token}; HttpOnly; Path=/; Max-Age=${auth.SESSION_TTL / 1000}; SameSite=Lax`);
  res.json({ ok: true, token, email });
});

// Firebase Google login for admin
router.post('/firebase-login', ah(async (req, res) => {
  const ip = req.ip || 'unknown';
  if (auth.tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
  }
  const idToken = String(req.body?.idToken || req.body?.token || '').trim();
  if (!idToken) return res.status(400).json({ error: 'Missing Google token. Please try again.' });

  let decoded;
  try {
    decoded = await auth.verifyFirebaseAdmin(idToken);
  } catch (err) {
    auth.noteAttempt(ip, false);
    return res.status(401).json({ error: err.message || 'Google sign-in failed.' });
  }

  auth.noteAttempt(ip, true);

  // Optionally persist admin user
  const db = read();
  if (!Array.isArray(db.adminUsers)) db.adminUsers = [];
  let adminUser = db.adminUsers.find((u) => u.uid === decoded.uid || (decoded.email && u.email === decoded.email));
  if (!adminUser) {
    adminUser = {
      id: uid('adm_'),
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture || null,
      provider: 'google',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    db.adminUsers.unshift(adminUser);
    await save();
  } else {
    adminUser.lastLoginAt = new Date().toISOString();
    adminUser.picture = decoded.picture || adminUser.picture;
    adminUser.name = decoded.name || adminUser.name;
    await save();
  }

  const token = auth.issueSession();
  res.setHeader('Set-Cookie', `ie_admin=${token}; HttpOnly; Path=/; Max-Age=${auth.SESSION_TTL / 1000}; SameSite=Lax`);
  res.json({ ok: true, token, user: { email: decoded.email, name: decoded.name, picture: decoded.picture } });
}));

router.post('/logout', (req, res) => {
  auth.destroySession(auth.readToken(req));
  res.setHeader('Set-Cookie', 'ie_admin=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  res.json({ authenticated: auth.sessionValid(auth.readToken(req)) });
});

router.use(auth.requireAdmin);

/* --------------------------------------------------------------- dashboard */

router.get('/stats', (req, res) => {
  const db = read();
  const active = db.orders.filter((o) => o.status !== 'cancelled');
  const revenue = active.reduce((sum, o) => sum + o.total, 0);
  const units = active.reduce((sum, o) => sum + o.items.reduce((n, i) => n + i.qty, 0), 0);

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d.getTime() + 86400000);
    const dayOrders = active.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= d.getTime() && t < next.getTime();
    });
    days.push({
      label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      revenue: dayOrders.reduce((s, o) => s + o.total, 0),
      orders: dayOrders.length
    });
  }

  const soldMap = new Map();
  for (const order of active) {
    for (const item of order.items) {
      const row = soldMap.get(item.slug) || { slug: item.slug, name: item.name, image: item.image, qty: 0, revenue: 0 };
      row.qty += item.qty;
      row.revenue += item.lineTotal;
      soldMap.set(item.slug, row);
    }
  }
  const topProducts = [...soldMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  res.json({
    revenue,
    orders: active.length,
    pending: db.orders.filter((o) => o.status === 'pending').length,
    units,
    avgOrder: active.length ? Math.round(revenue / active.length) : 0,
    products: db.products.length,
    lowStock: db.products.filter((p) => p.stock <= 5).length,
    subscribers: db.subscribers.length,
    unreadMessages: db.messages.filter((m) => !m.read).length,
    dropProducts: db.products.filter((p) => p.isDrop).length,
    days,
    topProducts,
    recentOrders: db.orders.slice(0, 6),
    promos: db.promoCodes.map((p) => ({ code: p.code, used: p.used, maxUses: p.maxUses, active: p.active })),
    lowStockList: db.products.filter((p) => p.stock <= 5).map((p) => ({ id: p.id, name: p.name, stock: p.stock }))
  });
});

/* ---------------------------------------------------------------- products */

router.get('/products', (req, res) => {
  const db = read();
  res.json({ products: db.products });
});

router.post('/products', ah(async (req, res) => {
  const db = read();
  try {
    const product = normalizeProduct(req.body || {}, db.products, null);
    db.products.unshift(product);
    await save();
    res.status(201).json({ product });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.put('/products/:id', ah(async (req, res) => {
  const db = read();
  const existing = db.products.find((p) => p.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });
  try {
    const product = normalizeProduct(req.body || {}, db.products, existing);
    Object.assign(existing, product);
    await save();
    res.json({ product: existing });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.patch('/products/:id', ah(async (req, res) => {
  const db = read();
  const product = db.products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  for (const key of ['isNew', 'isDrop', 'featured', 'stock']) {
    if (key in req.body) {
      product[key] = key === 'stock' ? Math.max(0, parseInt(req.body[key], 10) || 0) : Boolean(req.body[key]);
    }
  }
  await save();
  res.json({ product });
}));

router.delete('/products/:id', ah(async (req, res) => {
  const db = read();
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== req.params.id);
  if (db.products.length === before) return res.status(404).json({ error: 'Product not found.' });
  await save();
  res.json({ ok: true });
}));

/* ------------------------------------------------------------ promo codes */

function normalizePromo(input, existing) {
  const code = String(input.code || existing?.code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (code.length < 3) throw new Error('Promo code needs at least 3 characters.');
  const type = ['percent', 'fixed', 'shipping'].includes(input.type) ? input.type : 'percent';
  const value = type === 'shipping' ? 0 : toNumber(input.value, 0);
  if (type === 'percent' && (!value || value <= 0 || value > 90)) throw new Error('Percentage must be between 1 and 90.');
  if (type === 'fixed' && (!value || value <= 0)) throw new Error('Enter a discount amount.');
  return {
    ...(existing || {}),
    id: existing?.id || uid('promo_'),
    code,
    type,
    value: Math.round(value || 0),
    minOrder: Math.max(0, Math.round(toNumber(input.minOrder, 0))),
    maxUses: Math.max(0, parseInt(input.maxUses, 10) || 0),
    used: existing?.used || 0,
    active: input.active !== false,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    description: String(input.description || '').trim() || `${type === 'percent' ? value + '% off' : 'Discount'}`
  };
}

router.get('/promos', (req, res) => {
  res.json({ promos: read().promoCodes });
});

router.post('/promos', ah(async (req, res) => {
  const db = read();
  try {
    const promo = normalizePromo(req.body || {});
    if (db.promoCodes.some((p) => p.code === promo.code)) throw new Error('That code already exists.');
    db.promoCodes.unshift(promo);
    await save();
    res.status(201).json({ promo });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.put('/promos/:id', ah(async (req, res) => {
  const db = read();
  const existing = db.promoCodes.find((p) => p.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Promo code not found.' });
  try {
    const promo = normalizePromo(req.body || {}, existing);
    if (db.promoCodes.some((p) => p.code === promo.code && p.id !== existing.id)) {
      throw new Error('That code already exists.');
    }
    Object.assign(existing, promo);
    await save();
    res.json({ promo: existing });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

router.delete('/promos/:id', ah(async (req, res) => {
  const db = read();
  const before = db.promoCodes.length;
  db.promoCodes = db.promoCodes.filter((p) => p.id !== req.params.id);
  if (db.promoCodes.length === before) return res.status(404).json({ error: 'Promo code not found.' });
  await save();
  res.json({ ok: true });
}));

/* ----------------------------------------------------------------- orders */

router.get('/orders', (req, res) => {
  const db = read();
  const status = req.query.status;
  const orders = status && status !== 'all' ? db.orders.filter((o) => o.status === status) : db.orders;
  res.json({ orders });
});

router.patch('/orders/:id', ah(async (req, res) => {
  const db = read();
  const order = db.orders.find((o) => o.id === req.params.id || o.number === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const { status, note } = req.body || {};
  if (status) {
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status.' });
    order.status = status;
    order.timeline = order.timeline || [];
    order.timeline.push({ status, at: new Date().toISOString(), note: String(note || '').slice(0, 200) });
  }
  await save();
  res.json({ order });
}));

router.delete('/orders/:id', ah(async (req, res) => {
  const db = read();
  const before = db.orders.length;
  db.orders = db.orders.filter((o) => o.id !== req.params.id);
  if (db.orders.length === before) return res.status(404).json({ error: 'Order not found.' });
  await save();
  res.json({ ok: true });
}));

/* --------------------------------------------------------------- settings */

router.get('/settings', (req, res) => {
  const db = read();
  const { adminPasswordHash, adminPasswordSalt, adminPasswordEnvTag, ...settings } = db.settings;
  res.json({ settings });
});

router.put('/settings', ah(async (req, res) => {
  const db = read();
  const input = req.body || {};
  if ('adminEmail' in input) {
    const email = auth.normalizeEmail(input.adminEmail);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid admin email address.' });
    input.adminEmail = email;
  }
  for (const key of SETTINGS_KEYS) {
    if (!(key in input)) continue;
    let value = input[key];
    if (['freeShippingThreshold', 'shippingFee', 'returnWindow'].includes(key)) {
      value = Math.max(0, toNumber(value, 0));
    }
    if (key === 'announcementActive') value = Boolean(value);
    if (key === 'instagramPosts' && Array.isArray(value)) {
      value = value.map((v) => String(v).trim()).filter(Boolean);
    }
    if (key === 'heroSlides' && Array.isArray(value)) {
      value = value.slice(0, 8).map((slide) => ({
        image: String(slide.image || '').trim(),
        kicker: String(slide.kicker || '').trim(),
        title: String(slide.title || '').trim(),
        subtitle: String(slide.subtitle || '').trim(),
        ctaLabel: String(slide.ctaLabel || '').trim(),
        ctaHref: String(slide.ctaHref || '/shop').trim(),
        tone: slide.tone === 'light' ? 'light' : 'dark'
      })).filter((s) => s.image);
    }
    if (key === 'values' && Array.isArray(value)) {
      value = value.slice(0, 6).map((v) => ({ title: String(v.title || '').trim(), text: String(v.text || '').trim() }));
    }
    db.settings[key] = value;
  }
  await save();
  const { adminPasswordHash, adminPasswordSalt, adminPasswordEnvTag, ...safe } = db.settings;
  res.json({ settings: safe, message: 'Settings saved.' });
}));

router.post('/password', ah(async (req, res) => {
  const db = read();
  const { current, next } = req.body || {};
  if (!auth.verifyPassword(current)) return res.status(401).json({ error: 'Current password is incorrect.' });
  if (!next || String(next).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const { salt, hash } = hashPassword(next);
  db.settings.adminPasswordSalt = salt;
  db.settings.adminPasswordHash = hash;
  // Record which ADMIN_PASSWORD value this hash came from. If the deployment
  // still sets ADMIN_PASSWORD to some other value, that env password is
  // authoritative and would replace this one on the next boot — warn instead
  // of letting the change silently disappear.
  if (process.env.ADMIN_PASSWORD) {
    db.settings.adminPasswordEnvTag = adminPasswordEnvTag(process.env.ADMIN_PASSWORD, db.settings);
    if (process.env.ADMIN_PASSWORD !== String(next) && !process.env.SESSION_SECRET) {
      await save();
      return res.json({
        message: 'Password updated.',
        warning:
          'ADMIN_PASSWORD is still set on this deployment and takes priority, so this change may be reverted on the next restart. Remove or update that variable to keep the new password.'
      });
    }
  }
  await save();
  res.json({ message: 'Password updated.' });
}));

/* ----------------------------------------------------- messages & audience */

router.get('/messages', (req, res) => {
  res.json({ messages: read().messages });
});

router.patch('/messages/:id', ah(async (req, res) => {
  const db = read();
  const msg = db.messages.find((m) => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });
  if ('read' in (req.body || {})) msg.read = Boolean(req.body.read);
  await save();
  res.json({ message: msg });
}));

router.delete('/messages/:id', ah(async (req, res) => {
  const db = read();
  const before = db.messages.length;
  db.messages = db.messages.filter((m) => m.id !== req.params.id);
  if (db.messages.length === before) return res.status(404).json({ error: 'Message not found.' });
  await save();
  res.json({ ok: true });
}));

router.get('/subscribers', (req, res) => {
  res.json({ subscribers: read().subscribers });
});

router.delete('/subscribers/:id', ah(async (req, res) => {
  const db = read();
  db.subscribers = db.subscribers.filter((s) => s.id !== req.params.id);
  await save();
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ users */

router.get('/users', (req, res) => {
  const db = read();
  const users = (db.users || []).map((u) => ({
    id: u.id,
    uid: u.uid,
    email: u.email,
    name: u.name,
    picture: u.picture,
    provider: u.provider,
    orders: u.orders || 0,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt
  }));
  res.json({ users });
});

router.get('/admin-users', (req, res) => {
  const db = read();
  res.json({ adminUsers: db.adminUsers || [] });
});

/* ----------------------------------------------------------------- upload */

router.post('/upload', async (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  const match = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: 'Upload a PNG, JPG or WEBP image.' });
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > 6 * 1024 * 1024) return res.status(413).json({ error: 'Image must be smaller than 6 MB.' });
  const mime = `image/${match[2] === 'jpg' ? 'jpeg' : match[2]}`;
  const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
  const filename = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

  // Vercel's filesystem is read-only, so when Supabase is configured we store
  // the image in a Storage bucket and hand back its permanent public URL.
  if (storage.isSupabaseEnabled()) {
    try {
      const url = await storage.uploadToSupabase(buffer, filename, mime);
      return res.status(201).json({ url });
    } catch (err) {
      console.error('[upload]', err);
      return res.status(502).json({ error: err.message });
    }
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  res.status(201).json({ url: `/uploads/${filename}` });
});

module.exports = router;
