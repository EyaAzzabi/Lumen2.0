import unittest, uuid
import test_v2 as fixture
from plume import api
from plume.store import Store


class DraftTests(unittest.TestCase):
    setUp = fixture.V2Tests.setUp
    tearDown = fixture.V2Tests.tearDown
    login = fixture.V2Tests.login
    post = fixture.V2Tests.post

    def data(self):
        return {
            "name": "Resumable mission",
            "lander": self.body["lander"],
            "site": self.body["site"],
            "window": "2040-03-14T06:00:00Z / 2040-03-14T08:00:00Z",
            "mission_ready": True,
        }

    def test_create_update_resume_archive_and_isolation(self):
        self.assertEqual(self.client.get("/api/drafts").status_code, 401)
        self.login("kestrel")
        body = self.data()
        first = self.post("/api/drafts", body, "same-draft-key")
        self.assertEqual(first.status_code, 200, first.text)
        d = first.json()
        self.assertEqual(
            self.post("/api/drafts", body, "same-draft-key").json()["id"], d["id"]
        )
        self.assertEqual(d["organization_id"], "kestrel")
        body["name"] = "Renamed"
        body["site"] = {"x": 2600, "y": -500}
        r = self.client.patch(
            "/api/drafts/" + d["id"], json={"expected_version": 1, "data": body}
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["version"], 2)
        self.assertEqual(
            self.client.patch(
                "/api/drafts/" + d["id"], json={"expected_version": 1, "data": body}
            ).status_code,
            409,
        )
        api.store = Store(self.path)
        self.assertEqual(
            self.client.get("/api/drafts/" + d["id"]).json()["data"]["name"], "Renamed"
        )
        self.login("aurora")
        self.assertEqual(self.client.get("/api/drafts").json(), [])
        self.assertEqual(self.client.get("/api/drafts/" + d["id"]).status_code, 404)
        self.assertEqual(
            self.client.patch(
                "/api/drafts/" + d["id"], json={"expected_version": 2, "data": body}
            ).status_code,
            404,
        )
        self.login("kestrel")
        self.assertEqual(
            self.post(
                "/api/drafts/" + d["id"] + "/archive", {"expected_version": 2}
            ).json()["status"],
            "archived",
        )
        self.assertEqual(
            self.post(
                "/api/drafts/" + d["id"] + "/file", {"expected_version": 3}
            ).status_code,
            409,
        )
        self.assertEqual(
            self.post(
                "/api/drafts/" + d["id"] + "/restore", {"expected_version": 3}
            ).json()["status"],
            "draft",
        )

    def test_filing_is_atomic_persisted_and_retries_do_not_duplicate(self):
        self.login("kestrel")
        d = self.post("/api/drafts", self.data()).json()
        self.assertEqual(
            self.post(
                "/api/drafts/" + d["id"] + "/file", {"expected_version": 99}
            ).status_code,
            409,
        )
        r = self.post(
            "/api/drafts/" + d["id"] + "/file",
            {"expected_version": 1},
            "conversion-key",
        )
        self.assertEqual(r.status_code, 200, r.text)
        p = r.json()["plan"]
        saved = self.client.get("/api/drafts/" + d["id"]).json()
        self.assertEqual(saved["status"], "filed")
        self.assertEqual(saved["filed_plan_id"], p["id"])
        self.assertEqual(
            self.post(
                "/api/drafts/" + d["id"] + "/file",
                {"expected_version": 1},
                "conversion-key",
            ).json()["plan"]["id"],
            p["id"],
        )
        self.assertEqual(len(api.store.plans()), 1)
        self.assertEqual(
            self.client.patch(
                "/api/drafts/" + d["id"],
                json={"expected_version": 2, "data": self.data()},
            ).status_code,
            409,
        )

    def test_partial_draft_is_not_a_filed_plan_and_inputs_are_validated(self):
        self.login("kestrel")
        data = self.data()
        data.update(name="", window="")
        d = self.post("/api/drafts", data).json()
        self.assertEqual(
            self.post(
                "/api/drafts/" + d["id"] + "/file", {"expected_version": 1}
            ).status_code,
            422,
        )
        self.assertEqual(api.store.plans(), [])
        data["site"]["x"] = 16000
        self.assertEqual(self.post("/api/drafts", data).status_code, 422)
        self.assertEqual(
            self.client.get("/api/drafts/" + d["id"]).json()["status"], "draft"
        )


if __name__ == "__main__":
    unittest.main()
