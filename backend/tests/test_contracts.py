"""Real backend contracts, independent of the rendering layer."""
import math
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from plume import api, auth
from plume.store import Store


class MissionContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = TemporaryDirectory(prefix="plume-contracts-")
        cls.previous_store = api.store
        api.store = Store(Path(cls.directory.name) / "state.json")
        cls.client = TestClient(api.app)
        cls.client.headers["Authorization"] = "Bearer " + cls.login("kestrel")
        cls.body = {"lander": {"label": "Super-heavy lander", "thrust_kn": 1800, "hover_s": 30,
                              "dispersion_m": 50}, "site": {"x": 1500, "y": -1500}}

    @classmethod
    def login(cls, operator_id):
        r = cls.client.post("/api/auth/login", json={"email": f"{operator_id}@plume.demo", "password": auth.DEMO_PASSWORD})
        assert r.status_code == 200, r.text
        return r.json()["token"]

    @classmethod
    def tearDownClass(cls):
        api.store = cls.previous_store
        cls.client.close()
        cls.directory.cleanup()

    def test_mesh_matches_native_terrain_and_coordinate_orientation(self):
        grid = self.client.get("/api/terrain/mesh").json()
        self.assertEqual(grid["n"], 201)
        self.assertEqual(len(grid["elevations_m"]), grid["n"] ** 2)
        for row, column in [(0, 0), (200, 200), (100, 100), (35, 172)]:
            x = grid["x_min"] + column * grid["step_m"]
            y = grid["y_min"] + row * grid["step_m"]
            actual = self.client.get("/api/terrain/point", params={"x": x, "y": y}).json()
            self.assertAlmostEqual(grid["elevations_m"][row * grid["n"] + column], actual["elevation_m"], delta=.0051)

    def test_assessment_loss_reconciles_with_asset_results(self):
        response = self.client.post("/api/assess", json=self.body)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(len(result["assets"]), len(api.store.assets()))
        self.assertAlmostEqual(result["summary"]["expected_loss_meur"], sum(a["expected_loss_meur"] for a in result["assets"]))
        self.assertEqual(result["summary"]["worst_risk"], "critical")
        self.assertTrue(all(0 <= a["damage_fraction"] <= 1 for a in result["assets"]))

    def test_footprint_is_a_spatial_damage_grid(self):
        f = self.client.post("/api/footprint", json=self.body).json()
        self.assertEqual(len(f["values"]), f["n"] ** 2)
        self.assertAlmostEqual((f["x_min"] + f["x_max"]) / 2, 1500)
        self.assertAlmostEqual((f["y_min"] + f["y_max"]) / 2, -1500)
        self.assertGreater(max(f["values"]), .15)
        self.assertTrue(all(0 <= value <= 1 for value in f["values"]))

    def test_optimizer_returns_feasible_candidates_with_honest_costs(self):
        result = self.client.post("/api/optimize", json={**self.body, "search_radius_m": 4000,
            "traverse_meur_per_km": 2, "max_slope_deg": 8, "clearance_m": 300}).json()
        self.assertIsNotNone(result["best"])
        self.assertLess(result["best"]["summary"]["expected_loss_meur"], result["target"]["summary"]["expected_loss_meur"])
        candidates = [result["best"]["site"], *result["alternatives"]]
        for c in candidates:
            self.assertLessEqual(c["slope_deg"], 8)
            self.assertLessEqual(math.hypot(c["x"] - 1500, c["y"] + 1500), 4000.001)
            self.assertTrue(all(math.hypot(c["x"] - a["x"], c["y"] - a["y"]) >= 300 for a in api.store.assets()))
        for c in result["alternatives"]:
            self.assertAlmostEqual(c["total_cost_meur"], c["expected_loss_meur"] + c["traverse_meur"])

    def test_plan_notifications_and_responses_persist(self):
        result = self.client.post("/api/plans", json={**self.body, "operator_id": "kestrel",
            "name": "Contract test proposal", "window": "2040 training scenario"}).json()
        plan_id = result["plan"]["id"]
        notices = [n for n in self.client.get("/api/notices").json() if n["plan_id"] == plan_id]
        self.assertEqual(len(notices), result["notices_sent"])
        self.assertGreater(len(notices), 0)
        n = notices[0]
        for status in ["objection", "acknowledged"]:
            recipient = {"Authorization": "Bearer " + self.login(n["to_operator_id"])}
            response = self.client.patch(f"/api/notices/{n['id']}", json={"status": status, "reply": "Recorded by contract test"},
                                         headers=recipient)
            self.assertEqual(response.status_code, 200)
            persisted = Store(api.store.path)
            self.assertEqual(next(i for i in persisted.notices() if i["id"] == n["id"])["status"], status)
        self.assertEqual(next(p for p in api.store.plans() if p["id"] == plan_id)["status"], "consultation")

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


class AuthContracts(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="plume-auth-")
        self.previous_store = api.store
        api.store = Store(Path(self.directory.name) / "state.json")
        self.client = TestClient(api.app)

    def tearDown(self):
        api.store = self.previous_store
        self.client.close()
        self.directory.cleanup()

    def signup(self, **kw):
        body = {"name": "Test User", "email": "user@example.com", "password": "correct-horse",
                "organization": "create", "organization_name": "Test Org", **kw}
        return self.client.post("/api/auth/signup", json=body)

    def test_signup_login_logout(self):
        r = self.signup()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["user"]["role"], "admin")
        self.assertEqual(self.signup(organization_name="Other Org").status_code, 409)
        self.assertEqual(self.client.post("/api/auth/login", json={"email": "USER@example.com", "password": "wrong-pass"}).status_code, 401)
        token = self.client.post("/api/auth/login", json={"email": "USER@example.com", "password": "correct-horse"}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        self.assertEqual(self.client.get("/api/auth/me", headers=h).status_code, 200)
        self.client.post("/api/auth/logout", headers=h)
        self.assertEqual(self.client.get("/api/auth/me", headers=h).status_code, 401)
        self.assertNotIn(token, Path(api.store.path).read_text())

    def test_join_requires_valid_invite_and_hides_codes(self):
        self.assertTrue(all("invite_code" not in o for o in self.client.get("/api/operators").json()))
        self.assertEqual(self.signup(organization="join", invite_code="0000-0000-0000").status_code, 404)
        admin = self.client.post("/api/auth/login", json={"email": "selene@plume.demo", "password": auth.DEMO_PASSWORD}).json()
        r = self.signup(email="m@example.com", organization="join", invite_code=admin["organization"]["invite_code"])
        self.assertEqual(r.json()["user"]["operator_id"], "selene")
        self.assertNotIn("invite_code", r.json()["organization"])

    def test_tenant_boundaries(self):
        self.assertEqual(self.client.get("/api/plans").status_code, 401)
        token = self.client.post("/api/auth/login", json={"email": "kestrel@plume.demo", "password": auth.DEMO_PASSWORD}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        self.assertEqual(self.client.delete("/api/assets/f-tel", headers=h).status_code, 403)
        body = {"lander": {"label": "S", "thrust_kn": 1800, "hover_s": 30, "dispersion_m": 50}, "site": {"x": 1500, "y": -1500},
                "operator_id": "farlight", "name": "Spoof", "window": "w"}
        plan = self.client.post("/api/plans", json=body, headers=h).json()["plan"]
        self.assertEqual(plan["operator_id"], "kestrel")
        sent = self.client.get("/api/notices", headers=h).json()[0]
        self.assertEqual(self.client.patch(f"/api/notices/{sent['id']}", json={"status": "acknowledged"}, headers=h).status_code, 403)
