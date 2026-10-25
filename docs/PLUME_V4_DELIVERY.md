# PLUME V4 — Delivery and five-minute demonstration

Date: 2026-10-25. Branch: `codex/plume-v4`. Starting commit: `9ee0b45`.
The repository was clean at resumption; the ux-7-steps visual baseline, accounts,
SQLite registry and existing history were preserved. Main was not modified.

## Implementation status

| Requested step | Status | Evidence |
| --- | --- | --- |
| Persistent missions and session isolation | Terminé | Existing draft lifecycle and session tests retained |
| Phase 3: objection to explicit current-revision acknowledgement | Terminé | Dedicated backend tests and two authenticated browser contexts |
| Spatial before/after comparison | Terminé | Real assessment/footprint previews, constraint checks, equipment differences; 2D/3D framing |
| Reproducible decision dossier | Terminé | Persisted revision PDF + full JSON, registry-change and permission tests |
| Targeted SaaS polish | Terminé | Existing rail shows current organization, risk, affected organizations, current objections and next action; draft save/conflict controls retained |
| Optional demo director | Terminé | 13 navigation-only steps, back/skip/minimize/close, recoverable navigation indices |
| Lunar Experience | Terminé | Public arrival, explicit authentication, five connected chapters, same authorized working mission and workspace |

“Terminé” refers to the implementation and the checks below, not scientific or
production certification. No trained ML, billing service, signature or regulatory
approval is claimed.

## API and persistence

New endpoint:

```
GET /api/plans/{plan_id}/revisions/{number}/dossier?format=json
GET /api/plans/{plan_id}/revisions/{number}/dossier?format=pdf
```

Participants must pass the existing private-plan authorization. Missing revisions
return 404. Download responses use `Cache-Control: private, no-store`.

Existing `PATCH /api/notices/{id}` accepts text concerns or structured constraints:
`asset_id`, required nonblank `reason`, optional `max_damage_fraction` (0..1),
optional `min_separation_m` (0..30000). The overall reply supplies additional
explanation. Acknowledgements cannot add constraints. Only recipient-owned active
equipment linked to that consultation is accepted.

`POST /api/optimize` includes active server-derived proposal requirements; the
client cannot remove them. The objective remains modeled loss + relocation cost.
Feasible alternatives and rejected near misses are separate. An empty evaluated
search is not a global impossibility claim.

`GET /api/optimization-runs/{id}` remains organization-scoped and now returns its
source proposal revision. Filing checks the organization, proposal, source
revision, lander parameters and evaluated candidate membership. It reassesses
current equipment, slope, clearance and active negotiated limits. A transaction
rejects a registry or objection change during evaluation instead of saving stale
evidence. Expected revision/version and idempotency behavior are retained.

Migration 005 (`mission_drafts`) and migration 006 (`optimization_runs`) existed
at resumption and remain additive. No new schema migration, reset or destructive
conversion was introduced. Snapshot additions: organization identity and
consultations as recorded at filing. Old missing evidence stays explicitly
unavailable; it is never reconstructed from today's registry.

Dossier `frozen_revision` contains the selected persisted inputs, equipment,
model/terrain provenance, results, constraints, optimization and preceding
revision/consultation history. `current_coordination` contains separately labeled
current status, visible responses and append-only events. Results remain frozen
when registry equipment changes. Reconsultation retains unacknowledged requirements,
including equipment that falls below notification thresholds, until an explicit
recipient acknowledgement. Earlier objections remain in history.

## Two entries, one application

`Gateway` retains the existing lunar renderer and visual identity and changes the
headline and two calls to action. `ExperienceGuide` is an optional navigation and
explanation layer. It does not own a parallel mission model.

| Chapter | Existing components and real operations |
| --- | --- |
| Arrival | `LunarScene` / `MapView`, public equipment and operator registry |
| Your landing | `Configuration`, explicit spacecraft presets, local site selection, existing organization drafts |
| The consequence | `AnalysisWorkspace`, `POST /api/assess` and `/api/footprint`, asset owner/damage/loss from backend results |
| A better way | Existing optimizer workspace, `POST /api/optimize`, backend before/after previews and explicit `adoptSite` |
| The shared Moon | `CoordinationWorkspace`, existing draft filing/revision endpoints, recipient response endpoint, `PlanHistory` and dossiers |

Mission Control remains directly accessible. Chapter navigation retains the same
Zustand mission and, after saving, the same organization draft ID; it does not
create a second mission. The public experience stops at arrival until login.
There is no anonymous organization mission to migrate or silently assign. The
existing login/session reset protects private state; navigation progress stores
only indices and collapsed state, with no IDs, identity or mission data.

Useful camera views include initial site, selected candidate, both sites and the
most affected equipment. Existing OrbitControls let the user interrupt movement.
Reduced motion removes transitions. The 2D map accepts the same framing and
shows both site markers; Before/After switch the calculated footprint. Particles
remain labeled illustrative. No time-resolved physical simulation is claimed.

Errors retain explicit retry controls. Network recovery reissues the real
assessment; failed searches offer no adoption action. A context-loss test exercises
real WebGL recovery; forced unavailable WebGL exercises 2D and Retry 3D. Draft
conflicts offer the saved-version reload instead of overwriting a teammate.

## Validation

All data-creating backend tests use temporary databases. Browser tests use
`backend/serve_test.py`, which owns its own temporary registry. `PLUME_TEST_PORT`
was added to avoid disturbing a service already running on port 8002.

Commands (from the repository root):

```powershell
Push-Location backend
.\.venv\Scripts\python.exe -m unittest discover -s tests
Pop-Location
Push-Location frontend
node --test tests/session.test.cjs
npm.cmd run build
Pop-Location
```

Isolated browser server, terminal A:

```powershell
cd backend
$env:PLUME_TEST_PORT='8007'
.\.venv\Scripts\python.exe serve_test.py
```

Terminal B:

```powershell
cd frontend
$env:PLUME_TEST_URL='http://127.0.0.1:8007'
npx.cmd playwright test tests/v4-coordination.spec.ts tests/v4-drafts.spec.ts tests/v4-experience.spec.ts tests/v4-renderer.spec.ts
```

Executed evidence:

- 45 backend tests pass, including five dedicated constraint tests and a dossier
  persistence/authorization/PDF test. The constraint tests were rerun after adding
  stale-source-revision, wrong-proposal and existing foreign-owned-asset cases.
- Three store regressions pass: account reset/late responses, correct-site briefing
  across optimization/adoption/undo/revision, delayed briefing isolation.
- TypeScript and Vite production build pass. Vite's existing large 3D chunk warning
  remains; it is not a test failure.
- Browser coverage includes two authenticated organizations, structured thresholds,
  before/after previews with unchanged saved drafts, real constrained adoption,
  filing r2, explicit recipient acknowledgement, historical objection retention
  and dossier download; no-feasible search; save/resume/conflict/archive/restore;
  public arrival/login/same-mission continuation, a deliberately interrupted network
  request followed by a real successful retry, reduced motion and 390px viewport;
  real WebGL context loss and explicit 2D Retry 3D.
- Rendered PDF pages were inspected with Poppler; equipment tables, wrapping and
  live/frozen labels were checked. Desktop arrival/comparison and mobile screenshots
  were inspected alongside working interaction tests.

One repeated browser run exposed an ambiguous test locator because it reused the
same teammate draft name on an already populated *temporary* server. The test now
uses a unique teammate name. No registry clearing was used to hide that failure.
Sandbox-only Vite configuration access failures were rerun successfully with the
approved build permission.

Performance: the initial built main JS was 285.90 kB (86.29 kB gzip), the initial
3D chunk 913.17 kB (248.39 kB gzip). The final measured sizes are recorded in the
completion entry below. Numerical kernels were preserved. No controlled before/
after FPS or compute-latency benchmark was taken; build duration under concurrent
browser rendering is not a credible runtime speed comparison. No heavy artwork
or second 3D renderer was added.

## Startup

Dependencies, when needed:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

`requirements-dev.txt` includes `requirements.txt`, now declaring ReportLab 5.0.1.
Restart an existing backend to load the new endpoints; do not reset its data.

Backend terminal:

```powershell
cd backend
$env:PLUME_DEMO_AUTH='true'
.\.venv\Scripts\python.exe -m uvicorn plume.api:app --host 127.0.0.1 --port 8001
```

Frontend terminal:

```powershell
cd frontend
$env:PLUME_API_TARGET='http://127.0.0.1:8001'
npm.cmd run dev -- --host localhost --port 5174 --strictPort
```

Open `http://localhost:5174/#gateway`. After dependencies are installed and services
use the current code, `./start-plume.ps1` remains the existing convenience launcher.
It reuses healthy services, so it does not reload an already-running old backend.
Demo authentication remains opt-in and loopback-only.

## Five-minute demonstration — target schedule

Use two browser profiles or a private window; keep both sessions open. Fictional
published demo accounts use password `plume-demo-2040`. Operator A:
`kestrel@plume.demo`. Operator B: log in as the recipient actually shown on the
filed consultation (the documented superheavy scenario normally affects Farlight,
`farlight@plume.demo`). Do not assume a recipient if the registry has changed.

| Time | Operator action |
| --- | --- |
| 0:00–0:35 | Gateway → Experience a Landing; view real registry neighbors. Start landing and sign in as A. Open an existing draft or name a fictional mission. |
| 0:35–1:10 | Explicitly choose Super-heavy preset (1800 kN, 30 s, dispersion 50 m); E1500/N-1500 m. Analyze; inspect the actual affected equipment, owner and modeled loss. |
| 1:10–1:40 | Coordinate → Submit proposal. In B's distinct session open this exact proposal and consultation. |
| 1:40–2:15 | B opens Structured objection, selects its listed equipment, gives a reason, optionally maximum mean damage 3% and minimum distance 1000 m. B explicitly submits Raise a concern. |
| 2:15–3:15 | A refreshes/selects the same proposal → Compare a revision → Find alternative sites. Review constraints and any rejected candidates; use Before/After, equipment differences and both-site framing. |
| 3:15–3:50 | If a feasible evaluated candidate exists, A explicitly adopts it, reviews the reassessment, then submits r2. If none exists, show that honest result and adjust the request/search instead of promising success. |
| 3:50–4:25 | B reloads this proposal, checks r2 and retained requirements, then explicitly selects Acknowledge. Other required recipients must respond too before the app shows coordinated. |
| 4:25–5:00 | Show revision/objection history. Expand r2 and download PLUME Coordination Decision Dossier PDF and JSON. Explain the frozen results versus current coordination. |

The optional five-minute director guides these actions without performing them.
Every step can be skipped, revisited, minimized or closed. This is a target
presentation schedule, not a measured guarantee on all hardware or networks.

## Remaining limits

- Physics uses synthetic terrain and illustrative vulnerability/economic inputs;
  it is not experimentally calibrated or validated for flight.
- Feasibility covers the evaluated search, not all lunar sites or a global optimum.
- Footprints are compared through the existing Before/After switch, rather than
  compositing two overlapping hazard rasters. Both site positions remain visible.
- The PDF is a readable summary; the JSON retains full saved search/evidence arrays.
  Legacy missing evidence is labeled; the backend cannot recover data never saved.
- This is a local prototype, not production identity-provider deployment, real
  notification delivery, regulatory approval, billing or a trained ML service.
- Validation uses Chromium and an available software WebGL renderer. Physical GPU,
  every browser/assistive technology and exhaustive visual performance profiling
  remain outside the checks performed here.

## Completion measurements

Final production build: main JS 295.95 kB (89.76 kB gzip); 3D JS 914.65 kB
(249.00 kB gzip); CSS 152.98 kB (30.70 kB gzip). Main JS increases by 10.05 kB
uncompressed and 3.47 kB gzip from the measured initial build. The 3D increment is
1.48 kB uncompressed / 0.61 kB gzip. These are bundle sizes, not FPS claims.

Commits start with `dad592b` (structured constraints) and `e41bc56` (decision
exports and transactional evidence checks); the remaining interface/verification
changes are committed separately on the same branch.

Final browser acceptance: all six V4 Playwright tests passed together against the
isolated real backend (1.7 minutes on this host). After the final guide positioning
adjustment, its real-renderer experience test was rerun separately. Test scope is
listed above; this does not claim every legacy browser suite was executed.
