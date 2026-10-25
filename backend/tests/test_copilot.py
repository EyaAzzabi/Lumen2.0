"""Copilot structured output, grounding checks and grounded Q&A, without network."""

import json
import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from plume import api, auth, copilot, planner
from plume.physics import Lander
from plume.store import Store
from plume.terrain import Terrain

LANDER = {"label": "Super-heavy lander", "thrust_kn": 1800, "hover_s": 30, "dispersion_m": 50}


def fake_model(reply: str):
    """An `anthropic` module whose client always returns `reply`."""
    client = SimpleNamespace(
        close=lambda: None,
        messages=SimpleNamespace(
            create=lambda **kw: SimpleNamespace(
                content=[SimpleNamespace(type="text", text=reply)], stop_reason="end_turn", model="fake"
            )
        ),
    )
    return SimpleNamespace(Anthropic=lambda **kw: client)


class CopilotGrounding(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = TemporaryDirectory()
        store = Store(Path(cls.dir.name) / "s.json")
        cls.assets, cls.ops = store.assets(), store.operators()
        cls.assessment = planner.assess(Terrain(), Lander(1800, 30), 50, 1500, -1500, cls.assets)
        cls.telescope = next(a for a in cls.assets if a["name"] == "FLO Optical Telescope")

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def run_brief(self, reply):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test", "PLUME_LLM_PROVIDER": ""}):
            with patch.dict(sys.modules, {"anthropic": fake_model(reply)}):
                return copilot.brief(LANDER, self.assessment, self.assets, self.ops)

    def good(self, **overrides):
        body = {
            "situation": "The requested site puts FLO Optical Telescope at critical risk.",
            "risks": [{"asset": "FLO Optical Telescope", "risk": "critical", "why": "It is 0.71 km away in line of sight."}],
            "actions": ["Compare alternative sites.", "Ask the observatory to close its covers."],
            "limitations": "Simplified model.",
        }
        body.update(overrides)
        return json.dumps(body)

    def test_structured_brief_is_accepted_and_rendered(self):
        r = self.run_brief(self.good())
        self.assertEqual(r["source"], "claude")
        self.assertEqual(r["structured"]["risks"][0]["asset"], "FLO Optical Telescope")
        self.assertIn("### Recommended actions", r["markdown"])

    def test_unknown_asset_is_rejected(self):
        bad = self.good(risks=[{"asset": "Imaginary Dome", "risk": "critical", "why": "Close."}])
        self.assertEqual(self.run_brief(bad)["source"], "template")

    def test_risk_level_must_match_physics(self):
        bad = self.good(risks=[{"asset": "FLO Optical Telescope", "risk": "low", "why": "Fine."}])
        self.assertEqual(self.run_brief(bad)["source"], "template")

    def test_invented_number_is_rejected(self):
        bad = self.good(situation="Damage is 42.42% everywhere.")
        r = self.run_brief(bad)
        self.assertEqual(r["source"], "template")
        self.assertTrue(r["structured"]["risks"])  # template is structured too

    def test_copying_the_few_shot_example_is_rejected(self):
        self.assertEqual(self.run_brief(json.dumps(copilot.BRIEF_EXAMPLE_OUT))["source"], "template")

    def test_rejected_answer_gets_one_corrective_retry(self):
        replies = iter([self.good(situation="It saves 42.42% overall."), self.good()])
        seen = []
        client = SimpleNamespace(
            close=lambda: None,
            messages=SimpleNamespace(create=lambda **kw: (seen.append(kw["messages"]), SimpleNamespace(
                content=[SimpleNamespace(type="text", text=next(replies))], stop_reason="end_turn", model="fake"))[1]),
        )
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test", "PLUME_LLM_PROVIDER": ""}):
            with patch.dict(sys.modules, {"anthropic": SimpleNamespace(Anthropic=lambda **kw: client)}):
                r = copilot.brief(LANDER, self.assessment, self.assets, self.ops)
        self.assertEqual((r["source"], r["attempts"]), ("claude", 2))
        self.assertIn("42.42", seen[1][-1]["content"])  # the model is told what was wrong

    def test_fallback_reason_is_explicit(self):
        r = self.run_brief(self.good(situation="Damage is 42.42% everywhere."))
        self.assertIn("numbers not in the data: 42.42", r["reason"])
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": "", "PLUME_LLM_PROVIDER": ""}):
            self.assertEqual(copilot.brief(LANDER, self.assessment, self.assets, self.ops)["reason"],
                             "no language model configured")

    def ask(self, reply, kind="why"):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test", "PLUME_LLM_PROVIDER": ""}):
            with patch.dict(sys.modules, {"anthropic": fake_model(reply)}):
                return copilot.ask(LANDER, self.assessment, self.assets, self.ops,
                                   "Why is this asset affected?", kind, self.telescope["id"])

    def test_grounded_answer(self):
        r = self.ask(json.dumps({"answer": "It is 0.71 km away with no shielding.", "points": ["Impact dominates."]}))
        self.assertEqual((r["source"], r["points"]), ("claude", ["Impact dominates."]))

    def test_answer_with_invented_number_falls_back_to_data(self):
        r = self.ask(json.dumps({"answer": "It has a 73% chance of failure.", "points": []}))
        self.assertEqual(r["source"], "template")
        self.assertIn("FLO Optical Telescope", r["answer"])

    def test_offline_change_answer_uses_data(self):
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": "", "PLUME_LLM_PROVIDER": ""}):
            r = copilot.ask(LANDER, self.assessment, self.assets, self.ops, "What can I change?", "change")
        self.assertEqual(r["source"], "template")
        self.assertTrue(r["points"])


class AskEndpoint(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.old = api.store, api.settings
        api.store = Store(Path(self.temp.name) / "state.json")
        api.settings = auth.Settings(environment="test", demo=False)
        self.c = TestClient(api.app, base_url="http://localhost", client=("127.0.0.1", 45000))

    def tearDown(self):
        self.c.close()
        api.store, api.settings = self.old
        self.temp.cleanup()

    def test_requires_sign_in_and_known_asset(self):
        body = {"lander": LANDER, "site": {"x": 1500, "y": -1500}, "question": "Why?", "kind": "why", "asset_id": "f-tel"}
        self.assertEqual(self.c.post("/api/copilot/ask", json=body).status_code, 401)
        r = self.c.post("/api/auth/signup", json={"name": "Asker", "email": "ask@example.test",
                                                  "password": "test-password-long", "organization": "create",
                                                  "organization_name": "Ask Org"})
        self.c.headers["X-Plume-CSRF"] = r.json()["csrf_token"]
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": "", "PLUME_LLM_PROVIDER": ""}):
            ok = self.c.post("/api/copilot/ask", json=body)
            self.assertEqual(ok.status_code, 200, ok.text)
            self.assertEqual(ok.json()["source"], "template")
            missing = self.c.post("/api/copilot/ask", json={**body, "asset_id": "nope"})
            self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()


class AiQuota(unittest.TestCase):
    """Per-organization quota on paid model requests."""

    def setUp(self):
        self.temp = TemporaryDirectory()
        self.old = api.store, api.settings
        api.store = Store(Path(self.temp.name) / "state.json")
        api.settings = auth.Settings(environment="test", demo=False)
        self.c = TestClient(api.app, base_url="http://localhost", client=("127.0.0.1", 45000))
        self.body = {"lander": LANDER, "site": {"x": 1500, "y": -1500}, "question": "What can I change?", "kind": "change"}
        reply = json.dumps({"answer": "Compare alternative sites.", "points": []})
        self.env = patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test", "OPENAI_API_KEY": "", "PLUME_LLM_PROVIDER": "",
                                           "PLUME_AI_PER_MINUTE": "2", "PLUME_AI_PER_DAY": "50"})
        self.mods = patch.dict(sys.modules, {"anthropic": fake_model(reply)})
        self.env.start()
        self.mods.start()

    def tearDown(self):
        self.mods.stop()
        self.env.stop()
        self.c.close()
        api.store, api.settings = self.old
        self.temp.cleanup()

    def sign_up(self, email, org):
        self.c.cookies.clear()
        r = self.c.post("/api/auth/signup", json={"name": "Quota User", "email": email, "password": "test-password-long",
                                                  "organization": "create", "organization_name": org})
        self.assertEqual(r.status_code, 200, r.text)
        self.c.headers["X-Plume-CSRF"] = r.json()["csrf_token"]

    def test_minute_limit_falls_back_to_template_and_is_per_organization(self):
        self.sign_up("a@example.test", "Quota Org A")
        sources = [self.c.post("/api/copilot/ask", json=self.body).json() for _ in range(3)]
        self.assertEqual([s["source"] for s in sources], ["claude", "claude", "template"])
        self.assertIn("AI quota reached for your organization (2 per minute)", sources[2]["reason"])
        brief = self.c.post("/api/copilot/brief", json={k: self.body[k] for k in ("lander", "site")}).json()
        self.assertEqual(brief["source"], "template")  # the brief shares the same quota
        usage = self.c.get("/api/copilot/usage").json()
        self.assertEqual(usage["per_minute"], {"used": 2, "limit": 2})
        self.sign_up("b@example.test", "Quota Org B")  # another organization has its own budget
        self.assertEqual(self.c.post("/api/copilot/ask", json=self.body).json()["source"], "claude")

    def test_template_answers_are_not_counted(self):
        self.sign_up("c@example.test", "Quota Org C")
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": ""}):
            for _ in range(4):
                self.assertEqual(self.c.post("/api/copilot/ask", json=self.body).json()["source"], "template")
            self.assertEqual(self.c.get("/api/copilot/usage").json()["per_minute"]["used"], 0)

    def test_usage_requires_sign_in(self):
        self.assertEqual(self.c.get("/api/copilot/usage").status_code, 401)
