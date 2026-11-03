'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toNumber } = require('../src/numbers');

test('plain and formatted prices parse', () => {
  assert.equal(toNumber(12500), 12500);
  assert.equal(toNumber('12500'), 12500);
  assert.equal(toNumber('12,500'), 12500);
  assert.equal(toNumber('PKR 12,500'), 12500);
  assert.equal(toNumber('1 250'), 1250);
  assert.equal(toNumber(' 250.4 '), 250.4);
});

test('localised digits parse', () => {
  assert.equal(toNumber('١٢٥٠٠'), 12500); // Arabic-Indic
  assert.equal(toNumber('۱۲۵۰۰'), 12500); // Persian
});

test('unreadable input falls back instead of becoming 0', () => {
  assert.ok(Number.isNaN(toNumber('')));
  assert.ok(Number.isNaN(toNumber('abc')));
  assert.equal(toNumber('', 0), 0);
  assert.equal(toNumber(null, 7), 7);
  assert.equal(toNumber(undefined, 7), 7);
  assert.ok(Number.isNaN(toNumber(Infinity)));
});
