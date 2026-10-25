# PLUME V2 — implementation report

## Executive result

V2 retains the cinematic UI and the real numerical engine. It replaces JSON
writes with transactional SQLite, introduces explicit direct-loopback demo
sessions with server-side permissions, and completes the persistent
objection/revision/reconsultation/coordination lifecycle. It does not claim a
production identity provider, validated physics, trained ML or external delivery.

Full setup, API inventory, schemas, scientific rationale, data migration,
state machine, benchmark and exact five-minute demo are in [PLUME_V2.md](PLUME_V2.md).

## Files

Backend created:
- plume/auth.py: configuration, local sessions, identity and permissions.
- plume/budget.py: computation slots and cooperative deadlines.
- plume/contracts.py: response models.
- plume/database.py: transactional repository and safe legacy import.
- plume/maintenance.py: inspect and non-overwriting online backup commands.
- plume/provenance.py: explicit assumptions and versions.
- plume/migrations/001_registry.sql and002_immutable_history.sql.
- benchmark.py: repeatable temporary-data timings.
- tests/test_security.py, test_numerics.py, test_database.py, test_v2.py,
  test_optimizer.py and test_reliability.py.

Backend modified: api.py, store.py, terrain.py, physics.py, damage.py, planner.py,
copilot.py, requirements.txt, requirements-dev.txt, serve_test.py and the existing
contract suite. The original physics equations/constants are retained; sensitivity
scales are renamed with deprecated compatibility aliases.

Frontend targeted integration: api.ts, mission.ts, App.tsx, Method.tsx,
components/Commercial.tsx, Coordination.tsx, Report.tsx, SharedRegistry.tsx,
MissionPanels.tsx, scene/LunarScene.tsx and vite.config.ts. New PlanHistory.tsx and
V2 browser acceptance test. Existing browser assertions follow the new lifecycle.

The branch also retains the earlier uncommitted cinematic work: Gateway,
SpatialWorkspace, cinematic.css, Environment/Models, scene integration, main.tsx,
artwork and asset credits. These changes were backed up before V2 and not discarded.
No .env, database, JSON registry, credentials, virtual environment, node_modules,
built output or browser test artifacts are included in Git.

Docs: README, FRONTEND, VERIFICATION, PLUME_V2 and this report. .gitignore now
excludes the local virtual environment.

## Migration result

Verified preservation:6 organizations,7 assets,4 plans,4 notices. Existing IDs,
statuses, replies and timestamps preserved. Full legacy assessment data that did
not exist is labeled unavailable. Original state.json and byte-verified backup
remain; schema versions1and2 use non-destructive SQL. Temporary-copy verification
runs before importing real records. New history uses immutable assessment/asset/
input snapshots and append-only responses/events.

## Security and identity

Static traversal is blocked, including encoded parents and separator variants;
unknown API paths return JSON404; public reset is removed. Mutations enforce
server-derived organization and role permissions. Cookies are HttpOnly and
SameSiteStrict; mutations require CSRF. Demo is opt-in and direct-loopback only.
Production configuration refuses startup. No fake SSO, public organization
impersonation feature or claimed production credentials were introduced.

Request size128KiB, explicit CORS, request IDs, sanitized errors, two computation
slots and cooperative20second deadlines provide modest local reliability.

## Coordination and frontend

Same plan ID -> increasing revision -> immutable assessment -> fresh required
consultations, including previous recipients -> explicit current acknowledgements.
Silence is never consent. Original objections survive. Plans can be withdrawn.
Idempotency keys protect retries; expected_revision prevents stale revision writes.
Structured UTC windows are validated; visible window overlaps are informational,
not physical plume-interaction calculations. In-app notices have read/response
timestamps, inbox counts and visible/idle ten-second refresh.

The frontend shows backend status, revision/objection/event history, snapshot
provenance, reassessment and permission-aware actions. The report can file a
revision or start a separate plan. Existing 3D rendering is retained.

## Science and optimizer

OptionA selected: characteristic scales, same exponent and numerical baseline.
No unsupported recalibration. At the scale, damage is63.2%, not50%. The API
separates dimensionless damage, estimated monetary loss, exposure and hazard
class. Sample quantiles/worst damage are not confidence intervals or failure odds.
Out-of-domain samples are excluded and counted; footprint invalid pixels are
masked. The footprint remains an explicitly nominal solar-array reference.

Baseline objective6.783381280M€; V2 objective6.587186951M€ on the documented seed.
The broader deterministic shortlist and local refinement improve the evaluated
objective about2.9%. One paired timing:1719.2ms vs2385.1ms. Repeated timings and
machine contention are detailed in the guide. Baseline remains selectable for
regression tests. No global optimum is claimed.

## Remaining scope

| Item | Status | Reason |
|---|---|---|
| Static confinement / reset removal | Completed | Security regression tests |
| Transactional SQLite and JSON preservation | Completed | Migration, rollback, FK, restart, concurrency and backup tests |
| Local demo identity and ownership checks | Completed | Explicit opt-in, loopback, CSRF and permissions tests |
| Production SSO / public deployment | Not implemented | Startup deliberately fails closed |
| Revision / objection / reconsultation / coordination | Completed | API lifecycle and persistent snapshots |
| Idempotency and optimistic revision precondition | Completed | Retry and stale revision tests |
| Scientific parameter naming / provenance | Completed | Characteristic-scale test and unchanged baseline |
| Uncertainty | Partially completed | Position samples/quantiles; parameter uncertainty unmodeled |
| Footprint contract | Completed | Reference quantity, metadata and valid mask |
| Dispersion-aware footprint | Not implemented | Optional; fast nominal mode retained |
| Optimizer quality / explanations / diversity | Completed | Baseline comparison and feasibility tests |
| Global optimum / validated Pareto front | Not implemented | Only evaluated shortlist compared |
| Historical assessments | Completed for new revisions | Legacy missing inputs explicitly unavailable |
| In-app updates | Completed | Persistent notices and lightweight polling |
| Email / SMS | Not implemented | Intentionally outside hackathon scope |
| SDK / offline briefing | Completed | SDK signature and fallback tests |
| Credential-backed LLM generation | Not verified | No real credential used or requested |
| Empirical scientific validation / trained ML | Not implemented | No fabricated accuracy or training |
| PostgreSQL / ORM / distributed workloads | Not implemented | Repository boundary retained for future adapters |
| Scheduled backups and recovery drills | Partially completed | Safe online backup command tested; scheduling absent |

## Execution and final verification

Backend baseline7passed; expanded suite27passed. TypeScript and production build
passed. Browser outcome and pushed revision are appended after final verification.
Initial browser regression findings were corrected instead of weakening the
workflow assertions. No physical accuracy is inferred from these software tests.


## Final verification

- Expanded backend suite: **27 passed**, no failures (latest run56.904s while
  browser QA shared the machine).
- Complete browser suite: **9 passed**, no failures,6.3minutes. This includes the
  eight existing scenarios and a new UI acceptance flow: file -> object -> real
  optimizer -> same-plan revision -> updated notice -> acknowledge -> coordinated
  -> reload -> inspect preserved objection.
- Production build, strict TypeScript and selected Prettier checks passed.
- SQLite integrity_check=ok and foreign_key_check=0 violations. Original JSON
  SHA256 unchanged; current saved registry still6organizations/7assets/4plans/4notices.
- Actual SDK1.17.0 signature inspected; live provider invocation not performed.
- All browser tests use the isolated real backend, not the saved registry.
- Backend persistence across Store reopening is covered by the lifecycle and
  migration tests; no historical assessment was recomputed in place.

| Issue | Original behavior | New behavior | Tests | Status |
|---|---|---|---|---|
| Static serving | Parent traversal could read repository files | Normalized containment plus StaticFiles | test_security | Completed |
| Public reset | Unauthenticated destructive endpoint | JSON404, no public reset route | test_security | Completed |
| Organization ownership | Client-selected operator trusted | Server identity, membership, permissions and CSRF | test_v2 | Completed |
| Persistence | Whole-file JSON writes | SQLite transactions, FK, WAL and immutable history | test_database | Completed |
| Migration | No migration pathway | Temporary-copy validation, byte backup, preserved IDs/payloads | test_database | Completed |
| Sensitivities | *_50 mislabeled exponential scales | Explicit scales, deprecated aliases, same baseline | test_numerics | Completed |
| Uncertainty | Mean only, implicit edge clipping | Counts,seed,nominal,quantiles,max; excluded outside samples | test_numerics | Partially completed: no parameter uncertainty |
| Optimization | Eight rescored grid points | Wider shortlist,local refinement,diverse alternatives,explanations | test_optimizer | Completed |
| Coordination | Responses overwrite,plan status unchanged | Immutable responses,revisions,current-revision coordination | test_v2 + v2.spec | Completed |
| Duplicate retries | Duplicate plans/responses | Persistent scoped idempotency | test_v2 | Completed |
| Historical evidence | Summary only,live registry changes | Immutable full snapshots for new revisions | test_v2 | Completed; old missing evidence unavailable |
| Notifications | Stored notices,manual refresh | Read/response timestamps,counts,polling | browser + API tests | Completed for in-app use |
| LLM | Unverified beta call | Stable SDK,explicit provenance,numeric guard,fallback | test_reliability | Partially completed: live availability not verified |
| Production identity | Absent | Explicit fail-closed configuration | test_v2 | Not implemented; deployment blocked intentionally |
| Scientific validation | Unsupported implication of calibration | Assumptions explicit,no invented validation | numerical consistency only | Not implemented |

No main-branch update or deployment is part of this work. The requested branch is
`codex/plume-v2`; push verification is reported in the final chat response.

An additional isolated HTTP acceptance check launched a real Uvicorn subprocess,
filed a plan, recorded an objection, optimized, revised and acknowledged. The
process was terminated and relaunched against the same temporary SQLite file.
The authenticated session, coordinated status, two revisions and complete detail
response were identical after restart. This check passed; it did not operate on
the saved demo registry.
