# Visual Regression Tests (Playwright)

Visual tests live under `tests/visual/` and use a dedicated Playwright config:

- Config: `playwright.visual.config.ts`
- Baselines (snapshots): `tests/visual/__screenshots__/`
- Projects: `desktop (1280x720)` + `mobile (375x812)`
- Pixel diff tolerance: `threshold: 0.1`

## Run visual tests

```bash
pnpm test:visual
```

## Create / update baselines

```bash
pnpm test:visual:update
```

Use `test:visual:update` only when UI changes are intentional.
