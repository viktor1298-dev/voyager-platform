#!/usr/bin/env bash
# CI guard: ban dangerous E2E patterns
# Run: bash tests/e2e/banned-patterns.sh

set -euo pipefail
ERRORS=0

# Ban networkidle
HITS=$(grep -rn "networkidle" tests/e2e/ --include="*.ts" --include="*.js" | grep -v '//.*networkidle' | grep -v '\*.*networkidle' | grep -v 'banned-patterns' || true)
if [ -n "$HITS" ]; then
  echo "❌ BANNED: networkidle found (use waitForPageReady or specific selector):"
  echo "$HITS"
  ERRORS=$((ERRORS + 1))
fi

# Ban unqualified getByRole('button') without name
HITS=$(grep -rn "getByRole('button')" tests/e2e/ --include="*.ts" | grep -v 'name:' | grep -v '//.*getByRole' || true)
if [ -n "$HITS" ]; then
  echo "❌ BANNED: unqualified getByRole('button') — add { name: '...' }:"
  echo "$HITS"
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "🚫 $ERRORS banned pattern(s) found. See SHARED-PIPELINE-LEARNINGS.md"
  exit 1
fi

echo "✅ No banned patterns found"
