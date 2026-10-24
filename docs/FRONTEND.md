# PLUME spatial mission control

This frontend retains the existing FastAPI simulation, optimizer, shared registry and consultation persistence. It adds a local 3D mission workspace and an explicitly illustrative commercial/demo layer. It does not add secure authentication or active subscriptions.

## Run

Use Python 3.11+ and Node 20.19+ (validated here with Python 3.13 and Node 24). Install the existing Python requirements and run:

```powershell
cd backend
python -m uvicorn plume.api:app --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the Vite URL. If the defaults are occupied, use the validated alternative ports:

```powershell
# backend terminal
python -m uvicorn plume.api:app --host 127.0.0.1 --port 8001

# frontend terminal
$env:PLUME_API_TARGET = 'http://127.0.0.1:8001'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Production/local presentation: build with `npm run build` in `frontend`, then start/restart the backend. Its existing static-file handling serves `frontend/dist` on the backend URL. No remote image or font requests are required at runtime. The Moon texture and fonts are bundled locally.

## Navigation and actual capabilities

- Gateway: textured 3D Moon, official supplied mark, direct mission entry, pricing and demo access.
- Mission setup: backend-supported thrust (kN), hover (s), dispersion (m), and local east/north coordinates (m). Mission name/window are used when filing. No invented mass or descent-speed input.
- Operations: persistent terrain scene, actual assessment summary, asset exposure, shared infrastructure, registered organization/plan/action counts, layers and camera views.
- Placement: choose Reposition, then click terrain. Escape cancels. Keyboard users can edit east/north fields in Mission setup.
- Simulation/replay: real assessment and footprint with visual descent/particles; play, pause, seek, restart, speed, skip and perspectives. Animation is **not** time-resolved physics. Reduced motion disables autoplay and retains scrubbing.
- Optimizer: submits actual search radius, traverse cost, slope and clearance constraints. Candidate costs and locations come from the backend. The scene colors shortlisted candidates by relative modeled loss, not a probability. Selection keeps the comparison origin and recomputes current assessment/footprint.
- Registry: owner/type/local north-south filters apply to the 3D scene. Select installations; inspect ownership, coordinates, value, current draft exposure and nearby filed plans. Register assets or remove owned demo assets through the existing API. No asset criticality is invented.
- Coordination: context-specific inbox/sent records and owned plans. Inspect a saved proposal on the map, record an acknowledgement or objection, and reload to verify persistence.
- Report: current assessed inputs, assessment timestamp, original/candidate comparison where available, all registered-asset exposure, briefing source and limitations. Print / Save as PDF uses the browser print dialog and a dedicated print layout.
- Commercial pages: the four requested indicative tiers, informative access dialogs, enterprise SSO concept, functional demo organization entry and demo subscription information. No payment, email intake, authentication token, password validation or artificial paywall.

## Coordination demo

The Demo mode button explicitly loads the default super-heavy Kestrel training scenario. Each guided step requires a click and uses the real backend:

1. Inspect shared infrastructure as Kestrel.
2. Simulate and review modeled exposure.
3. Prepare and file the original proposal.
4. Switch to an affected operator from the actual returned notice records.
5. Record an objection through PATCH /api/notices/{id}.
6. Return to Kestrel and run the optimizer.
7. Adopt its best feasible candidate and review the new assessment.
8. File the revised draft as a **new** proposal.
9. Review the persisted response history.

The backend has no plan update, amendment linkage, notification read receipt or resolution endpoint. Acknowledging every notice does not change its plan's saved `consultation` status. The interface reports this instead of inventing a resolved state. In-app notice creation is not external delivery. The demo selector is not authorization.

## Architecture

- `src/mission.ts`: typed Zustand mission/domain state, request snapshots, stale-response rejection, organization context and replay state.
- `src/api.ts`: existing typed API wrapper, plus the terrain mesh contract.
- `src/scene/LunarScene.tsx`: persistent renderer, terrain/footprint geometry, cameras, asset selection, candidate overlays, particles and fallback.
- `src/scene/Models.tsx`: purpose-built illustrative vehicle/infrastructure geometry.
- `src/components`: gateway, configuration, operations, replay, optimizer, report, shared registry, coordination and commercial UI.
- `src/mission.css`, `src/platform.css`: visual system, responsive layouts, reduced motion and print presentation.
- Existing `Method.tsx` remains available, and `MapView.tsx` supplies the 2D graphics fallback.

Metres east/north become Three.js kilometres at `(east/1000, elevation/1000, -north/1000)`. Terrain mesh heights come from a new **read-only** GET /api/terrain/mesh endpoint sampling the same Terrain instance at 150 m. The native 50 m model and algorithms remain unchanged. Footprint grid rows run south to north. The reference solar-array grid is distinct from per-asset damage averaged over landing dispersion.

Models/symbols are enlarged for readability. Camera-aware scale indicates an eastward interval at the landing site. Hillshade, terrain elevations and resource/model values are synthetic. No actual lunar topography, validated CFD, official approval or flight certification is implied.

## Verification

Backend contracts use an isolated temporary registry:

```powershell
cd backend
pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

Browser checks use the built frontend and an isolated **real** backend:

```powershell
# Build first, then start the isolated server in a separate terminal.
cd frontend
npm run build

cd ../backend
python serve_test.py

# Another terminal:
cd frontend
npm run test:e2e
```

Playwright uses Chromium; install it if absent with `npx playwright install chromium`. Test URL defaults to `http://127.0.0.1:8002` and can be changed with `PLUME_TEST_URL`. Tests operate on temporary data owned by `serve_test.py`; the project's saved registry is preserved.

Screenshots, a generated PDF, test results and traces are local ignored artifacts. The desktop viewport is 1920×1080. Browser tests include real optimization/adoption, replay, report/PDF, persisted operator responses, registry changes, commercial disclosures, WebGL failure, reduced motion, mobile overflow and API failure.

## Remaining production work

Organization SSO, authorization, tenant isolation, immutable audits, billing, intake/CRM, plan amendment and formal resolution are not implemented by this backend. Neither the tier labels nor context selector provide those capabilities. Real DEM/CAD assets, validated physical models and representative hardware performance measurements are separate future work.
