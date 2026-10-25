import { useMission } from "../mission";
export function DraftStatus() {
  const status = useMission((s) => s.draftStatus),
    error = useMission((s) => s.draftError),
    at = useMission((s) => s.draftSavedAt);
  return (
    <div className="draft-status" role="status">
      {status === "loading"
        ? "Loading your saved draft…"
        : status === "saving"
          ? "Saving draft…"
          : status === "saved"
            ? `Draft saved · ${at ? new Date(at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`
            : status === "error"
              ? "Draft is not saved"
              : "Your draft saves automatically"}
      {error && (
        <>
          <p>{error}</p>
          <button
            className="action-text"
            onClick={() => window.dispatchEvent(new Event("plume:save-draft"))}
          >
            Retry save
          </button>
          <button
            className="action-text"
            onClick={() => window.location.reload()}
          >
            Reload saved workspace
          </button>
        </>
      )}
    </div>
  );
}
export function ScientificEvidence() {
  const assessment = useMission((s) => s.assessment);
  return (
    <details className="journey-details scientific-evidence">
      <summary>Data, evidence & model limits</summary>
      <p>
        <b>Synthetic terrain and fictional infrastructure.</b> Monetary values
        and vulnerability scales are illustrative. These results support
        comparison inside this model; they are not measured losses or failure
        probabilities.
      </p>
      <p>
        The engine samples touchdown position. It does not model uncertainty in
        soil properties, engine geometry or material vulnerability. The map is a
        nominal solar-array reference, not an uncertainty envelope.
      </p>
      {assessment && (
        <p>
          Current assessment: {assessment.assets.length} assets ·{" "}
          {assessment.compute_ms.toFixed(0)} ms. Numerical tests check software
          consistency; experimental calibration has not been performed.
        </p>
      )}
      <a
        href="https://www.nasa.gov/directorates/stmd/plume-surface-interaction-psi/"
        target="_blank"
        rel="noreferrer"
      >
        NASA: plume–surface interaction research
      </a>
      <p>
        This reference supports the relevance of the problem. It does not
        validate PLUME's equations or values.
      </p>
      <button
        className="action-text"
        onClick={() => useMission.getState().setMode("method")}
      >
        Inspect equations & assumptions
      </button>
    </details>
  );
}
