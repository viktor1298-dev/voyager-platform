# Add Cluster Wizard Redesign

**Date:** 2026-04-03
**Scope:** Full visual and interaction redesign of the Add Cluster wizard dialog

## Overview

Replace the current basic modal wizard (flat cards, emoji icons, plain progress bar, inline animation values) with a premium two-panel split layout featuring adaptive illustration panels, spring-driven animations, brand-color tile selection, connection validation visualization, and layout morphing — all using centralized design tokens exclusively.

## Current State

- Single 883-line monolithic component (`AddClusterWizard.tsx`) inside a generic `Dialog`
- Provider selection: 2-column grid of flat bordered cards with emoji icons
- Progress: plain fill bar with no step labels
- Step transitions: inline `{ opacity: 0, y: 10 }` with hardcoded `duration: 0.22`
- Validation: spinner + text in a small box
- Review: basic text summary
- Does not leverage `animation-constants.ts` variants, spring physics, or CSS custom property glows

## Design

### Layout

**Two-panel split dialog** at `width: min(960px, 90vw)`.

| Panel | Width | Purpose |
|-------|-------|---------|
| Left  | ~320px fixed | Visual context — adapts identity per step |
| Right | flex: 1 (~640px) | Form content — inputs, tiles, validation |

The dialog uses the existing `Dialog` component (`components/ui/dialog.tsx`) with an added `size` prop (default: `"md"` for existing behavior, `"xl"` for this wizard). The `size="xl"` variant applies `width: min(960px, 90vw)` instead of the current `max-w-lg`. The `DialogContent` renders the two-panel flex container.

On screens narrower than 640px, the left panel collapses entirely — the wizard becomes single-panel (right panel only with step dots moved to top).

### Step 1 — Provider Selection

**Left panel:**
- Heading: "Connect Your Cluster" + subtitle "Choose a provider to get started"
- Grid of 5 provider logos (using `ProviderLogo` component, not emoji) floating with a subtle parallax drift CSS animation
- Float animation uses `@keyframes` in globals.css (not Motion) — paused when `useReducedMotion()` returns true via `animation-play-state: paused`

**Right panel:**
- Title: "Add Cluster" with close button
- Step label: "Choose Provider" (uppercase, `--color-text-muted`)
- Full-bleed selectable tiles in a vertical list (replacing 2-column grid):
  - Each tile: `ProviderLogo` (40px) + name + subtitle + radio indicator circle
  - Hover: background lightens (`--color-bg-card-hover`), border brightens (`--color-border-hover`)
  - Selected: provider brand-color background tint (e.g., AWS = `rgba(255,153,0,0.06)`), left accent bar (3px, provider brand color, with glow `box-shadow`), checkmark indicator pops in using `badgePopVariants` (bouncy spring)
  - Brand colors sourced from `PROVIDER_ICONS` in `ProviderLogo.tsx` (already has per-provider colors)
- Footer: Cancel (ghost button) + Next (primary button)

**Provider tiles replace the current `CLUSTER_PROVIDERS` array's emoji `icon` field.** The `ProviderLogo` component already renders proper SVG logos for all 5 providers.

### Step 2 — Credentials

**Left panel:**
- Selected provider logo expands to hero size (80px) using `layoutId="wizard-provider-logo"` — morphs from the tile position on the right to centered hero on the left
- Provider name displayed below the logo
- Provider subtitle badge (e.g., "Amazon Elastic Kubernetes Service")
- Background gradient tints toward provider's brand color
- Kubeconfig detection banner (when detected): shows detected provider info below the hero logo

**Right panel:**
- Step label: provider-specific (e.g., "AWS EKS Credentials")
- Form fields: identical to current but with upgraded styling:
  - Inputs: `--color-bg-surface` background, `--color-border` border, accent glow on focus (`box-shadow: 0 0 0 3px rgba(accent, 0.1)`)
  - File drop zones: dashed border with drag-active accent highlight
  - Validation errors: `errorShakeVariants` on the input, `--color-status-error` text
- Kubeconfig provider detection banner stays in right panel (same as current)
- Footer: Back + Next

### Step 3 — Connection Validation

**Left panel:**
- Concentric ring animation: 3 rings pulsing outward from a center cluster icon
- Rings use CSS `@keyframes` with staggered delays (0s, 0.4s, 0.8s)
- On success: rings transition to `--color-status-active` (green) + `SuccessCheck` SVG draw animation replaces center icon
- On error: `errorShakeVariants` on the ring container + rings turn `--color-status-error` (red)
- Subtitle text below: "Establishing connection..." → "Connected!" / "Connection failed"

**Right panel:**
- Step label: "Validating Connection"
- Step-by-step progress ticker — vertical checklist of sub-steps:
  1. "Resolving endpoint"
  2. "Testing TLS handshake"
  3. "Authenticating credentials"
  4. "Fetching cluster metadata"
  5. "Verifying API access"
- Each row has 3 states:
  - **Done:** green checkmark icon (`--color-status-active`), `successCheckVariants` SVG draw
  - **Active:** spinning loader icon (`--color-accent`), accent background tint
  - **Pending:** dim dot icon, reduced opacity
- Rows stagger in on mount using `listContainerVariants` + `listItemVariants` (which use `STAGGER.fast` = 30ms, matching the existing library defaults)
- The ticker is cosmetic — the actual validation is a single `validateConnection` tRPC call. The sub-steps are timed transitions (e.g., 0.5s → "Resolving", 1s → "TLS", 1.5s → "Authenticating", etc.) that advance to show progress while the real call completes. When the call resolves, all remaining sub-steps complete at once.
- Footer: Back + Next (Next disabled until validation succeeds)

### Step 4 — Review & Name

**Left panel:**
- Summary review card with staggered row reveals (`listContainerVariants` + `listItemVariants`):
  - Provider logo + cluster name (large, centered)
  - Provider, Status ("Connected" green badge), Endpoint, Environment
- The card slides in with `slideUpVariants`

**Right panel:**
- Step label: "Review & Name"
- Connection summary section (read-only): Provider, Endpoint, Connection status
- Two-column form: Environment dropdown + Cluster Name input
- Auto-detected name hint below name input (same as current)
- Footer: Back + "Add Cluster" (primary button)

### Step Transitions

**Right panel content:** `AnimatePresence mode="wait"` with step content keyed by step number.
- Uses `slideUpVariants` as-is from animation-constants.ts (enter: y: 8 → 0, `DURATION.normal` 200ms; exit: y: 0 → -4, `DURATION.fast` 150ms — already follows "exit faster than enter" rule)
- No duration overrides — the built-in variant timings are correct for this use case

**Left panel content:** `AnimatePresence mode="wait"` with separate key.
- Uses `fadeVariants` for crossfade between step contents
- Provider logo morph via `layoutId="wizard-provider-logo"` (steps 1→2→4)

### Step Indicator

Small dot indicators at the bottom of the left panel:
- 4 dots, horizontal
- Completed: `--color-status-active` fill + subtle green glow
- Active: `--color-accent` fill + accent glow (`--glow-accent`)
- Upcoming: `--color-border` fill, no glow
- Transitions between states use `DURATION.normal` (200ms)

### Button Interactions

- **Primary button (Next / Add Cluster):** `buttonHover` (scale 1.02) + `buttonTap` (scale 0.97) from animation-constants.ts. Background: `--color-accent`. Disabled state: `opacity: 0.5`
- **Ghost button (Cancel / Back):** CSS `transition-colors` with `DURATION.fast`. Border: `--color-border`. Hover: `--color-bg-card-hover`

### Responsive Behavior

- **>= 640px:** Two-panel layout as designed
- **< 640px:** Left panel hidden entirely. Step dots move to top of right panel (horizontal, below title). Provider logo morph disabled. Single-column form layout. All functionality preserved.

## Component Architecture

The monolithic `AddClusterWizard.tsx` (883 lines) will be decomposed:

```
components/add-cluster/
├── AddClusterWizard.tsx        # Main orchestrator — state, step logic, submit
├── WizardLeftPanel.tsx         # Left panel with step-adaptive content
├── WizardProviderTiles.tsx     # Step 1 right — provider tile list
├── WizardCredentialForm.tsx    # Step 2 right — provider-specific form fields
├── WizardValidation.tsx        # Step 3 right — progress ticker
├── WizardReview.tsx            # Step 4 right — summary + name/env form
└── WizardStepDots.tsx          # Step indicator dots
```

State remains in `AddClusterWizard.tsx` (the orchestrator). Step components receive state and callbacks as props. This decomposition keeps each file focused (~100-200 lines) while maintaining centralized state management.

The existing `FileDrop` sub-component moves into `WizardCredentialForm.tsx`.

## Centralized Token Usage

Every visual value must come from centralized sources:

| Value Type | Source | Examples |
|------------|--------|----------|
| Colors | `globals.css` CSS custom properties | `--color-accent`, `--color-border`, `--glow-accent`, `--color-status-active` |
| Motion durations | `animation-constants.ts` `DURATION` | `DURATION.fast`, `DURATION.normal`, `DURATION.page` |
| Motion easing | `animation-constants.ts` `EASING` | `EASING.spring`, `EASING.snappy`, `EASING.exit` |
| Motion variants | `animation-constants.ts` exports | `fadeVariants`, `slideUpVariants`, `badgePopVariants`, `buttonHover`, `buttonTap`, `errorShakeVariants`, `successCheckVariants`, `listContainerVariants`, `listItemVariants` |
| Stagger delays | `animation-constants.ts` `STAGGER` | `STAGGER.normal` (50ms) |
| Provider colors | `ProviderLogo.tsx` `PROVIDER_ICONS` | Per-provider brand colors (already centralized) |
| Provider detection | `@voyager/config/providers` | `detectProviderFromKubeconfig()`, `PROVIDER_LABELS` |

**Zero hardcoded** color values, duration numbers, or easing arrays in the wizard components.

## New CSS Custom Properties

Add to `globals.css` for the wizard:

```css
/* Wizard-specific tokens (both :root and html.light) */
--wizard-left-bg: linear-gradient(160deg, var(--elevated) 0%, var(--surface) 50%, color-mix(in srgb, var(--color-accent) 5%, var(--surface)) 100%);
--wizard-ring-color: var(--color-accent);
--wizard-ring-success: var(--color-status-active);
--wizard-ring-error: var(--color-status-error);
```

Float and ring-pulse keyframes added to globals.css alongside existing keyframes.

## New Animation Variants

Add to `animation-constants.ts` if not already present:

- `wizardRingPulse` — if the ring animation needs Motion control (may stay CSS-only)
- No other new variants needed — existing library covers all cases

## Accessibility

- `useReducedMotion()` disables: float animation, ring pulses, layoutId morphs, stagger delays. Step transitions fall back to instant swaps.
- Provider tiles use `role="radiogroup"` + `role="radio"` + `aria-checked` (same as current)
- Validation ticker uses `aria-live="polite"` for status updates
- Focus trap in Dialog remains unchanged
- Keyboard: Tab through tiles, Enter to select, Escape to close

## Testing Considerations

- E2E tests for the wizard will need updated selectors (tiles instead of card grid)
- The `data-testid` attributes should be added to tiles and step elements
- Validation ticker sub-steps are cosmetic — tests should assert on final validation state, not individual sub-steps
- Responsive breakpoint (640px) should be tested

## Files Modified

| File | Change |
|------|--------|
| `components/AddClusterWizard.tsx` | Decompose into `add-cluster/` directory |
| `components/add-cluster/AddClusterWizard.tsx` | New orchestrator (state + layout) |
| `components/add-cluster/WizardLeftPanel.tsx` | New — left panel with adaptive content |
| `components/add-cluster/WizardProviderTiles.tsx` | New — provider tile list |
| `components/add-cluster/WizardCredentialForm.tsx` | New — credential forms + FileDrop |
| `components/add-cluster/WizardValidation.tsx` | New — validation progress ticker |
| `components/add-cluster/WizardReview.tsx` | New — review summary + name/env |
| `components/add-cluster/WizardStepDots.tsx` | New — step indicator dots |
| `components/ui/dialog.tsx` | Support wider max-width variant |
| `app/globals.css` | Add wizard CSS tokens + keyframes |
| `lib/animation-constants.ts` | Possibly add ring pulse variant |
| `app/clusters/page.tsx` | Update import path for AddClusterWizard |
