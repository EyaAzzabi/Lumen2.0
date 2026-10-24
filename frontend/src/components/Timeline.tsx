import { useMission, phaseAt, REPLAY_DURATION } from "../mission";
import { Icon } from "./Icon";
const phases = [
  ["Approach", 0],
  ["Ignition", 4],
  ["Descent", 7],
  ["Touchdown", 12],
  ["Dispersion", 15],
  ["Assessment", 21],
] as const;
export default function Timeline() {
  const replay = useMission((s) => s.replay),
    playing = useMission((s) => s.playing),
    speed = useMission((s) => s.speed),
    assessment = useMission((s) => s.assessment),
    reduced = useMission((s) => s.reducedMotion);
  return (
    <section
      className="timeline-panel"
      aria-label="Illustrative replay controls"
    >
      <div className="timeline-heading">
        <span>
          <span className="status-dot" /> {phaseAt(replay).toUpperCase()}
        </span>
        <small>ILLUSTRATIVE REPLAY · NOT TIME-RESOLVED PHYSICS</small>
        <span className="timeline-time">
          T+{replay.toFixed(1).padStart(4, "0")} <em>/ 24.0 s</em>
        </span>
      </div>
      <div className="timeline-controls">
        <button
          className="play-button"
          aria-label={playing ? "Pause replay" : "Play replay"}
          disabled={!assessment || reduced}
          onClick={() =>
            useMission.setState({
              playing: !playing,
              replay: replay >= REPLAY_DURATION ? 0 : replay,
            })
          }
        >
          <Icon name={playing ? "Pause" : "Play"} size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Restart replay"
          disabled={!assessment}
          onClick={() => useMission.setState({ replay: 0, playing: false })}
        >
          <Icon name="RotateCcw" size={16} />
        </button>
        <div className="timeline-track">
          <input
            aria-label="Replay time"
            type="range"
            min={0}
            max={REPLAY_DURATION}
            step={0.1}
            value={replay}
            disabled={!assessment}
            onChange={(e) =>
              useMission.setState({ replay: +e.target.value, playing: false })
            }
          />
          <div className="phase-labels">
            {phases.map(([name, t]) => (
              <button
                key={name}
                className={replay >= t ? "passed" : ""}
                onClick={() =>
                  useMission.setState({ replay: t, playing: false })
                }
                disabled={!assessment}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <label className="speed-control">
          <span className="sr-only">Playback speed</span>
          <select
            value={speed}
            onChange={(e) => useMission.setState({ speed: +e.target.value })}
          >
            {[0.5, 1, 2, 4].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button"
          aria-label="Skip to assessment"
          disabled={!assessment}
          onClick={() =>
            useMission.setState({ replay: REPLAY_DURATION, playing: false })
          }
        >
          <Icon name="SkipForward" size={17} />
        </button>
      </div>
      {reduced && (
        <small className="reduced-note">
          Reduced motion enabled. Scrub to inspect each phase.
        </small>
      )}
    </section>
  );
}
