# PLUME V4 implementation log

Baseline:66123f8, exact ux-7-steps tree. V4 branch:codex/plume-v4. Numerical equations and UI identity preserved.

## Phase1
Session epochs, in-flight API cancellation, full private-state reset, stale computation/refresh/file guards; current-assessed-site briefing with regression cases for optimization, adoption, undo and revision; scientific wording corrected; notification selection reset removed. Actual WebGL creation replaces the extra capability-probe context; one lightweight recovery attempt, explicit Retry3D, functional2D fallback, independent terrain errors. No fallback-child effects (React mounts canvas fallback children even with a working context).

Verification:3 store regression tests;8 existing backend lifecycle/security tests; TypeScript and production build;2 authenticated browser workflows including the complete two-operator revision cycle;2 renderer tests including actual context-loss recovery and forced unsupported GPU. All passed. Browser backend uses isolated temporary SQLite.

## Phase2
Organization-owned mission draft collection; create/read/update/archive/restore and transactional filing. Version preconditions protect teammates and multiple tabs. Draft-to-plan conversion and draft status transition share the same SQLite transaction; incomplete draft input cannot become a filed plan. Existing plan/revision APIs retained. Mission library and compact save indicator added to the existing layout, with autosave for saved drafts and saved-version reload after conflicts.

Migration005 creates mission_drafts without touching the earlier prototype workspace_drafts table or existing plans. Validation:3 backend draft tests; TypeScript/build;2 browser scenarios (draft lifecycle and full two-operator coordination using saved drafts), all passed. Source-draft input is retained in historical assessment snapshots.

## Checkpoint requested by user — phase3 work in progress
Backend foundation added: structured objection constraints validated against recipient-owned active assets; constraint-aware optimization with separation checks, dispersion-aware damage filtering, explicit no-feasible-evaluated-site status and separately labeled near misses; optimization evidence persistence (migration006); filing rechecks active constraints and snapshots the run and constraint evaluation. Frontend API/state carries optimization run references.

This is NOT a completed phase3: no structured-objection form or constraint-results UI yet; no dedicated tests of the new constrained workflow; no final browser acceptance for this checkpoint. Existing8 lifecycle/security backend tests still pass. Phases4–7 are not implemented beyond pre-existing before/after previews, reports and UX. Work paused at the user's request; main remains ux-7-steps. Resume from codex/plume-v4.

## V4 completion — 2026-10-25

The checkpoint above is historical. The structured objection UI, dedicated constrained-workflow tests and two-session browser acceptance are now implemented. See [delivery and demonstration](PLUME_V4_DELIVERY.md) for the current scope, exact commands, evidence and limitations.

- Structured reasons and optional damage/separation limits; recipient asset ownership and consultation scope validated on the server. Text-only concerns remain supported.
- Constraints survive reconsultations until that recipient explicitly acknowledges; the earlier response history remains immutable. Adoption and revision never acknowledge on a recipient's behalf.
- Stored optimization runs are checked for organization, proposal, source revision, spacecraft parameters and adopted feasible coordinates. Filing recomputes damage and geometric limits; the transaction rejects registry or objection changes during that computation.
- Comparison includes per-equipment differences and constraint checks, initial/candidate/both/affected-equipment framing in 3D and 2D. Before/after previews leave saved drafts unchanged. Initial-site preview input is normalized to the strict coordinate API.
- Persisted-revision PDF and JSON decision dossiers distinguish frozen evidence from live coordination. New snapshots retain the filing organization and earlier consultation history. Participants receive only their permitted consultation history.
- Existing gateway now offers Experience a Landing and Enter Mission Control. A public arrival view uses the public registry; authentication precedes mission work. Five optional chapters share the same store, backend, mission library, assessments, optimizer and coordination. No second mission is created by navigation.
- Optional 13-step demo director stores navigation indices only in sessionStorage. It never files, responds, approves, switches identities or marks business operations complete.
- No new SQL migration is required beyond additive migrations 005 and 006 already present at the checkpoint. Historical snapshots use additive JSON fields.
