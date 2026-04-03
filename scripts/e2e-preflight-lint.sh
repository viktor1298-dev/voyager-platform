#!/usr/bin/env bash
# E2E Preflight Linter — scans tests/e2e/ for known failure patterns
# Exit codes: 0=clean, 1=warnings, 2=blocking issues
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
E2E_DIR="$REPO_ROOT/tests/e2e"
WEB_SRC="$REPO_ROOT/apps/web/src"
SKILLS_DIR="$REPO_ROOT/.claude/skills"

BLOCKS=0
WARNS=0
INFOS=0

RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "═══════════════════════════════════════"
echo " E2E Preflight Linter"
echo "═══════════════════════════════════════"
echo ""

if [ ! -d "$E2E_DIR" ]; then
  echo -e "${RED}[BLOCK]${NC} tests/e2e/ directory not found at $E2E_DIR"
  exit 2
fi

# 1. networkidle — BLOCK
echo "▶ Checking for networkidle..."
NETWORKIDLE=$(grep -rn "networkidle" "$E2E_DIR" --include="*.spec.ts" --include="*.ts" 2>/dev/null | grep -v "^.*:.*//.*networkidle" | grep -v "^.*:\s*\*" || true)
if [ -n "$NETWORKIDLE" ]; then
  echo -e "${RED}[BLOCK]${NC} networkidle found (causes failures on polling pages):"
  echo "$NETWORKIDLE" | while IFS= read -r line; do
    echo "  $line"
  done
  BLOCKS=$((BLOCKS + $(echo "$NETWORKIDLE" | wc -l)))
fi

# 1b. networkidle in skill references — BLOCK (Claude reads these during QA)
echo "▶ Checking for networkidle in skill references..."
if [ -d "$SKILLS_DIR" ]; then
  SKILL_NETWORKIDLE=$(grep -rn "networkidle" "$SKILLS_DIR" --include="*.md" 2>/dev/null | grep -v "never.*networkidle\|Never.*networkidle\|BLOCKED.*networkidle\|banned\|don't\|Do NOT\|-workspace/\|playwright-patterns/\|❌\|timeout.*networkidle\|networkidle.*timeout\|Wrong Approach\|Anti-Pattern" || true)
  if [ -n "$SKILL_NETWORKIDLE" ]; then
    echo -e "${RED}[BLOCK]${NC} networkidle found in skill references (Claude will learn this pattern):"
    echo "$SKILL_NETWORKIDLE" | while IFS= read -r line; do
      echo "  $line"
    done
    BLOCKS=$((BLOCKS + $(echo "$SKILL_NETWORKIDLE" | wc -l)))
  fi
fi

# 2. Unqualified role selectors ��� WARN
echo "▶ Checking for unqualified getByRole()..."
UNQUALIFIED=$(grep -rn "getByRole('[^']*')" "$E2E_DIR" --include="*.spec.ts" 2>/dev/null | grep -v "name:" || true)
if [ -n "$UNQUALIFIED" ]; then
  echo -e "${YELLOW}[WARN]${NC} getByRole() without name: (strict mode violations):"
  echo "$UNQUALIFIED" | while IFS= read -r line; do
    echo "  $line"
  done
  WARNS=$((WARNS + $(echo "$UNQUALIFIED" | wc -l)))
fi

# 2b. /next/i regex selector — BLOCK (matches Next.js Dev Tools button in dev mode)
echo "▶ Checking for /next/i regex selector..."
NEXT_REGEX=$(grep -rn '/next/i' "$E2E_DIR" --include="*.spec.ts" --include="*.ts" 2>/dev/null | grep -v "^.*:.*//.*next/i" || true)
if [ -n "$NEXT_REGEX" ]; then
  echo -e "${RED}[BLOCK]${NC} /next/i regex found (matches Next.js Dev Tools button in dev mode):"
  echo "$NEXT_REGEX" | while IFS= read -r line; do
    echo "  $line"
  done
  echo -e "  ${YELLOW}Fix: Use exact string { name: 'Go to next step' } or data-testid=\"wizard-next-btn\"${NC}"
  BLOCKS=$((BLOCKS + $(echo "$NEXT_REGEX" | wc -l)))
fi

# 2c. page.accessibility.snapshot() — BLOCK (deprecated Playwright API)
echo "▶ Checking for deprecated accessibility.snapshot()..."
ACC_SNAP=$(grep -rn 'accessibility\.snapshot' "$E2E_DIR" --include="*.spec.ts" --include="*.ts" 2>/dev/null | grep -v "^.*:.*//.*accessibility" || true)
if [ -n "$ACC_SNAP" ]; then
  echo -e "${RED}[BLOCK]${NC} page.accessibility.snapshot() is deprecated:"
  echo "$ACC_SNAP" | while IFS= read -r line; do
    echo "  $line"
  done
  echo -e "  ${YELLOW}Fix: Use browser_snapshot MCP tool instead${NC}"
  BLOCKS=$((BLOCKS + $(echo "$ACC_SNAP" | wc -l)))
fi

# 3. Missing env guards — WARN
echo "▶ Checking for missing env guards..."
ENV_ISSUES=$(grep -rln "cluster\|kubectl\|k8s\|kubernetes" "$E2E_DIR" --include="*.spec.ts" 2>/dev/null || true)
if [ -n "$ENV_ISSUES" ]; then
  for f in $ENV_ISSUES; do
    if ! grep -q "ENV-BLOCKED\|test\.skip\|process\.env" "$f" 2>/dev/null; then
      echo -e "${YELLOW}[WARN]${NC} K8s references without env guard: $f"
      WARNS=$((WARNS + 1))
    fi
  done
fi

# 4. Hard-coded timeouts > 500ms — WARN
echo "▶ Checking for hard-coded timeouts > 500ms..."
TIMEOUTS=$(grep -rn 'waitForTimeout([5-9][0-9][0-9]\|waitForTimeout([0-9][0-9][0-9][0-9]' "$E2E_DIR" --include="*.spec.ts" 2>/dev/null || true)
if [ -n "$TIMEOUTS" ]; then
  echo -e "${YELLOW}[WARN]${NC} Hard-coded timeouts > 500ms found:"
  echo "$TIMEOUTS" | while IFS= read -r line; do
    echo "  $line"
  done
  WARNS=$((WARNS + $(echo "$TIMEOUTS" | wc -l)))
fi

# 5. Missing data-testid — INFO
echo "▶ Checking for components missing data-testid..."
if [ -d "$WEB_SRC" ]; then
  MISSING_TESTID=$(grep -rln "onClick\|onChange" "$WEB_SRC" --include="*.tsx" 2>/dev/null || true)
  if [ -n "$MISSING_TESTID" ]; then
    for f in $MISSING_TESTID; do
      if ! grep -q "data-testid" "$f" 2>/dev/null; then
        echo -e "${BLUE}[INFO]${NC} Interactive component without data-testid: ${f#$REPO_ROOT/}"
        INFOS=$((INFOS + 1))
      fi
    done
  fi
fi

# Summary
echo ""
echo "═══════════════════════════════════════"
echo " Results: ${RED}$BLOCKS blocks${NC} | ${YELLOW}$WARNS warnings${NC} | ${BLUE}$INFOS info${NC}"
echo "═══════════════════════════════════════"

if [ "$BLOCKS" -gt 0 ]; then
  echo -e "${RED}❌ BLOCKED — Fix blocking issues before running E2E${NC}"
  exit 2
elif [ "$WARNS" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  WARNINGS — Proceed with caution${NC}"
  exit 1
else
  echo -e "✅ Clean — safe to run E2E"
  exit 0
fi
