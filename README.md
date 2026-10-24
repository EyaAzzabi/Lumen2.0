# PLUME — Lunar Landing Coordination

*One landing. Everyone's safety.* — IEEE Lumen 2.0 · Beyond 2030

Every lunar landing blasts regolith outward at up to ~1.7 km/s; with no atmosphere, debris travels kilometres.
As several operators crowd the lunar south pole, one operator's touchdown can damage another's solar arrays,
telescopes or habitats. PLUME is a multi-operator SaaS that predicts each landing's ejecta footprint, prices the
damage to every registered asset, finds a safer touchdown site and sends formal consultation notices
(Artemis Accords §11, harmful interference) to affected operators.

## Run

Backend (Python 3.11):

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn plume.api:app --port 8000
```

Frontend (Node 20+), dev mode with hot reload (proxies `/api` to port 8000):

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Demo mode: `npm run build` in `frontend/`, then the backend serves the built app at http://127.0.0.1:8000.

Optional: set `ANTHROPIC_API_KEY` before starting the backend to have the copilot briefing written by Claude.
Without it, a deterministic template is used and everything else works offline.

## Architecture

| Module | Role |
|---|---|
| `backend/plume/terrain.py` | Synthetic south-pole heightmap (demo data), elevation/slope lookup, terrain profiles, hillshade |
| `backend/plume/physics.py` | Ejecta model: erosion ∝ thrust × hover, 4 grain classes, ballistic arcs in lunar gravity, terrain blocking |
| `backend/plume/damage.py` | Erosion / impact / dust-coating damage per asset type, averaged over landing dispersion |
| `backend/plume/planner.py` | Footprint heat map, risk assessment, two-stage landing-site optimiser |
| `backend/plume/copilot.py` | Claude briefing (explains physics numbers, never computes them) + consultation notices |
| `backend/plume/store.py` | JSON registry: operators, assets, landing plans, notices (fictional demo data) |
| `backend/plume/api.py` | FastAPI endpoints |
| `frontend/src` | React app: Mission Planner (map), Notices, Registry, Method |

## Demo script

1. Mission Planner → super-heavy lander at the default site: FLO Optical Telescope is **critical** (~€14M expected loss).
2. *Optimise touchdown site* → ~1,800 candidates screened, loss drops to ~€0.02M; *Adopt optimised site*.
3. *Generate* the copilot briefing, then *File plan & notify affected operators*.
4. Switch "Acting as" to Far Light Observatory → Notices → acknowledge or object.

## Limitations

Simplified, calibrated plume model (not CFD/DSMC); flat-Moon ballistics; engineering-estimate damage sensitivities;
synthetic terrain. All organisations, assets and values are fictional.
