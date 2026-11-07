'use strict';

const { read } = require('./db');
const { isPublishedProduct } = require('./catalog');

const round = (n) => Math.round(Number(n) || 0);

function evaluatePromo(code, subtotal) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return { valid: false, message: 'Enter a promo code.' };
  const db = read();
  const promo = db.promoCodes.find((p) => String(p.code).toUpperCase() === clean);
  if (!promo) return { valid: false, message: 'That code is not recognised.' };
  if (!promo.active) return { valid: false, message: 'This code is no longer active.' };
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return { valid: false, message: 'This code has expired.' };
  }
  if (promo.maxUses > 0 && promo.used >= promo.maxUses) {
    return { valid: false, message: 'This code has reached its usage limit.' };
  }
  if (subtotal < (promo.minOrder || 0)) {
    return {
      valid: false,
      message: `Add PKR ${(promo.minOrder - subtotal).toLocaleString('en-PK')} more to use this code.`
    };
  }
  let discount = 0;
  if (promo.type === 'percent') discount = round((subtotal * promo.value) / 100);
  if (promo.type === 'fixed') discount = Math.min(round(promo.value), subtotal);
  return {
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    description: promo.description,
    discount,
    freeShipping: promo.type === 'shipping',
    message: promo.type === 'shipping' ? 'Free delivery applied.' : `${promo.code} applied.`
  };
}

function totalsFor(subtotal, promoResult, settings) {
  const s = settings || read().settings;
  const shippingFree =
    (promoResult && promoResult.valid && promoResult.freeShipping) ||
    subtotal >= (s.freeShippingThreshold || 0) ||
    subtotal === 0;
  const shipping = shippingFree ? 0 : round(s.shippingFee);
  const discount = promoResult && promoResult.valid ? round(promoResult.discount) : 0;
  const total = Math.max(0, round(subtotal) - discount) + shipping;
  return {
    subtotal: round(subtotal),
    discount,
    shipping,
    freeShipping: shippingFree,
    total: round(total)
  };
}

/** Turn client line items into a priced, stock-checked order draft. */
function priceItems(items) {
  const db = read();
  const priced = [];
  const issues = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const product = db.products.find((p) => p.slug === raw.slug || p.id === raw.id);
    if (!product || !isPublishedProduct(product)) {
      issues.push('One of the pieces in your bag is no longer available.');
      continue;
    }
    const qty = Math.max(1, Math.min(20, parseInt(raw.qty, 10) || 1));
    const size = String(raw.size || product.sizes[0] || 'One Size');
    if (!product.sizes.includes(size)) {
      issues.push(`${product.name} is not available in size ${size}.`);
      continue;
    }
    if ((product.stock || 0) < qty) {
      issues.push(`${product.name} only has ${product.stock} left in stock.`);
      continue;
    }
    priced.push({
      id: product.id,
      slug: product.slug,
      name: product.name,
      subtitle: product.subtitle,
      image: product.images[0],
      size,
      color: raw.color || (product.colors[0] && product.colors[0].name) || '',
      qty,
      price: product.price,
      lineTotal: product.price * qty
    });
  }
  const subtotal = priced.reduce((sum, item) => sum + item.lineTotal, 0);
  return { items: priced, subtotal, issues };
}

module.exports = { evaluatePromo, totalsFor, priceItems, round };
