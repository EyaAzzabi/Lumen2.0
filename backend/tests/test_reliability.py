import os, sys, unittest
from unittest.mock import patch
from types import SimpleNamespace
from plume.copilot import brief
from plume.budget import computation, check
from fastapi import HTTPException


class ReliabilityTests(unittest.TestCase):
    def test_budget_and_capacity_release(self):
        with self.assertRaises(HTTPException) as caught:
            with computation(seconds=-1):
                check()
        self.assertEqual(caught.exception.status_code, 503)
        with computation():
            with computation():
                with self.assertRaises(HTTPException) as caught:
                    with computation():
                        pass
                self.assertEqual(caught.exception.status_code, 429)
        with computation():
            check()

    def test_llm_provenance_and_numeric_guard_without_network(self):
        assessment = {
            "site": {"x": 0, "y": 0},
            "summary": {"expected_loss_meur": 0},
            "assets": [],
        }
        lander = {"label": "Test", "thrust_kn": 15, "hover_s": 60}

        def provider(text):
            client = SimpleNamespace(
                close=lambda: None,
                messages=SimpleNamespace(
                    create=lambda **kw: SimpleNamespace(
                        content=[SimpleNamespace(type="text", text=text)],
                        stop_reason="end_turn",
                        model="test-sdk",
                    )
                ),
            )
            return SimpleNamespace(Anthropic=lambda **kw: client)

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "unit-test-no-network"}):
            with patch.dict(
                sys.modules,
                {
                    "anthropic": provider(
                        "### Situation\nReview the supplied assessment."
                    )
                },
            ):
                self.assertEqual(brief(lander, assessment, [], [])["source"], "claude")
            with patch.dict(
                sys.modules, {"anthropic": provider("99.987% certified safe")}
            ):
                self.assertEqual(
                    brief(lander, assessment, [], [])["source"], "template"
                )


if __name__ == "__main__":
    unittest.main()
