import unittest
from unittest.mock import patch
from plume import api, planner
from plume.store import Store, SEED
from plume.physics import Lander
from plume.terrain import Terrain
import test_v2 as fixtures


class WorkspaceTests(unittest.TestCase):
    setUp = fixtures.V2Tests.setUp
    tearDown = fixtures.V2Tests.tearDown
    login = fixtures.V2Tests.login
    post = fixtures.V2Tests.post

    def draft(self):
        return {
            "name": "Private draft",
            "window": "2040-03-14T06:00:00Z / 2040-03-14T08:00:00Z",
            "lander": self.body["lander"],
            "site": self.body["site"],
            "mission_ready": True,
        }

    def test_draft_permissions_restart_and_stale_tab(self):
        self.assertEqual(self.client.get("/api/workspace/draft").status_code, 401)
        self.login("kestrel")
        self.assertEqual(self.client.get("/api/workspace/draft").json()["version"], 0)
        body = {"expected_version": 0, "draft": self.draft()}
        self.assertEqual(
            self.client.post(
                "/api/workspace/draft", json=body, headers={"X-Plume-CSRF": "wrong"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post("/api/workspace/draft", json=body).json()["version"], 1
        )
        stale = self.client.post("/api/workspace/draft", json=body)
        self.assertEqual(stale.status_code, 409)
        api.store = Store(self.path)
        self.assertEqual(
            self.client.get("/api/workspace/draft").json()["draft"]["name"],
            "Private draft",
        )
        self.login("aurora")
        self.assertIsNone(self.client.get("/api/workspace/draft").json()["draft"])
        self.login("kestrel")
        body["expected_version"] = 1
        body["draft"]["name"] = "Updated"
        self.assertEqual(
            self.client.post("/api/workspace/draft", json=body).json()["version"], 2
        )
        body["expected_version"] = 2
        body["draft"]["site"]["x"] = 99999
        self.assertEqual(
            self.client.post("/api/workspace/draft", json=body).status_code, 422
        )

    def test_drafts_are_private_even_inside_one_organization(self):
        def signup(email, invite=None):
            data = {
                "name": "Workspace tester",
                "email": email,
                "password": "test-password-long",
                "organization": "join" if invite else "create",
            }
            data.update(
                {"invite_code": invite}
                if invite
                else {"organization_name": "Workspace isolation"}
            )
            r = self.client.post("/api/auth/signup", json=data)
            self.assertEqual(r.status_code, 200, r.text)
            self.client.headers["X-Plume-CSRF"] = r.json()["csrf_token"]
            return r.json()

        owner = signup("owner@workspace.test")
        self.assertEqual(
            self.client.post(
                "/api/workspace/draft",
                json={"expected_version": 0, "draft": self.draft()},
            ).status_code,
            200,
        )
        self.client.post("/api/auth/logout")
        signup("member@workspace.test", owner["organization"]["invite_code"])
        self.assertIsNone(self.client.get("/api/workspace/draft").json()["draft"])

    def test_filing_checks_protection_limits_on_server(self):
        self.login("kestrel")
        telescope = next(a for a in SEED["assets"] if a["type"] == "telescope")
        self.body["asset_limits"] = [
            {"asset_id": telescope["id"], "max_damage_fraction": 0.01}
        ]
        r = self.post("/api/plans", self.body)
        self.assertEqual(r.status_code, 422, r.text)
        self.body["asset_limits"][0]["max_damage_fraction"] = 1
        r = self.post("/api/plans", self.body)
        self.assertEqual(r.status_code, 200, r.text)
        p = r.json()["plan"]
        self.assertTrue(p["protection"]["passes"])
        detail = self.client.get("/api/plans/" + p["id"]).json()
        self.assertEqual(
            detail["revisions"][0]["historical_assessment"]["inputs"]["asset_limits"],
            self.body["asset_limits"],
        )

    def test_resolution_link_requires_correct_plan_revision_and_asset_limits(self):
        self.login("kestrel")
        plan = self.post("/api/plans", self.body).json()["plan"]
        notice = next(n for n in api.store.notices() if n["plan_id"] == plan["id"])
        self.login(notice["to_operator_id"])
        r = self.client.patch(
            "/api/notices/" + notice["id"],
            json={"status": "objection", "reply": "Please protect these assets"},
            headers={"Idempotency-Key": "resolution-objection"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.login("kestrel")
        self.body.update(resolution_notice_id=notice["id"], expected_revision=1)
        self.assertEqual(self.post("/api/plans", self.body).status_code, 422)
        path = "/api/plans/" + plan["id"] + "/revisions"
        self.assertEqual(self.post(path, self.body).status_code, 422)
        self.body["asset_limits"] = [
            {"asset_id": a, "max_damage_fraction": 1} for a in notice["asset_ids"]
        ]
        self.body["expected_revision"] = 2
        self.assertEqual(self.post(path, self.body).status_code, 409)
        self.body["expected_revision"] = 1
        r = self.post(path, self.body)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(
            r.json()["plan"]["protection"]["resolution_notice_id"], notice["id"]
        )
        self.assertEqual(r.json()["plan"]["status"], "awaiting_responses")

    def test_optimizer_limits_and_unknown_assets(self):
        t = Terrain()
        asset = next(a for a in SEED["assets"] if a["type"] == "telescope")
        result = planner.optimize(
            t,
            Lander(1800, 30),
            50,
            1500,
            -1500,
            SEED["assets"],
            4000,
            asset_limits={asset["id"]: 0.03},
        )
        self.assertIsNotNone(result["best"])
        self.assertTrue(result["protection_constraints"]["best_passes"])
        for c in [result["best_explanation"], *result["alternatives"]]:
            checked = planner.assess(
                t, Lander(1800, 30), 50, c["x"], c["y"], SEED["assets"]
            )
            row = next(a for a in checked["assets"] if a["asset_id"] == asset["id"])
            self.assertLessEqual(row["damage_fraction"], 0.03)
        bad = self.client.post(
            "/api/optimize",
            json={
                "lander": self.body["lander"],
                "site": self.body["site"],
                "asset_limits": [{"asset_id": "unknown", "max_damage_fraction": 0.01}],
            },
        )
        self.assertEqual(bad.status_code, 422)
        with self.assertRaises(ValueError):
            planner.optimize(
                t,
                Lander(4, 25),
                0,
                0,
                0,
                SEED["assets"],
                asset_limits={asset["id"]: float("nan")},
            )

    def test_no_evaluated_solution_does_not_return_unsafe_fallback(self):
        asset = SEED["assets"][0]
        fixed = [
            {
                "asset_id": asset["id"],
                "damage_fraction": 0.5,
                "expected_loss_meur": 1,
                "risk": "critical",
            }
        ]
        with patch.object(planner, "assess_assets", return_value=fixed):
            r = planner.optimize(
                Terrain(),
                Lander(4, 25),
                0,
                0,
                0,
                [asset],
                asset_limits={asset["id"]: 0.01},
            )
        self.assertIsNone(r["best"])
        self.assertEqual(r["alternatives"], [])
        self.assertGreater(r["protection_constraints"]["rejected_evaluated_sites"], 0)


if __name__ == "__main__":
    unittest.main()
