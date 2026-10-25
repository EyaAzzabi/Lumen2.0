# Persistent workspace and objection resolution

## Implemented

- SQLite migration004 adds one draft per user and organization. GET/POST `/api/workspace/draft` use server identity and CSRF. A version precondition returns409 for stale tabs. Other members of the same organization cannot read the draft.
- Frontend restores saved inputs after session load, debounces writes, displays pending/saved/error status and flushes before explicit sign-out or local demo identity switching. Results are recalculated; they are not restored as current calculations. New mission explicitly replaces the working draft. One active draft per user is supported; filed proposals remain in plan history.
- An owner selects an actual current-revision objection and explicitly chooses a maximum mean modeled damage percentage for the registered affected assets. No language model guesses or approves the threshold.
- The optimizer evaluates a larger bounded shortlist when protection constraints are active and rejects candidates that exceed the limits after touchdown-dispersion assessment. Every returned alternative meets the supplied limits. No evaluated solution means no fallback recommendation, not proof of global infeasibility.
- Filing recalculates the assessment, checks limits, checks the source objection's visibility/plan/revision and requires explicit limits for every registered asset in it. Immutable revision inputs and plan protection evidence preserve the threshold, computed values and source notice. This does not acknowledge the revision automatically.
- History can export the authenticated organization's visible coordination evidence as JSON. The new report and analysis disclosure explain synthetic data, uncalibrated damage/economic scales and the nominal reference footprint, with a NASA background link.
- Corrected contextual briefing inputs after adopting an alternative: the briefing describes the current working site.

## Verification

Full existing backend suite plus initial workspace tests:36 passed. Expanded workspace subset:6 passed, including one additional source-objection authorization/revision test (37 distinct backend tests verified). Production build and TypeScript pass. Five focused browser scenarios pass: guided calculation/optimization/filing/mobile, failed calculation/retry, merged account auth, draft restore/stale-tab refusal, and two-operator objection/constraint/revision/acknowledgement/history export. Browser tests use an isolated temporary database; they do not mutate the saved registry.

The earlier dashboard browser tests still target removed controls and are not part of this focused run. See docs/JURY_DEMO.md for the five-minute demonstration and adoption hypotheses.

## Remaining external evidence

Experimental calibration, real lunar terrain import, real customer interviews and a verified competitive comparison are not completed. Supporting NASA research establishes the relevance of plume-surface hazards, not the accuracy of PLUME. Live LLM provider availability is not verified; deterministic/offline provenance remains explicit. Production identity/deployment remains closed under the existing configuration. No billing or external notification delivery was added.
