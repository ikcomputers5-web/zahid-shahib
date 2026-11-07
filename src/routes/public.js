'use strict';

const express = require('express');
const { read, save, uid, READ_ONLY, REMOTE, status: dbStatus } = require('../db');
const { evaluatePromo, totalsFor, priceItems } = require('../commerce');
const auth = require('../auth');
const firebase = require('../firebase');
const storage = require('../storage');
const { SUIT_CATEGORIES, suitCategory, categoryName, isPublishedProduct } = require('../catalog');

const router = express.Router();

// Forward async handler rejections to the error middleware (Express 4).
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicSettings(settings) {
  // Never expose credentials or the tag that tracks the ADMIN_PASSWORD env var.
  const { adminPasswordHash, adminPasswordSalt, adminPasswordEnvTag, ...safe } = settings;
  return safe;
}

function publicProduct(p) {
  return p;
}

/**
 * Deployment self-check. Reports only whether each integration is wired up —
 * never secret values. Handy on Vercel:
 *   /api/health
 */
router.get('/health', ah(async (req, res) => {
  const status = dbStatus();
  const firebaseReport = firebase.diagnostics();
  const storageReport = {
    supabase: storage.isSupabaseEnabled(),
    imageBucket: storage.BUCKET,
    databaseBucket: storage.DB_BUCKET
  };

  const problems = [...firebaseReport.errors];
  if (status.readOnly) {
    problems.push('No Supabase storage configured — the store is in read-only preview mode.');
  }
  if (status.lastError) problems.push(`Database: ${status.lastError}`);

  res.status(200).json({
    ok: problems.length === 0,
    time: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : 'node',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    database: status,
    storage: storageReport,
    firebase: firebaseReport,
    problems
  });
}));

router.get('/bootstrap', ah(async (req, res) => {
  const db = read();
  // Count visits only on hosts with a local database; in remote (serverless)
  // mode every storefront load would otherwise trigger a storage write.
  if (!READ_ONLY && !REMOTE) {
    db.visits = (db.visits || 0) + 1;
    await save();
  }
  res.json({
    readOnly: READ_ONLY,
    settings: publicSettings(db.settings),
    categories: SUIT_CATEGORIES.map((category) => ({ ...category })),
    products: db.products.filter(isPublishedProduct).map(publicProduct),
    activePromos: db.promoCodes
      .filter((p) => p.active && (!p.expiresAt || new Date(p.expiresAt) > new Date()))
      .map((p) => ({ code: p.code, description: p.description, type: p.type, value: p.value, minOrder: p.minOrder })),
    firebase: {
      enabled: firebase.isFirebaseEnabled(),
      config: firebase.getClientConfig(),
      requireAuthForOrders: firebase.isFirebaseEnabled() // when Firebase is on, orders need Google login
    }
  });
}));

router.get('/auth/config', (req, res) => {
  res.json({
    enabled: firebase.isFirebaseEnabled(),
    config: firebase.getClientConfig(),
    requireAuthForOrders: firebase.isFirebaseEnabled()
  });
});

router.get('/auth/me', ah(async (req, res) => {
  const customer = await auth.verifyCustomer(req);
  if (!customer) return res.status(401).json({ authenticated: false, error: 'Not signed in.' });
  res.json({ authenticated: true, user: { uid: customer.uid, email: customer.email, name: customer.name, picture: customer.picture } });
}));

// Verify Firebase token and upsert user record (idempotent). Used by storefront to ensure user exists.
router.post('/auth/google', ah(async (req, res) => {
  const idToken = String(req.body?.idToken || req.body?.token || '').trim();
  if (!idToken) return res.status(400).json({ error: 'Missing Google ID token.' });

  let decoded;
  try {
    decoded = await firebase.verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Invalid Google token.' });
  }

  const db = read();
  if (!Array.isArray(db.users)) db.users = [];

  let user = db.users.find((u) => u.uid === decoded.uid || (decoded.email && u.email === decoded.email));
  if (!user) {
    user = {
      id: uid('usr_'),
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || decoded.email || 'Customer',
      picture: decoded.picture || null,
      provider: 'google',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      orders: 0
    };
    db.users.unshift(user);
    await save();
  } else {
    user.lastLoginAt = new Date().toISOString();
    if (decoded.picture) user.picture = decoded.picture;
    if (decoded.name) user.name = decoded.name;
    await save();
  }

  res.json({ ok: true, user: { uid: user.uid, email: user.email, name: user.name, picture: user.picture } });
}));

// List orders for the authenticated customer (my orders)
router.get('/my/orders', ah(async (req, res) => {
  const customer = await auth.verifyCustomer(req);
  if (!customer) return res.status(401).json({ error: 'Please sign in with Google to view your orders.', code: 'AUTH_REQUIRED' });
  const db = read();
  const myOrders = db.orders.filter((o) => o.userUid === customer.uid || (customer.email && o.customer?.email?.toLowerCase() === customer.email.toLowerCase()));
  res.json({ orders: myOrders });
}));

router.get('/products', (req, res) => {
  const db = read();
  const { category, collection, q, sort = req.query.new === '1' ? 'newest' : 'featured', drop, new: isNew, max } = req.query;
  let list = db.products.filter(isPublishedProduct);

  if (category && category !== 'all') {
    const slug = suitCategory(category);
    list = slug ? list.filter((p) => p.category === slug) : [];
  }
  if (collection) list = list.filter((p) => p.collection === collection);
  if (drop === '1') list = list.filter((p) => p.isDrop);
  if (isNew === '1') list = list.filter((p) => p.isNew);
  if (q) {
    const needle = String(q).toLowerCase().trim();
    list = list.filter((p) =>
      [p.name, p.subtitle, p.collection, categoryName(p.category), p.pieces, p.fabric, (p.tags || []).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }

  const sorters = {
    featured: (a, b) => Number(b.featured) - Number(a.featured) || new Date(b.createdAt) - new Date(a.createdAt),
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating
  };
  list.sort(sorters[sort] || sorters.featured);

  if (max) list = list.slice(0, parseInt(max, 10) || list.length);
  res.json({ products: list, total: list.length });
});

router.get('/products/:slug', (req, res) => {
  const db = read();
  const product = db.products.find((p) => p.slug === req.params.slug && isPublishedProduct(p));
  if (!product) return res.status(404).json({ error: 'We could not find that piece.' });
  const related = db.products
    .filter((p) => isPublishedProduct(p) && p.id !== product.id && (p.category === product.category || p.collection === product.collection))
    .slice(0, 4);
  res.json({ product, related });
});

router.post('/promo/validate', (req, res) => {
  const db = read();
  const subtotal = Number(req.body.subtotal) || 0;
  const result = evaluatePromo(req.body.code, subtotal);
  res.status(result.valid ? 200 : 400).json({
    ...result,
    totals: totalsFor(subtotal, result, db.settings)
  });
});

router.post('/orders', auth.optionalCustomer, ah(async (req, res) => {
  const db = read();
  const { items, customer, paymentMethod, promoCode, notes } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your bag is empty.' });
  }

  // Enforce Google login when Firebase is enabled
  let firebaseUser = req.customer || null;
  if (!firebaseUser && firebase.isFirebaseEnabled()) {
    // Also try token in body as fallback (some clients send idToken separately)
    const bodyToken = req.body?.idToken || req.headers['x-firebase-token'];
    if (bodyToken) {
      try { firebaseUser = await firebase.verifyIdToken(String(bodyToken)); } catch (_) {}
    }
    if (!firebaseUser) {
      return res.status(401).json({ error: 'Please sign in with Google to place an order.', code: 'AUTH_REQUIRED', requireAuth: true });
    }
  }

  const name = String(customer?.name || '').trim();
  const phone = String(customer?.phone || '').trim();
  const email = String(customer?.email || firebaseUser?.email || '').trim();
  const address = String(customer?.address || '').trim();
  const city = String(customer?.city || '').trim();

  if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!/^[0-9+\-\s()]{9,20}$/.test(phone)) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (address.length < 8) return res.status(400).json({ error: 'Please enter a complete delivery address.' });
  if (city.length < 2) return res.status(400).json({ error: 'Please enter your city.' });

  const { items: priced, subtotal, issues } = priceItems(items);
  if (issues.length) return res.status(409).json({ error: issues[0], issues });
  if (!priced.length) return res.status(400).json({ error: 'Your bag is empty.' });

  let promoResult = null;
  if (promoCode) {
    promoResult = evaluatePromo(promoCode, subtotal);
    if (!promoResult.valid) return res.status(400).json({ error: promoResult.message });
  }
  const totals = totalsFor(subtotal, promoResult, db.settings);

  const number = 'IE-' + Math.floor(100000 + Math.random() * 899999);
  const order = {
    id: uid('ord_'),
    number,
    items: priced,
    subtotal: totals.subtotal,
    discount: totals.discount,
    shipping: totals.shipping,
    total: totals.total,
    promoCode: promoResult?.valid ? promoResult.code : null,
    customer: { name, phone, email, address, city, notes: String(notes || '').slice(0, 500) },
    payment: ['cod', 'bank', 'card'].includes(paymentMethod) ? paymentMethod : 'cod',
    status: 'pending',
    createdAt: new Date().toISOString(),
    timeline: [{ status: 'pending', at: new Date().toISOString(), note: 'Order placed' + (firebaseUser ? ` · ${firebaseUser.email}` : '') }],
    userUid: firebaseUser?.uid || null,
    userEmail: firebaseUser?.email || email || null,
    userName: firebaseUser?.name || name,
    userPicture: firebaseUser?.picture || null
  };

  // Update user stats if present
  if (firebaseUser) {
    if (!Array.isArray(db.users)) db.users = [];
    let u = db.users.find((x) => x.uid === firebaseUser.uid);
    if (!u && firebaseUser.email) u = db.users.find((x) => x.email === firebaseUser.email);
    if (!u) {
      u = {
        id: uid('usr_'),
        uid: firebaseUser.uid,
        email: firebaseUser.email || email,
        name: firebaseUser.name || name,
        picture: firebaseUser.picture || null,
        provider: 'google',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        orders: 0
      };
      db.users.unshift(u);
    }
    u.orders = (u.orders || 0) + 1;
    u.lastLoginAt = new Date().toISOString();
  }

  // Decrement stock, count promo usage, keep product "recently ordered" stats.
  for (const line of order.items) {
    const product = db.products.find((p) => p.id === line.id);
    if (product) {
      product.stock = Math.max(0, (product.stock || 0) - line.qty);
      product.sold = (product.sold || 0) + line.qty;
    }
  }
  if (order.promoCode) {
    const promo = db.promoCodes.find((p) => p.code === order.promoCode);
    if (promo) promo.used = (promo.used || 0) + 1;
  }

  db.orders.unshift(order);
  await save();
  res.status(201).json({ order });
}));

router.get('/orders/:number', ah(async (req, res) => {
  const db = read();
  const number = String(req.params.number || '').trim().toUpperCase();
  const phone = String(req.query.phone || '').replace(/\D/g, '');
  const order = db.orders.find((o) => o.number.toUpperCase() === number);
  if (!order) return res.status(404).json({ error: 'No order found with that number.' });

  // If request is authenticated as the order owner, allow without phone check
  const customer = await auth.verifyCustomer(req);
  if (customer && (order.userUid === customer.uid || (customer.email && order.customer?.email?.toLowerCase() === customer.email.toLowerCase()))) {
    return res.json({ order });
  }

  const orderPhone = String(order.customer.phone || '').replace(/\D/g, '');
  if (!phone || (orderPhone !== phone && !orderPhone.endsWith(phone) && !phone.endsWith(orderPhone))) {
    return res.status(401).json({ error: 'The phone number does not match this order.' });
  }
  res.json({ order });
}));

router.post('/contact', ah(async (req, res) => {
  const db = read();
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const message = String(req.body?.message || '').trim();
  if (name.length < 2 || message.length < 5) {
    return res.status(400).json({ error: 'Please add your name and a short message.' });
  }
  const entry = {
    id: uid('msg_'),
    name,
    email,
    phone,
    message: message.slice(0, 2000),
    read: false,
    createdAt: new Date().toISOString()
  };
  db.messages.unshift(entry);
  await save();
  res.status(201).json({ message: 'Thank you — our team will reply within one working day.', entry });
}));

router.post('/subscribe', ah(async (req, res) => {
  const db = read();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const source = String(req.body?.source || 'newsletter').slice(0, 40);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (db.subscribers.some((s) => s.email === email)) {
    return res.json({ message: 'You are already on the list — see you at the next drop.' });
  }
  db.subscribers.unshift({ id: uid('sub_'), email, source, createdAt: new Date().toISOString() });
  await save();
  res.status(201).json({ message: 'You are on the list. First access to every drop.' });
}));

router.get('/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

module.exports = router;
