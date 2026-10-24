# Frontend verification — 2026-10-25

## Completed checks

- Production TypeScript/Vite build: passed with React 18, Fiber 8, Drei 9, Three.js 0.170, Vite 6.4.5 and the compatible React plugin.
- Backend contract suite: **7 passed**. Covers native terrain/mesh alignment and row orientation, assessment reconciliation, footprint values, optimizer feasibility/costs, persisted plan/notice responses, validation bounds and explicitly sourced offline briefings.
- Complete Playwright suite: **7 passed** in approximately 3.6 minutes against the built frontend and an isolated real FastAPI backend.
- After numeric-input improvements, the three affected scenarios (mission workflow, registry and stale responses) passed again. After inspection-camera/label refinements, the complete mission workflow passed again.
- Numeric input checks include a typed optimizer radius and restoring the previous valid value after an out-of-range entry.
- Browser screenshots reviewed at **1920×1080**: gateway, spacecraft setup, operations, simulation, optimizer, report, registry, coordination, pricing and demo entry. Mobile fallback screenshot captured at **390×844** with reduced motion.
- A multi-page report PDF was generated through Chromium's print path. The UI uses the browser print dialog for Print / Save as PDF.
- Dependency tree has no invalid peer dependencies. Final `npm audit`: **0 vulnerabilities reported**.
- `git diff --check`: passed. Git emits only its Windows line-ending conversion notices.

## Browser scenarios

1. Configure coordinates → simulate → play/pause/seek/restart → optimize → adopt actual candidate → compare/report → briefing → PDF.
2. File a real proposal → switch to recipient → object → reload → acknowledge → confirm persistence and unchanged backend plan status.
3. Registry owner/type filters update list and 3D scene → inspect → register → remove owned test asset.
4. Four indicative pricing tiers → informational contact dialog → SSO concept disclosure → functional demo organization entry → subscription disclosure.
5. Forced WebGL failure → functional 2D fallback; reduced motion, mobile overflow and backend connection failure.
6. Guided two-operator demo → original notice → persisted objection → optimization → new revised proposal; no invented resolution.
7. Delayed old assessment response cannot overwrite a later site selection.

## Integrity and limits

Tests used a temporary registry supplied by `backend/serve_test.py`, not the project's saved operational-demo registry. Existing model/planner/damage algorithms were not changed. The only new backend capability is the read-only terrain visualization grid.

Screenshots and PDF are in ignored `frontend/artifacts/`; test diagnostics are in ignored `frontend/test-results/`. Browser QA used headless Chromium with software WebGL support. No application runtime errors were observed in the inspected workflow. Chromium emitted GPU ReadPixels stall warnings while capturing screenshots; real laptop GPU performance has not been benchmarked.

The renderer is lazy loaded, but its production chunk remains about **901 kB uncompressed / 246 kB gzip**. Vite reports its standard large-chunk advisory. No 60 FPS, load-time or operational accuracy claim is made.

The offline briefing path was exercised. A live Anthropic-backed briefing was not verified. No real SSO, billing, tenant authorization, plan amendment or consultation-resolution capability exists in the supplied backend; the interface labels those boundaries. Replay and asset geometry remain illustrative; synthetic terrain is not actual south-pole DEM data.

The orbital Moon visual uses the credited NASA SVS CGI Moon Kit color map; source details are in `frontend/public/ASSETS.md`. This does not alter the local simulation terrain or imply NASA endorsement.

Changes are local. No Git commit, push, hosting registration or deployment was performed.
