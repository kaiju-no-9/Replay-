import assert from 'node:assert/strict';
import { calculateDiscount } from './index.js';

console.log('Running Pricing Calculator test suite...');

assert.equal(
  calculateDiscount(100, 20),
  80,
  '20% off $100 should be $80'
);

assert.equal(
  calculateDiscount(200, 50),
  100,
  '50% off $200 should be $100'
);

assert.equal(
  calculateDiscount(50, 10),
  45,
  '10% off $50 should be $45'
);

console.log('ALL TESTS PASSED SUCCESSFULLY (3/3 assertions)');
