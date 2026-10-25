import unittest, time
from plume import planner
from plume.physics import Lander
from plume.terrain import Terrain
from plume.store import SEED


class OptimizerRegression(unittest.TestCase):
    def test_quality_diversity_repeatability_and_budget(self):
        args = (
            Terrain(),
            Lander(1800, 30),
            50,
            1500,
            -1500,
            SEED["assets"],
            4000,
            2,
            8,
            300,
        )
        a = planner.optimize(*args, strategy="baseline")
        b = planner.optimize(*args)
        c = planner.optimize(*args)
        score = (
            lambda r: r["best"]["summary"]["expected_loss_meur"]
            + r["best_traverse_meur"]
        )
        self.assertLessEqual(score(b), score(a) + 1e-9)
        self.assertAlmostEqual(score(b), score(c))
        self.assertEqual(b["best"]["site"], c["best"]["site"])
        self.assertLess(b["compute_ms"], max(10000, a["compute_ms"] * 3))
        self.assertEqual(a["search"]["candidates"], 1793)
        points = [b["best_explanation"], *b["alternatives"]]
        import math

        for i, p in enumerate(points):
            self.assertLessEqual(p["slope_deg"], 8)
            self.assertGreaterEqual(p["nearest_asset_m"], 300)
            self.assertAlmostEqual(
                p["total_cost_meur"], p["expected_loss_meur"] + p["traverse_meur"]
            )
            for q in points[:i]:
                self.assertGreaterEqual(
                    math.hypot(p["x"] - q["x"], p["y"] - q["y"]), 250
                )


if __name__ == "__main__":
    unittest.main()
