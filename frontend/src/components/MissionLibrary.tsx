import { useEffect, useState } from "react";
import { api, type MissionDraft } from "../api";
import { useMission, draftData, draftSignature } from "../mission";
import { Modal } from "./Commercial";

export function useDraftAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined,
      observed = "";
    const stop = useMission.subscribe((s) => {
      const next = draftSignature(draftData(s));
      if (next === observed) return;
      observed = next;
      clearTimeout(timer);
      if (
        !s.draftId ||
        !s.user ||
        s.draftStatus === "filed" ||
        s.draftStatus === "error" ||
        next === s.draftFingerprint
      )
        return;
      useMission.setState({ draftStatus: "local" });
      timer = setTimeout(() => void useMission.getState().saveDraft(), 700);
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, []);
}
export function DraftSaveControl() {
  const status = useMission((s) => s.draftStatus),
    error = useMission((s) => s.draftError),
    id = useMission((s) => s.draftId),
    allowed = useMission((s) => s.session?.permissions.includes("plans:write"));
  return (
    <div className="draft-save-control">
      <span role="status">
        {status === "saving"
          ? "Saving draft…"
          : status === "saved"
            ? "Draft saved to organization"
            : status === "filed"
              ? "Filed proposal · immutable draft"
              : status === "error"
                ? "Draft not saved"
                : id
                  ? "Unsaved changes"
                  : "Local draft · save to resume later"}
      </span>
      {status !== "filed" && allowed && (
        <button
          className="action-text"
          disabled={status === "saving"}
          onClick={() => void useMission.getState().saveDraft()}
        >
          {id ? "Save draft" : "Save new draft"}
        </button>
      )}
      {error && (
        <p role="alert">
          {error}
          {id && (
            <button
              className="action-text"
              onClick={() => void useMission.getState().openDraft(id)}
            >
              Reload saved version
            </button>
          )}
        </p>
      )}
    </div>
  );
}
export default function MissionLibrary() {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<MissionDraft[]>([]),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const epoch = useMission((s) => s.sessionEpoch),
    session = useMission((s) => s.session),
    plans = useMission((s) => s.plans);
  useEffect(() => {
    setOpen(false);
    setRows([]);
    setError("");
  }, [epoch]);
  async function refresh() {
    try {
      setRows(await api.drafts());
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (open) void refresh();
  }, [open]);
  async function run(fn: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <button className="library-launch" onClick={() => setOpen(true)}>
        Saved missions
      </button>
      {open && (
        <Modal title="Organization missions" onClose={() => setOpen(false)}>
          <p>
            Drafts belong to your organization. Filed plans keep their own
            immutable revision history.
          </p>
          {session?.permissions.includes("plans:write") && (
            <button
              className="action-primary full"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await useMission.getState().newDraft();
                  if (!useMission.getState().draftError) setOpen(false);
                })
              }
            >
              Create mission draft
            </button>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <div className="library-list">
            {rows.length === 0 && (
              <p>
                No saved drafts yet. Create one or save your current mission.
              </p>
            )}
            {rows.map((d) => (
              <section className="library-item" key={d.id}>
                <b>{d.data.name || "Untitled mission"}</b>
                <small>
                  {d.status} · v{d.version} · updated{" "}
                  {new Date(d.updated_at * 1000).toLocaleString()}
                </small>
                {d.status === "draft" && (
                  <>
                    <button
                      className="outline-button"
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await useMission.getState().openDraft(d.id);
                          if (!useMission.getState().draftError) setOpen(false);
                        })
                      }
                    >
                      Resume draft
                    </button>
                    {session?.permissions.includes("plans:write") && (
                      <button
                        className="action-text"
                        disabled={pending}
                        onClick={() =>
                          void run(async () => {
                            await api.archiveDraft(d.id, d.version);
                            if (useMission.getState().draftId === d.id)
                              useMission.setState({
                                draftId: null,
                                draftVersion: 0,
                                draftStatus: "local",
                              });
                          })
                        }
                      >
                        Archive draft
                      </button>
                    )}
                  </>
                )}
                {d.status === "archived" &&
                  session?.permissions.includes("plans:write") && (
                    <button
                      className="action-text"
                      disabled={pending}
                      onClick={() =>
                        void run(() => api.restoreDraft(d.id, d.version))
                      }
                    >
                      Restore draft
                    </button>
                  )}
                {d.filed_plan_id && (
                  <button
                    className="action-text"
                    onClick={() => {
                      useMission.setState({ focusPlanId: d.filed_plan_id });
                      useMission.getState().setMode("notices");
                      setOpen(false);
                    }}
                  >
                    View filed plan
                  </button>
                )}
              </section>
            ))}
            {plans
              .filter((p) => p.operator_id === session?.organization_id)
              .map((p) => (
                <section className="library-item" key={p.id}>
                  <b>{p.name}</b>
                  <small>
                    Filed · r{p.revision ?? 1} · {p.status}
                  </small>
                  <button
                    className="action-text"
                    onClick={() => {
                      useMission.setState({ focusPlanId: p.id });
                      useMission.getState().setMode("notices");
                      setOpen(false);
                    }}
                  >
                    Open plan history
                  </button>
                </section>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}
