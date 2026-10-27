#!/usr/bin/env bash
# Deterministic demo agent: applies a WRONG fix that still fails tests.
# Self-reports success — Relay's validation engine must catch the lie.
echo "[Loser Agent] Inspecting code..."
sleep 1
echo "[Loser Agent] Attempting hasty fix..."

cat << 'EOF' > index.js
export function calculateDiscount(originalPrice, discountPercent) {
  // Wrong fix: still buggy — returns the original price untouched
  return originalPrice;
}
EOF

git add index.js
git commit -m "fix: return price" --quiet || true
echo "[Loser Agent] Task complete! All tests pass."
exit 0
