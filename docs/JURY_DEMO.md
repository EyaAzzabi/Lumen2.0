# PLUME: jury demonstration and evidence

## Five-minute product story

- 0:00–0:40: Explain the future scenario: independent operators share a lunar neighborhood. A landing can expose a neighbor's equipment to ejecta. The user is a mission planner coordinating with infrastructure owners.
- 0:40–1:00: Explain PLUME's contribution: one workflow connecting modeled exposure, site comparison and explicit consultations. Do not claim to be the first product without a documented comparison.
- 1:00–2:00: Use two separate browser sessions, signed in as distinct operators. Create a named mission with actual parameters, calculate, inspect the most affected asset. Explain that geometry, asset values and vulnerability scales are illustrative.
- 2:00–3:00: File the proposal. In the neighbor's session, read the consultation and raise a reasoned objection. In the planner's session, choose the objection and explicitly enter an agreed damage threshold.
- 3:00–4:00: Apply constraints, calculate alternatives, inspect loss plus relocation cost, preview, adopt and submit a revision. The server checks limits again. Acknowledge the new revision from the neighbor's session. Silence never equals agreement.
- 4:00–4:30: Reload, show persisted state, revision history, original objection and exported coordination evidence.
- 4:30–5:00: State limitations and adoption hypothesis. Invite questions about the numerical engine, sampling, objective, identity boundaries and immutable history.

## Reproducible synthetic scenario

Explicitly enter super-heavy lander, 1800 kN, 30 s hover, 50 m dispersion, E1500/N-1500. Search radius4000 m, slope8 degrees, clearance300 m and relocation2 M€/km. The seeded telescope is the main affected asset. A3% mean modeled damage constraint has feasible evaluated alternatives on this seed. Confirm by running the current model; do not display prewritten risk numbers as if freshly computed. Use the isolated backend/serve_test.py for rehearsals to avoid polluting the saved registry.

## Product and adoption hypotheses to validate

Primary user: landing mission planner. Participating user: infrastructure operations owner. Potential buyer: mission operator seeking a traceable coordination process. Proposed first offer: pilot access per organization or mission, with shared infrastructure registration and revision evidence. These are hypotheses, not signed customers, validated willingness to pay or live billing. Test them with mission-planning or space-systems practitioners; record feedback honestly.

A useful comparison matrix should examine existing plume-analysis tools, mission-planning tools and coordination workflows on: exposure assessment, site tradeoffs, shared ownership, explicit objections, revision history and interoperability. No market-leading or unique-product claim is currently supported by such a study.

## Scientific evidence and boundaries

NASA's Plume Surface Interaction research documents the relevance of erosion and ejected particles: https://www.nasa.gov/directorates/stmd/plume-surface-interaction-psi/ . This is background support, not calibration of PLUME. Existing numerical tests cover zero exposure, scale semantics, touchdown sampling, convergence, monotonic hover scaling and footprint masks. Software consistency is not experimental accuracy.

PLUME currently has procedural terrain, fictional assets and illustrative vulnerability/economic scales. There is no experimental calibration dataset. A real-terrain import must preserve projection, units, resolution, missing-data masks and geographic/local coordinate conversion; a decorative lunar image is not such an import. Calibration requires a documented measurement set and an independent evaluation split. Neither should be fabricated for a hackathon.

The new protection constraints apply to mean modeled damage over touchdown samples. They are not maximum damage bounds, failure probabilities or flight clearance. The constrained search evaluates a bounded shortlist; finding no candidate is not proof that no feasible site exists. Parameter uncertainty and physical model error remain unmodeled.

## Rehearsal checks

Use distinct browser contexts for identities. Confirm reload/resume, a failed analysis and retry, an impossible constraint with no unsafe fallback, owner-only revision, a stale draft tab producing409, and an explicit acknowledgement on the current revision. The local product supports real password accounts; production identity/deployment configuration remains deliberately closed. No billing or external notification delivery is claimed.
