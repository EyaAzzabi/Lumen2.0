import copy, json, sqlite3, unittest, uuid
from pathlib import Path
from tempfile import TemporaryDirectory
from fastapi.testclient import TestClient
from plume import api, auth
from plume.store import Store


class V2Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.path = Path(self.tmp.name) / "state.json"
        self.oldstore = api.store
        self.oldsettings = api.settings
        api.store = Store(self.path)
        api.settings = auth.Settings(environment="test", demo=True)
        self.client = TestClient(
            api.app, base_url="http://localhost", client=("127.0.0.1", 50000)
        )
        self.body = {
            "operator_id": "kestrel",
            "name": "V2 acceptance",
            "window_start": "2040-03-14T06:00:00Z",
            "window_end": "2040-03-14T08:00:00Z",
            "lander": {
                "label": "Super-heavy lander",
                "thrust_kn": 1800,
                "hover_s": 30,
                "dispersion_m": 50,
            },
            "site": {"x": 1500, "y": -1500},
        }

    def tearDown(self):
        self.client.close()
        api.store = self.oldstore
        api.settings = self.oldsettings
        self.tmp.cleanup()

    def login(self, op):
        r = self.client.post("/api/session/demo", json={"operator_id": op})
        self.assertEqual(r.status_code, 200, r.text)
        self.client.headers["X-Plume-CSRF"] = r.json()["csrf_token"]
        return r.json()

    def post(self, path, body, key=None):
        return self.client.post(
            path, json=body, headers={"Idempotency-Key": key or str(uuid.uuid4())}
        )

    def file(self):
        self.login("kestrel")
        r = self.post("/api/plans", self.body)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["plan"]

    def test_concurrent_duplicate_responses_are_atomic(self):
        from concurrent.futures import ThreadPoolExecutor

        p = self.file()
        n = next(n for n in api.store.notices() if n["plan_id"] == p["id"])
        self.login(n["to_operator_id"])

        def respond(i):
            return Store(self.path).respond(
                n["id"],
                "objection",
                "Concurrency test",
                n["asset_ids"],
                "demo:" + n["to_operator_id"],
                n["to_operator_id"],
                "same-concurrent-key",
            )

        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(respond, range(8)))
        self.assertEqual(len(api.store.responses(n["id"])), 1)
        self.assertEqual(len({r["id"] for r in results}), 1)

    def test_auth_ownership_csrf_and_roles(self):
        self.assertEqual(self.client.delete("/api/assets/a-hab").status_code, 401)
        self.login("kestrel")
        self.assertEqual(self.client.delete("/api/assets/a-hab").status_code, 403)
        self.assertEqual(
            self.post(
                "/api/assets",
                {
                    "operator_id": "aurora",
                    "name": "spoof",
                    "type": "rover",
                    "x": 0,
                    "y": 0,
                    "value_meur": 1,
                },
            ).status_code,
            403,
        )
        self.client.headers.pop("X-Plume-CSRF")
        self.assertEqual(self.post("/api/plans", self.body).status_code, 403)
        self.login("kestrel")
        with api.store.transaction() as c:
            c.execute(
                "UPDATE memberships SET role='read_only' WHERE user_id='demo:kestrel'"
            )
        self.assertEqual(self.post("/api/plans", self.body).status_code, 403)

    def test_demo_is_opt_in_local_and_production_closed(self):
        api.settings = auth.Settings(demo=False)
        self.assertEqual(
            self.client.post(
                "/api/session/demo", json={"operator_id": "kestrel"}
            ).status_code,
            403,
        )
        with self.assertRaises(RuntimeError):
            auth.Settings(environment="production", demo=True).validate()
        with self.assertRaises(RuntimeError):
            auth.Settings(environment="production", demo=False).validate()
        api.settings = auth.Settings(demo=True)
        with TestClient(
            api.app, base_url="http://localhost", client=("203.0.113.1", 50000)
        ) as remote:
            self.assertEqual(
                remote.post(
                    "/api/session/demo", json={"operator_id": "kestrel"}
                ).status_code,
                403,
            )
        self.assertEqual(
            self.client.post(
                "/api/session/demo",
                headers={"Origin": "https://evil.example"},
                json={"operator_id": "kestrel"},
            ).status_code,
            403,
        )

    def test_complete_revision_workflow_and_restart(self):
        p = self.file()
        pid = p["id"]
        self.assertEqual(p["status"], "awaiting_responses")
        notices = self.client.get("/api/notices").json()
        n = next(n for n in notices if n["plan_id"] == pid)
        self.assertEqual(
            self.client.patch(
                "/api/notices/" + n["id"],
                json={"status": "objection", "reply": "wrong sender"},
                headers={"Idempotency-Key": "wrong-sender"},
            ).status_code,
            403,
        )
        self.login(n["to_operator_id"])
        response = {
            "status": "objection",
            "reply": "Protect our optics",
            "asset_ids": n["asset_ids"],
        }
        r = self.client.patch(
            "/api/notices/" + n["id"],
            json=response,
            headers={"Idempotency-Key": "object-once"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.client.patch(
            "/api/notices/" + n["id"],
            json=response,
            headers={"Idempotency-Key": "object-once"},
        )
        self.assertEqual(len(api.store.responses(n["id"])), 1)
        self.assertEqual(api.store.plan(pid)["status"], "objection_received")
        historic = copy.deepcopy(api.store.assessment(p["revision_id"]))
        self.login("kestrel")
        o = self.post("/api/optimize", self.body_for_site()).json()
        self.assertIsNotNone(o["best"])
        revised = {
            **self.body,
            "site": {"x": o["best"]["site"]["x"], "y": o["best"]["site"]["y"]},
            "expected_revision": 1,
        }
        r = self.post("/api/plans/" + pid + "/revisions", revised, "revision-once")
        self.assertEqual(r.status_code, 200, r.text)
        p2 = r.json()["plan"]
        self.assertEqual(p2["id"], pid)
        self.assertEqual(p2["revision"], 2)
        self.assertEqual(
            self.post(
                "/api/plans/" + pid + "/revisions", revised, "revision-once"
            ).json()["plan"]["revision"],
            2,
        )
        self.assertEqual(
            self.post(
                "/api/plans/" + pid + "/revisions", revised, "stale-revision"
            ).status_code,
            409,
        )
        current = [
            x for x in api.store.notices() if x.get("revision_id") == p2["revision_id"]
        ]
        self.assertTrue(current)
        for notice in current:
            self.login(notice["to_operator_id"])
            self.assertEqual(
                self.post("/api/notices/" + notice["id"] + "/read", {}).status_code, 200
            )
            r = self.client.patch(
                "/api/notices/" + notice["id"],
                json={"status": "acknowledged", "reply": "Current revision reviewed"},
                headers={"Idempotency-Key": "ack-" + notice["id"]},
            )
            self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(api.store.plan(pid)["status"], "coordinated")
        self.assertEqual(api.store.responses(n["id"])[0]["status"], "objection")
        api.store = Store(self.path)
        self.login("kestrel")
        detail = self.client.get("/api/plans/" + pid).json()
        self.assertEqual(len(detail["revisions"]), 2)
        self.assertEqual(api.store.assessment(p["revision_id"]), historic)
        self.assertIn("CONSULTATION_RESOLVED", [e["type"] for e in detail["events"]])
        self.assertFalse(detail["coordination"]["safety_certification"])
        api.store.delete_asset("f-tel")
        self.assertEqual(api.store.assessment(p["revision_id"]), historic)
        r = self.post("/api/plans/" + pid + "/reassess", {})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(len(r.json()["assets"]), 6)
        self.assertEqual(api.store.assessment(p["revision_id"]), historic)

    def body_for_site(self):
        return {"site": self.body["site"], "lander": self.body["lander"]}

    def test_private_access_and_idempotent_payload_conflict(self):
        self.login("kestrel")
        p = self.post("/api/plans", self.body, "same-key").json()["plan"]
        self.assertEqual(
            self.post("/api/plans", self.body, "same-key").json()["plan"]["id"], p["id"]
        )
        self.assertEqual(
            self.post(
                "/api/plans", {**self.body, "name": "different"}, "same-key"
            ).status_code,
            409,
        )
        self.login("aurora")
        self.assertEqual(self.client.get("/api/plans/" + p["id"]).status_code, 403)
        self.assertEqual(
            self.client.get("/api/notices?operator_id=kestrel").status_code, 403
        )

    def test_structured_windows_numeric_limits_and_body_size(self):
        self.login("kestrel")
        for change in [
            {"window_end": "2040-03-14T05:00:00Z"},
            {"window_start": "2040-03-14T06:00:00"},
            {"site": {"x": 15001, "y": 0}},
        ]:
            r = self.post("/api/plans", {**self.body, **change})
            self.assertEqual(r.status_code, 422, r.text)
            self.assertIn("request_id", r.json())
        self.assertEqual(
            self.client.get("/api/terrain/point?x=15001&y=0").status_code, 422
        )
        self.assertEqual(
            self.client.post("/api/plans", content="x" * 131073).status_code, 413
        )

    def test_withdrawal_history_and_event_immutability(self):
        p = self.file()
        r = self.post("/api/plans/" + p["id"] + "/withdraw", {})
        self.assertEqual(r.json()["status"], "withdrawn")
        self.assertEqual(
            self.post(
                "/api/plans/" + p["id"] + "/revisions",
                {**self.body, "expected_revision": 1},
            ).status_code,
            409,
        )
        with self.assertRaises(sqlite3.IntegrityError):
            with api.store.transaction() as c:
                c.execute("DELETE FROM events WHERE plan_id=?", (p["id"],))

    def test_temporal_conflicts_and_read_timestamp(self):
        p = self.file()
        r = self.post("/api/plans", {**self.body, "name": "Overlapping proposal"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn(
            p["id"],
            r.json()["plan"]["temporal_conflicts"]["overlapping_visible_plan_ids"],
        )
        self.assertFalse(
            r.json()["plan"]["temporal_conflicts"]["physically_modeled_interaction"]
        )
        n = next(n for n in api.store.notices() if n["plan_id"] == p["id"])
        self.login(n["to_operator_id"])
        before = self.client.get("/api/inbox/counts").json()["unread"]
        self.post("/api/notices/" + n["id"] + "/read", {})
        self.assertEqual(
            self.client.get("/api/inbox/counts").json()["unread"], before - 1
        )
        self.assertEqual(api.store.notice(n["id"])["status"], "unread")


if __name__ == "__main__":
    unittest.main()
