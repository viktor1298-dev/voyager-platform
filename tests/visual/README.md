# Visual Regression Tests (Playwright)

Visual tests live under `tests/visual/` and use a dedicated Playwright config:

- Config: `playwright.visual.config.ts`
- Baselines (snapshots): `tests/visual/__screenshots__/`
- Projects: `desktop (1280x720)` + `mobile (375x812)`
- Pixel diff tolerance: `threshold: 0.1`

## Test matrix (current)

- Spec files: **2**
- Test cases: **5**
  - `login.visual.spec.ts`: 1 test
  - `main-pages.visual.spec.ts`: 4 tests (dashboard, clusters, deployments, events)
- Themes covered: **2** (light + dark for main pages)
- Projects covered: **2** (desktop + mobile)
- Expected snapshot baselines: **18** total
  - Login: 1 route × 2 projects = 2 snapshots
  - Main pages: 4 routes × 2 themes × 2 projects = 16 snapshots

## Stability guards

- Uses `BASE_URL` when provided, otherwise falls back to local `http://localhost:3000`
- Local `webServer` fallback is enabled when `BASE_URL` is not set
- Waits for `networkidle` before every screenshot
- Dynamic UI is masked (timestamps, live counters/widgets, aria-live regions)
- Animations/transitions are disabled and `prefers-reduced-motion` is emulated

## Run visual tests

```bash
pnpm test:visual
```

## Create / update baselines

```bash
pnpm test:visual:update
```

Use `test:visual:update` only when UI changes are intentional.
