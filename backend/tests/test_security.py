import unittest
from fastapi.testclient import TestClient
from plume.api import app


class StaticSecurity(unittest.TestCase):
    def test_paths(self):
        with TestClient(app) as c:
            for path in [
                "/%2e%2e/%2e%2e/README.md",
                "/%252e%252e/README.md",
                "/..%5c..%5cREADME.md",
                "/.env",
                "/api/does-not-exist",
            ]:
                r = c.get(path)
                self.assertEqual(r.status_code, 404, path)
            self.assertEqual(
                c.get("/api/does-not-exist").headers["content-type"], "application/json"
            )
            self.assertEqual(c.post("/api/reset").status_code, 404)
            self.assertEqual(c.get("/mission/overview").status_code, 200)


if __name__ == "__main__":
    unittest.main()
