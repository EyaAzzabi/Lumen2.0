"""Reproducible local timings on temporary fixture data; not a hardware SLA."""

import copy, json, statistics, time
from pathlib import Path
from tempfile import TemporaryDirectory
from plume.store import Store, SEED
from plume.terrain import Terrain
from plume.physics import Lander
from plume.planner import assess, optimize
from plume.budget import computation


def measure(fn, repeats=3):
    values = []
    result = None
    for _ in range(repeats):
        start = time.perf_counter()
        result = fn()
        values.append((time.perf_counter() - start) * 1000)
    return {
        "median_ms": round(statistics.median(values), 2),
        "min_ms": round(min(values), 2),
        "max_ms": round(max(values), 2),
    }, result


def main():
    terrain = Terrain()
    lander = Lander(1800, 30)
    out = {}
    for n in (7, 70, 140):
        assets = []
        for i in range(n):
            a = copy.deepcopy(SEED["assets"][i % 7])
            a["id"] = str(i)
            a["x"] += i // 7 * 10
            assets.append(a)

        def calculate():
            with computation():
                return assess(terrain, lander, 50, 1500, -1500, assets)

        out["assessment_" + str(n) + "_assets"] = measure(calculate)[0]
    for strategy in ("baseline", "improved"):
        timing, r = measure(
            lambda: optimize(
                terrain,
                lander,
                50,
                1500,
                -1500,
                SEED["assets"],
                4000,
                2,
                8,
                300,
                strategy=strategy,
            )
        )
        out["optimizer_" + strategy] = {
            **timing,
            "objective_meur": r["best"]["summary"]["expected_loss_meur"]
            + r["best_traverse_meur"],
            "rescored": r["method"]["rescored"],
        }
    with TemporaryDirectory(prefix="plume-benchmark-") as tmp:
        store = Store(Path(tmp) / "state.json")
        out["sqlite_asset_transaction"] = measure(
            lambda: store.add_asset(
                {
                    "operator_id": "aurora",
                    "name": "Benchmark",
                    "type": "rover",
                    "x": 0,
                    "y": 0,
                    "value_meur": 1,
                }
            ),
            20,
        )[0]
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
