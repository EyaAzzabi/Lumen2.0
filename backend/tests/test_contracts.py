"""Real backend contracts, independent of the rendering layer."""

import math
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from plume import api
from plume.store import Store
from plume.auth import Settings


class MissionContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = TemporaryDirectory(prefix="plume-contracts-")
        cls.previous_store = api.store
        api.store = Store(Path(cls.directory.name) / "state.json")
        cls.previous_settings = api.settings
        api.settings = Settings(environment="test", demo=True)
        cls.client = TestClient(
            api.app, base_url="http://localhost", client=("127.0.0.1", 50000)
        )
        cls.login("kestrel")
        cls.body = {
            "lander": {
                "label": "Super-heavy lander",
                "thrust_kn": 1800,
                "hover_s": 30,
                "dispersion_m": 50,
            },
            "site": {"x": 1500, "y": -1500},
        }

    @classmethod
    def login(cls, organization):
        r = cls.client.post("/api/session/demo", json={"operator_id": organization})
        assert r.status_code == 200, r.text
        cls.client.headers.update({"X-Plume-CSRF": r.json()["csrf_token"]})

    @classmethod
    def tearDownClass(cls):
        api.store = cls.previous_store
        api.settings = cls.previous_settings
        cls.client.close()
        cls.directory.cleanup()

    def test_mesh_matches_native_terrain_and_coordinate_orientation(self):
        grid = self.client.get("/api/terrain/mesh").json()
        self.assertEqual(grid["n"], 201)
        self.assertEqual(len(grid["elevations_m"]), grid["n"] ** 2)
        for row, column in [(0, 0), (200, 200), (100, 100), (35, 172)]:
            x = grid["x_min"] + column * grid["step_m"]
            y = grid["y_min"] + row * grid["step_m"]
            actual = self.client.get(
                "/api/terrain/point", params={"x": x, "y": y}
            ).json()
            self.assertAlmostEqual(
                grid["elevations_m"][row * grid["n"] + column],
                actual["elevation_m"],
                delta=0.0051,
            )

    def test_assessment_loss_reconciles_with_asset_results(self):
        response = self.client.post("/api/assess", json=self.body)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(len(result["assets"]), len(api.store.assets()))
        self.assertAlmostEqual(
            result["summary"]["expected_loss_meur"],
            sum(a["expected_loss_meur"] for a in result["assets"]),
        )
        self.assertEqual(result["summary"]["worst_risk"], "critical")
        self.assertTrue(all(0 <= a["damage_fraction"] <= 1 for a in result["assets"]))

    def test_footprint_is_a_spatial_damage_grid(self):
        f = self.client.post("/api/footprint", json=self.body).json()
        self.assertEqual(len(f["values"]), f["n"] ** 2)
        self.assertAlmostEqual((f["x_min"] + f["x_max"]) / 2, 1500)
        self.assertAlmostEqual((f["y_min"] + f["y_max"]) / 2, -1500)
        self.assertGreater(max(f["values"]), 0.15)
        self.assertTrue(all(0 <= value <= 1 for value in f["values"]))

    def test_optimizer_returns_feasible_candidates_with_honest_costs(self):
        result = self.client.post(
            "/api/optimize",
            json={
                **self.body,
                "search_radius_m": 4000,
                "traverse_meur_per_km": 2,
                "max_slope_deg": 8,
                "clearance_m": 300,
            },
        ).json()
        self.assertIsNotNone(result["best"])
        self.assertLess(
            result["best"]["summary"]["expected_loss_meur"],
            result["target"]["summary"]["expected_loss_meur"],
        )
        candidates = [result["best"]["site"], *result["alternatives"]]
        for c in candidates:
            self.assertLessEqual(c["slope_deg"], 8)
            self.assertLessEqual(math.hypot(c["x"] - 1500, c["y"] + 1500), 4000.001)
            self.assertTrue(
                all(
                    math.hypot(c["x"] - a["x"], c["y"] - a["y"]) >= 300
                    for a in api.store.assets()
                )
            )
        for c in result["alternatives"]:
            self.assertAlmostEqual(
                c["total_cost_meur"], c["expected_loss_meur"] + c["traverse_meur"]
            )

    def test_plan_notifications_and_responses_persist(self):
        self.login("kestrel")
        result = self.client.post(
            "/api/plans",
            headers={"Idempotency-Key": "contract-file-1"},
            json={
                **self.body,
                "operator_id": "kestrel",
                "name": "Contract test proposal",
                "window": "2040-03-14 06:00–08:00 UTC",
            },
        ).json()
        plan_id = result["plan"]["id"]
        notices = [
            n for n in self.client.get("/api/notices").json() if n["plan_id"] == plan_id
        ]
        self.assertEqual(len(notices), result["notices_sent"])
        self.assertGreater(len(notices), 0)
        n = notices[0]
        self.login(n["to_operator_id"])
        for status in ["objection", "acknowledged"]:
            response = self.client.patch(
                f"/api/notices/{n['id']}",
                headers={"Idempotency-Key": "contract-" + status},
                json={"status": status, "reply": "Recorded by contract test"},
            )
            self.assertEqual(response.status_code, 200)
            persisted = Store(api.store.path)
            self.assertEqual(
                next(i for i in persisted.notices() if i["id"] == n["id"])["status"],
                status,
            )
        self.assertEqual(
            next(p for p in api.store.plans() if p["id"] == plan_id)["status"],
            "coordinated",
        )

    def test_validation_rejects_unsupported_inputs(self):
        invalid = {**self.body, "lander": {**self.body["lander"], "thrust_kn": 5001}}
        self.assertEqual(self.client.post("/api/assess", json=invalid).status_code, 422)
        invalid = {**self.body, "site": {"x": 15001, "y": 0}}
        self.assertEqual(self.client.post("/api/assess", json=invalid).status_code, 422)

    def test_offline_briefing_identifies_its_source(self):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}):
            response = self.client.post("/api/copilot/brief", json=self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "template")
        self.assertTrue(response.json()["markdown"])


if __name__ == "__main__":
    unittest.main()
