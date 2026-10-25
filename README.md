# PLUME — Lunar Landing Coordination

*One landing. Everyone's safety.* — IEEE Lumen 2.0 · Beyond 2030

PLUME is an illustrative multi-operator lunar coordination prototype. A simplified
ballistic ejecta model estimates damage to shared fictional infrastructure; a
constrained optimizer compares sites. Operators can file, object, revise,
reconsult and coordinate a plan with immutable assessment and response history.
No flight clearance, experimentally validated accuracy or trained ML is claimed.

## Run locally

Python 3.11+ and Node20+:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:PLUME_DEMO_AUTH='true'
.\.venv\Scripts\python.exe -m uvicorn plume.api:app --host 127.0.0.1 --port 8001
```

In another terminal:

```powershell
cd frontend
npm ci
$env:PLUME_API_TARGET='http://127.0.0.1:8001'
npm run dev -- --host localhost --port 5174 --strictPort
```

Open http://localhost:5174. Without PLUME_DEMO_AUTH=true no demo identity is
available. Demo sessions are direct-loopback only and server-authorized; they are
not production SSO. PLUME_ENV=production refuses startup until a real identity
provider adapter exists. Do not expose the local demo through a public proxy.

The first V2 startup safely imports state.json into transactional SQLite after
validating a temporary copy and backing up the source. Original JSON, IDs and
history are preserved. No public reset endpoint exists.

## Documentation

- [V2 engineering guide](docs/PLUME_V2.md): architecture, API inventory, data model,
  migration/rollback, identity, state machine, assumptions, benchmarks and demo.
- [Frontend guide](docs/FRONTEND.md): cinematic Three.js UI and integration.
- [Verification log](docs/VERIFICATION.md): actual checks and limitations.

## Reproducible example

Seed terrain7; superheavy1800kN/30s/50m; E1500/N-1500; radius4km, cost2M€/km,
slope8 degrees, clearance300m. Baseline modeled infrastructure loss:14.458010383M€.
Original optimizer objective:6.783381280M€. V2 objective:6.587186951M€, comprising
2.312657160M€ damage plus relocation cost. These are model outputs on fictional
values, not validated real-world economic predictions. Timings and method are in
the engineering guide.

Optional Anthropic briefing uses ANTHROPIC_API_KEY and PLUME_LLM_MODEL. Without a
credential, a labeled deterministic template works immediately offline. The
numerical engine never depends on an LLM. No trained surrogate is implemented.

## One-command Windows startup

From the repository root, run `./start-plume.ps1`. It launches missing local
services in hidden independent processes, reuses healthy services, checks the
backend proxy, and opens http://127.0.0.1:5174/#gateway. Use `-NoBrowser` to keep
the browser unchanged. Logs and process IDs are in `backend/data/runtime/`
(ignored by Git). Dependencies must already be installed as described above.
Node starts Vite directly so closing an npm terminal is unnecessary.

## Merged account authentication

The `feature/auth-and-template-ui` account flows are integrated with V2 SQLite
and permission checks. Open Log in to sign in, create an organization or join via
an invitation. Accounts persist; passwords use Eya's salted PBKDF2-SHA256 helper.
Sessions use HttpOnly cookies and CSRF rather than browser localStorage tokens.
The six published demo accounts remain opt-in and loopback-only. There is no
silent Kestrel sign-in. See [merge notes](docs/AUTH_MERGE.md) for the exact conflict
resolutions and deployment limits. Existing V2 production fail-closed rules stay.
