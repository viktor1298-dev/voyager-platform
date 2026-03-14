📋 Code Review — Metrics page chart/timeline re-review

📊 ציון: 3/10 CHANGES_REQUESTED

🔍 Summary: The backend bucket work in apps/api/src/routers/metrics.ts is directionally correct and the dedicated panel architecture is still the right design, but this revision is not mergeable. The frontend still carries the forbidden 30s/1m synthetic fallback, the tooltip does not actually surface backend bucketStart/bucketEnd windows, and two files contain trailing duplicated garbage that will break parsing/build/tests.

📝 Findings:

🟠 HIGH (5):
[HIGH] apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx:51 — Synthetic 30s/1m frontend fallback still exists via buildSyntheticBuckets()/normalizeHistory().
  Fix: Delete the fallback path entirely and consume backend-native 30s/1m buckets directly from historyQuery.data.

[HIGH] apps/web/src/components/metrics/MetricsTimeSeriesPanel.tsx:279 — shouldUseFallbackSource is referenced but never defined.
  Fix: Remove the fallback messaging branch entirely with the fallback code, or define a real variable if intentionally kept (but requested behavior says it should be removed).

[HIGH] apps/web/src/components/metrics/MetricsAreaChart.tsx:333 — File has duplicated/corrupted trailing JSX/text after the component end.
  Fix: Remove the duplicated tail and ensure the file ends cleanly after the exported component.

[HIGH] apps/web/src/components/metrics/MetricsAreaChart.tsx:150 — Tooltip still uses only label/timestamp and does not display bucketStart/bucketEnd window from backend data.
  Fix: Extend MetricsDataPoint to carry bucketStart/bucketEnd and render a precise window like “17:00:00–17:00:10” (or date+time for larger ranges) in tooltip/header.

[HIGH] tests/e2e/m-p3-features.spec.ts:223 — File contains duplicated trailing broken code after the final test block.
  Fix: Remove the stray duplicated lines so Playwright can parse and execute the spec.

✅ What’s good:
- apps/api/src/routers/metrics.ts now defines native 30s/1m/5m/1h/6h/24h/7d bucket timelines instead of the previous long-range-only config.
- Backend history/resourceUsage/clusterHealth responses now emit bucketStart and bucketEnd alongside timestamp.
- Dedicated CPU/Memory/Network/Pods panel architecture in MetricsTimeSeriesPanel remains the correct UX direction and avoids mixed-unit overlays.
- ResourceSparkline now filters out null-filled history points, which is the right downstream null-handling pattern.
- TimeRangeSelector accessibility improved with tablist/tab + aria-selected.

💡 Recommendation:
- Do not merge/deploy/QA yet. Fix the two broken files, remove synthetic short-range fallback completely, and wire tooltip/panel rendering to actual backend bucketStart/bucketEnd semantics. Then rerun TS/build and Playwright before another review.
