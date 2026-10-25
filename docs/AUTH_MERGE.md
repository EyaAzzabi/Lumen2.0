# Integration of Eya authentication and PLUME V2

Merged branches: `codex/plume-v2` and `feature/auth-and-template-ui` (Eya commit
`e641b8e`). This document supersedes the V2 statement that password accounts do
not exist. Production identity/deployment is still deliberately disabled.

## Conflict resolution

- Keep the V2 transactional repository, immutable revisions, full assessments,
  permission checks, CSRF, static containment and removal of public reset.
- Integrate Eya's PBKDF2-SHA256 password functions, signup/login/logout routes,
  new organization and invitation membership flows into SQLite (migration003).
- Keep Eya's Auth, Chrome and template stylesheet, including password visibility,
  create/join forms, demo sign-in buttons, account menu, admin invite code, asset
  search and notification bell. Preserve the cinematic 3D map and hangar.
- Add Eya's A/B/C comparison as an expandable view alongside the V2 objective and
  diversity cards. Add her per-candidate severity/damage/count fields to BOTH
  grid shortlist and locally refined results. Labels say best evaluated, not a
  mathematically proven optimum.
- Reconcile notice refresh with the existing ten-second V2 refresh and revision
  history. Real accounts are not shown an organization impersonation selector.

## Authentication behavior

Users explicitly sign in or create an account. The frontend no longer silently
creates a Kestrel demo identity. A new organization gives organization_admin;
joining by invitation gives mission_operator, asset_manager and reviewer rights.
Organization identity always comes from the authenticated server session.

Eya's seven-day session lifetime and salted PBKDF2 hashes are retained. Sessions
use the existing HttpOnly SameSite cookie and CSRF header instead of storing a
bearer token in localStorage. Only token digests are persisted. Signup/login are
currently direct-loopback development operations; production continues to fail
closed. This is local password authentication, not production SSO or email
verification/password recovery.

Demo credentials are available only with PLUME_DEMO_AUTH=true AND a loopback
request. Only the six original fictional organizations receive published demo
accounts. Real organizations never receive a published password. They are not
reachable through the demo switch. The legacy local /api/session/demo endpoint
remains gated for compatibility; the UI's demo switching performs Eya account
sign-in. Failed logins are throttled (ten per minute per peer/email); successful
login clears that failure counter. No password hashes or invite codes are exposed
by the shared registry. Only an organization admin sees its invitation code.

Existing API routes retain the V2 permission, ownership and idempotency checks.
New `/api/auth/signup`, `/login`, `/me`, `/logout`, `/demo-accounts` routes use the
Eya endpoint names. Responses include V2 session/permission metadata plus the
sanitized `user` and `organization`. No raw session token is returned to JS.

## Persistence and rollback

Migration003 adds accounts, organization_invites, organization_names and
login_attempts. No existing user, organization, asset, plan, notice, event or
assessment is deleted. Existing V2 demo identities remain valid for compatibility.
A pre-merge online SQLite backup was made in backend/data/runtime. The original
JSON and the previous verified migration backup remain untouched and ignored by
Git. Eya account data from a separate machine/database was not supplied. If a local
legacy JSON contains Eya users/sessions, the importer now preserves their IDs,
password hashes, memberships, invitations and session digests transactionally;
full original payloads are archived privately and byte-backed-up. Existing
bearer clients must sign in again for the cookie transport. This pathway is
tested; remote credentials are neither fetched nor invented.

## Verification

Backend and browser outcomes are appended after the final integration run.
No production deployment or external credentials are needed for these checks.

Verified: 31 backend tests passed, then the 4 account tests and 7 API contracts
passed again after protecting the briefing route. The browser signup/create-org,
logout, password login, reload and invitation/member flow passed in 17.2s (focused
account verification uses the supported 2D fallback; cinematic coverage remains
separate). Existing mission, registry, consultation, mobile and stale-response
checks were also rerun. The first browser pass exposed obsolete fixture assumptions
about automatic demo identity, and computation-capacity retries are now bounded
for calculation routes only; state-changing operations are not blindly retried.
Final browser verification: 9 existing scenarios passed in the full rerun; the
account scenario passed separately after awaiting completed logout before testing
the protected-route redirect. All 10 distinct browser scenarios are validated.
No scientific validation or production identity-provider claim is implied.
