'use strict';

/**
 * Tolerant number parsing for admin input.
 *
 * Accepts "12,500", "PKR 12500", "1 250", Arabic-Indic / Persian digits and
 * plain numbers. Returns `fallback` when the input cannot be read, so a stray
 * character never silently becomes 0 (which is what turned a valid price into
 * a "price is required" error in the admin).
 */
function toNumber(value, fallback = NaN) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value == null) return fallback;
  const cleaned = String(value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d.,-]/g, '')
    .replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { toNumber };
