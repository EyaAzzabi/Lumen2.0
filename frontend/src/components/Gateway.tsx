import { useMission } from "../mission";
import { Icon } from "./Icon";

export default function Gateway() {
  const connected = useMission((s) => s.connected),
    loadError = useMission((s) => s.loadError);
  const enter = () => useMission.getState().setMode("operations");
  return (
    <div className="gateway">
      <div className="gateway-orbit-label">
        <span className="tiny-cross">+</span>LUNAR SOUTH POLE
        <small>OUR NEXT SHARED FRONTIER</small>
      </div>
      <section className="gateway-copy">
        <div className="eyeline">
          <span />A SHARED FRONTIER. A SHARED RESPONSIBILITY.
        </div>
        <h1>
          One Landing.
          <br />
          <span>
            Everyone’s
            <br />
            Safety.
          </span>
        </h1>
        <p>
          AI-powered risk intelligence for the next
          <br className="desktop-break" /> generation of lunar exploration.
        </p>
        <div className="gateway-actions">
          <button
            className="action-primary"
            onClick={enter}
            disabled={!connected}
          >
            ENTER MISSION CONTROL <Icon name="ArrowRight" size={17} />
          </button>
          <button
            className="action-text"
            onClick={() => useMission.getState().setMode("method")}
          >
            EXPLORE THE MISSION <Icon name="ChevronRight" size={15} />
          </button>
        </div>
        {loadError && (
          <div className="inline-error" role="alert">
            {loadError}
            <button onClick={() => void useMission.getState().load()}>
              Retry connection
            </button>
          </div>
        )}
        <div className="gateway-sequence">
          <span>
            01 <b>ASSESS</b>
          </span>
          <i />
          <span>
            02 <b>OPTIMIZE</b>
          </span>
          <i />
          <span>
            03 <b>COORDINATE</b>
          </span>
        </div>
      </section>
      <div className="orbital-coordinates">
        <span className="tiny-cross">+</span>
        <div>
          EVERY LANDING LEAVES A FOOTPRINT.
          <br />
          <strong>MAKE YOURS A SAFER ONE.</strong>
        </div>
      </div>
      <div className="gateway-bottom">
        <div>
          <span className="status-dot" />{" "}
          {connected
            ? "MISSION SYSTEMS CONNECTED"
            : "CONNECTING TO MISSION SYSTEMS"}
        </div>
        <span>EXPLORATION SCENARIO / 2040</span>
        <button onClick={enter} disabled={!connected}>
          BEGIN EXPLORATION <Icon name="ArrowRight" size={15} />
        </button>
      </div>
    </div>
  );
}
