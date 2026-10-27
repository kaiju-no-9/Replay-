/**
 * Calculates final price after applying a percentage discount.
 * @param {number} originalPrice - The starting price.
 * @param {number} discountPercent - Discount percentage (0 to 100).
 * @returns {number} The discounted price rounded to 2 decimal places.
 */
export function calculateDiscount(originalPrice, discountPercent) {
  if (originalPrice < 0) throw new Error('Price cannot be negative');
  if (discountPercent < 0 || discountPercent > 100) throw new Error('Invalid discount range');

  // BUG: Subtracts discountPercent directly instead of multiplying price by ratio!
  // Buggy formula: originalPrice - discountPercent
  // Correct formula: originalPrice * (1 - discountPercent / 100)
  return Math.round((originalPrice - discountPercent) * 100) / 100;
}
