"""Merged Eya password accounts against V2 transactional authorization."""

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from fastapi.testclient import TestClient
from plume import api, auth
from plume.store import Store


class AccountIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.oldstore = api.store
        self.oldsettings = api.settings
        self.path = Path(self.temp.name) / "state.json"
        api.store = Store(self.path)
        api.settings = auth.Settings(environment="test", demo=False)
        self.c = TestClient(
            api.app, base_url="http://localhost", client=("127.0.0.1", 45000)
        )

    def tearDown(self):
        self.c.close()
        api.store = self.oldstore
        api.settings = self.oldsettings
        self.temp.cleanup()

    def signup(self, email, company="New Moon Systems", invite=None):
        body = {
            "name": "Test Operator",
            "email": email,
            "password": "test-password-long",
            "organization": "join" if invite else "create",
        }
        body.update(
            {"invite_code": invite} if invite else {"organization_name": company}
        )
        r = self.c.post("/api/auth/signup", json=body)
        self.assertEqual(r.status_code, 200, r.text)
        self.c.headers["X-Plume-CSRF"] = r.json()["csrf_token"]
        return r.json()

    def test_signup_login_invite_owner_boundaries_and_restart(self):
        owner = self.signup("owner@example.test")
        org = owner["organization"]
        self.assertTrue(org["invite_code"])
        self.assertEqual(owner["user"]["role"], "admin")
        self.assertNotIn("token", owner)
        self.assertNotIn("password_hash", str(owner))
        self.assertIn(
            "HttpOnly",
            self.c.cookies.jar._cookies["localhost.local"]["/"][auth.COOKIE]._rest,
        )
        shared = self.c.get("/api/operators").json()
        self.assertTrue(all("invite_code" not in o for o in shared))
        self.c.post("/api/auth/logout")
        self.assertEqual(self.c.get("/api/plans").status_code, 401)
        member = self.signup("member@example.test", invite=org["invite_code"])
        self.assertEqual(member["organization"]["id"], org["id"])
        self.assertNotIn("invite_code", member["organization"])
        self.assertEqual(member["user"]["role"], "member")
        created = self.c.post(
            "/api/assets",
            json={
                "operator_id": org["id"],
                "name": "Member rover",
                "type": "rover",
                "x": 0,
                "y": 0,
                "value_meur": 2,
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(self.c.delete("/api/assets/a-hab").status_code, 403)
        api.store = Store(self.path)
        self.assertEqual(
            self.c.get("/api/auth/me").json()["user"]["email"], "member@example.test"
        )
        self.c.post("/api/auth/logout")
        bad = self.c.post(
            "/api/auth/login",
            json={"email": "owner@example.test", "password": "incorrect"},
        )
        self.assertEqual(bad.status_code, 401)
        good = self.c.post(
            "/api/auth/login",
            json={"email": "OWNER@example.test", "password": "test-password-long"},
        )
        self.assertEqual(good.status_code, 200, good.text)
        self.assertEqual(good.json()["organization"]["id"], org["id"])
        self.assertIn("invite_code", good.json()["organization"])

    def test_eya_json_accounts_migrate_without_losing_credentials(self):
        import copy, json
        from plume.store import SEED
        from plume import passwords

        data = copy.deepcopy(SEED)
        data["operators"][0]["invite_code"] = "ABCD-1234-DCBA"
        data["users"] = [
            {
                "id": "u-eya-existing",
                "email": "existing@example.test",
                "name": "Existing User",
                "operator_id": "kestrel",
                "role": "admin",
                "demo": False,
                "created_at": 42,
                "password_hash": passwords.hash_password("existing-password"),
            }
        ]
        data["sessions"] = [
            {
                "user_id": "u-eya-existing",
                "token_hash": passwords.token_digest("historical-token"),
                "created_at": 43,
                "expires_at": 9999999999,
            }
        ]
        path = Path(self.temp.name) / "eya.json"
        path.write_text(json.dumps(data))
        api.store = Store(path)
        r = self.c.post(
            "/api/auth/login",
            json={"email": "existing@example.test", "password": "existing-password"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["user"]["id"], "u-eya-existing")
        self.assertEqual(r.json()["organization"]["invite_code"], "ABCD-1234-DCBA")
        self.assertTrue(all("invite_code" not in o for o in api.store.operators()))
        self.assertEqual(json.loads(path.read_text()), data)

    def test_demo_credentials_opt_in_and_generic_login_error(self):
        self.assertEqual(
            self.c.post(
                "/api/copilot/brief",
                json={
                    "lander": {"thrust_kn": 15, "hover_s": 60, "dispersion_m": 50},
                    "site": {"x": 0, "y": 0},
                },
            ).status_code,
            401,
        )
        self.assertEqual(self.c.get("/api/auth/demo-accounts").json(), [])
        self.assertEqual(
            self.c.post(
                "/api/auth/login",
                json={"email": "kestrel@plume.demo", "password": "plume-demo-2040"},
            ).status_code,
            401,
        )
        api.settings = auth.Settings(environment="test", demo=True)
        accounts = self.c.get("/api/auth/demo-accounts").json()
        self.assertEqual(len(accounts), 6)
        r = self.c.post(
            "/api/auth/login",
            json={"email": accounts[0]["email"], "password": accounts[0]["password"]},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["user"]["demo"])

    def test_duplicate_org_invites_rate_limit_and_csrf(self):
        self.signup("one@example.test")
        r = self.c.post(
            "/api/auth/signup",
            json={
                "name": "Another",
                "email": "two@example.test",
                "password": "another-password",
                "organization": "create",
                "organization_name": "new moon systems",
            },
        )
        self.assertEqual(r.status_code, 409)
        r = self.c.post(
            "/api/auth/signup",
            json={
                "name": "Another",
                "email": "two@example.test",
                "password": "another-password",
                "organization": "join",
                "invite_code": "INVALID",
            },
        )
        self.assertEqual(r.status_code, 404)
        self.c.headers.pop("X-Plume-CSRF")
        self.assertEqual(self.c.post("/api/auth/logout").status_code, 403)
        for i in range(10):
            self.assertEqual(
                self.c.post(
                    "/api/auth/login",
                    json={"email": "absent@example.test", "password": "incorrect"},
                ).status_code,
                401,
            )
        self.assertEqual(
            self.c.post(
                "/api/auth/login",
                json={"email": "absent@example.test", "password": "incorrect"},
            ).status_code,
            429,
        )


if __name__ == "__main__":
    unittest.main()


class OrganizationMembers(AccountIntegration):
    def test_members_are_scoped_to_own_organization(self):
        self.assertEqual(self.c.get("/api/organization/members").status_code, 401)
        owner = self.signup("lead@example.test", company="Members Org")
        code = owner["organization"]["invite_code"]
        self.c.post("/api/auth/logout")
        self.signup("crew@example.test", invite=code)
        people = self.c.get("/api/organization/members").json()
        self.assertEqual([p["email"] for p in people], ["lead@example.test", "crew@example.test"])
        self.assertEqual([p["role"] for p in people], ["admin", "member"])
        self.assertTrue(all("password" not in str(p) for p in people))
        self.c.post("/api/auth/logout")
        self.signup("other@example.test", company="Other Org")
        self.assertEqual([p["email"] for p in self.c.get("/api/organization/members").json()], ["other@example.test"])
