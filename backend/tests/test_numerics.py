import math, unittest
import numpy as np
from plume.damage import ASSET_TYPES, damage_fraction, assess_assets, landing_samples
from plume.physics import Lander, exposure
from plume.terrain import Terrain
from plume.planner import footprint


class Numerics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = Terrain()

    def test_scale_semantics(self):
        a = ASSET_TYPES["habitat"]
        f = {
            "energy_total": np.array([0.0, a.erosion_scale_j_m2]),
            "energy_coarse": np.zeros(2),
            "mass_dust": np.zeros(2),
            "mass_sand": np.zeros(2),
        }
        d = damage_fraction(a, f)
        self.assertEqual(d["total"][0], 0)
        self.assertAlmostEqual(d["erosion"][1], 1 - math.exp(-1))

    def test_determinism_and_boundary(self):
        a = [
            {"id": "a", "type": "solar_array", "x": 14000, "y": 14000, "value_meur": 2}
        ]
        x = assess_assets(self.t, Lander(15, 60), 2000, 15000, 15000, a)
        self.assertEqual(
            x, assess_assets(self.t, Lander(15, 60), 2000, 15000, 15000, a)
        )
        u = x[0]["uncertainty"]
        self.assertGreater(u["excluded_samples"], 0)
        self.assertTrue(
            0 <= u["q05"] <= u["q50"] <= u["q95"] <= u["worst_sample_damage"] <= 1
        )
        self.assertEqual(landing_samples(0, 0, 0)[2]["valid_samples"], 48)

    def test_exposure_and_angle_convergence(self):
        d = np.array([100.0, 500.0, 2000.0])
        xs = d[:, None] * np.linspace(0.02, 0.97, 80)
        f = exposure(
            Lander(15, 60), xs, np.zeros_like(xs), np.zeros(3), d, 5, n_theta=64
        )
        self.assertTrue(
            all(np.isfinite(v).all() and (v >= 0).all() for v in f.values())
        )
        g = exposure(
            Lander(15, 60), xs, np.zeros_like(xs), np.zeros(3), d, 5, n_theta=128
        )
        np.testing.assert_allclose(
            f["energy_total"], g["energy_total"], rtol=0.15, atol=0.1
        )
        doubled = exposure(
            Lander(15, 120), xs, np.zeros_like(xs), np.zeros(3), d, 5, n_theta=64
        )
        np.testing.assert_allclose(doubled["mass_total"], 2 * f["mass_total"])

    def test_footprint_metadata_and_edges(self):
        f = footprint(self.t, Lander(15, 60), 15000, 15000, n=12)
        self.assertFalse(f["metadata"]["dispersion_included"])
        self.assertIn(False, f["valid_mask"])
        self.assertTrue(all(0 <= x <= 1 for x in f["values"]))


if __name__ == "__main__":
    unittest.main()
