#!/usr/bin/env bash
# Deterministic demo agent: correctly fixes the discount bug, commits, exits 0.
set -e
echo "[Winner Agent] Analyzing repository context..."
sleep 1
echo "[Winner Agent] Identified bug in index.js: calculateDiscount formula is incorrect."
echo "[Winner Agent] Applying surgical bugfix..."

cat << 'EOF' > index.js
/**
 * Calculates final price after applying a percentage discount.
 */
export function calculateDiscount(originalPrice, discountPercent) {
  if (originalPrice < 0) throw new Error('Price cannot be negative');
  if (discountPercent < 0 || discountPercent > 100) throw new Error('Invalid discount range');

  return Math.round((originalPrice * (1 - discountPercent / 100)) * 100) / 100;
}
EOF

git add index.js
git commit -m "fix: calculate discount using percentage ratio formula" --quiet
echo "[Winner Agent] Bug resolved and committed to branch."
exit 0
