# PLUME spatial frontend implementation

## Inspection

The checkout uses React 18.3, TypeScript, Vite 5 and a Python FastAPI backend with NumPy/SciPy physics. There are no repository AGENTS.md instructions. Official branding is `docs/plume_logo.jpg`, mirrored in `frontend/public/plume-logo.jpg`; `plume-mark.png` is the existing small brand asset. No terrain textures or spacecraft models are bundled.

## API contracts

| Capability | Existing route and fields | Frontend use |
|---|---|---|
| Reference data | GET /api/meta | Landers, dimensions, asset types |
| Registry | GET /api/operators, GET/POST/DELETE /api/assets | Shared fictional infrastructure and existing management UI |
| Terrain | GET /api/terrain/hillshade.png, GET /api/terrain/point?x=&y= | Surface texture, point inspection |
| Assessment | POST /api/assess {lander:{label,thrust_kn,hover_s,dispersion_m},site:{x,y}} | Actual damage fractions, modeled loss, shielding, slope |
| Footprint | POST /api/footprint, same body | Reference solar-array damage grid, south-to-north row order |
| Optimization | POST /api/optimize, same body plus search_radius_m, traverse_meur_per_km, max_slope_deg, clearance_m | Actual best site, alternatives, search points, costs and constraints |
| Briefing | POST /api/copilot/brief, optional optimized_site | Existing Claude or explicitly labeled template output |
| Coordination | POST /api/plans; GET/PATCH /api/notices | Preserve filing and replies; no external email is sent |
| Model documentation | GET /api/curves | Preserve Method screen |

Add one read-only `/api/terrain/mesh` route sampling the same Terrain instance at 150 m intervals. This changes no model or optimization algorithm. Metres east/north map to Three.js kilometres (x, -z); elevation becomes y. Do not derive terrain height from hillshade brightness.

## Architecture and sequence

1. Preserve React 18 and existing registry/notices/method. Use React Three Fiber 8 with compatible Drei, Three.js, Zustand, local fonts and Lucide icons. Avoid extra animation/UI frameworks where CSS and useFrame suffice.
2. Typed shared mission state owns parameters, site, assessment snapshots, footprint, optimization origin/candidates, playback and layer flags. Reject stale asynchronous results after mission edits. Keep optimizer comparison available when adopting a candidate.
3. Persistent lazy-loaded scene: textured orbital Moon gateway, backend-derived terrain, purpose-built fictional lander/infrastructure meshes, labels, selectable assets, editable site, orbit/overview/close cameras, reduced-motion and graphics modes.
4. Assess and footprint requests run against the real backend. Footprint colors represent reference solar-array modeled damage, not a probability. Playback animates only presentation; final metrics remain backend outputs.
5. Optimizer uses real candidate loss and traverse costs. Selecting an alternative triggers a new assessment/footprint. Show both origin and adopted site.
6. Replay supports seek/play/pause/restart/speed and camera selection. Report uses current assessed parameters, original comparison, exposed assets and limitations. Print stylesheet supports browser Save as PDF.
7. Preserve consultation and registry workflows. Add user-visible network errors and retry. WebGL failure uses a labeled 2D operational map, retaining real APIs.
8. Run backend contract/regression checks, frontend type/build, and Playwright at 1920x1080. Review gateway, terrain, simulation, optimizer, replay, report, mobile layout, reduced motion and fallback screenshots. Record limitations honestly.

## Scientific and visual boundaries

Terrain/organizations/assets/values are synthetic demo data. Spacecraft and asset geometry are illustrative, with readable spatial scale cues; not engineering CAD. No invented risk probabilities or unsupported physical inputs. No time-resolved physical predictions: descent and particles are illustrative replay. No NASA approval, certification, authenticated operator identity or production security claims. Hosting, Git commits and pushing are outside this local frontend task.

## References consulted

- https://r3f.docs.pmnd.rs/getting-started/installation (Fiber 8 pairs with React 18)
- https://drei.docs.pmnd.rs/controls/introduction (camera control lifecycle)
- https://threejs.org/examples/ (terrain/planet rendering techniques)
- https://science.nasa.gov/3d-resources/ (asset reference; no NASA affiliation implied)

No additional image mockup is needed: build the visual directly in the interactive 3D scene.

## Collaboration and commercial scope update

The shared registry, owned-asset filters, organization context, persisted notices and responses are core product workflows. Add an immersive registry with owner/type/local-region filters, a coordination center with actual response status and a two-operator guided demo. Counts derive from GET /api/plans, /api/operators, /api/assets and context-specific /api/notices. "Registered organizations" is used instead of claiming organizations are online/active.

No backend authentication, billing, plan amendment, linkage or consultation-resolution route exists. Clearly label organization switching and subscription tiers as demo configuration. The pricing page uses the supplied indicative prices, native informational dialogs, and no checkout. Enterprise SSO is a non-authenticating concept with a demo entry action. Revised proposals are new backend plan records; they do not amend originals or resolve objections. Preserve this distinction in the timeline, demo and report.

The local validation ports are 5174 (frontend) and 8001 (backend), because other applications already occupy the default ports. `PLUME_API_TARGET` overrides the Vite development proxy only.
