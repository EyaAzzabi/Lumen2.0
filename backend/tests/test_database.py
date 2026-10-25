import copy, json, sqlite3, unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from plume.store import Store, SEED


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.path = Path(self.tmp.name) / "state.json"

    def tearDown(self):
        self.tmp.cleanup()

    def test_migration_preserves_and_is_idempotent(self):
        data = copy.deepcopy(SEED)
        data["plans"] = [
            {
                "id": "LP-OLD",
                "operator_id": "kestrel",
                "name": "old",
                "window": "legacy free text",
                "lander": {"thrust_kn": 15, "hover_s": 60, "dispersion_m": 60},
                "site": {"x": 0, "y": 0},
                "summary": {},
                "status": "consultation",
                "created_at": 123,
            }
        ]
        data["notices"] = [
            {
                "id": "N-OLD",
                "plan_id": "LP-OLD",
                "from_operator_id": "kestrel",
                "to_operator_id": "farlight",
                "asset_ids": ["historically-deleted"],
                "status": "objection",
                "reply": "Preserve me",
                "created_at": 124,
            }
        ]
        self.path.write_text(json.dumps(data))
        s = Store(self.path)
        self.assertEqual(s.plans(), data["plans"])
        self.assertEqual(s.notices(), data["notices"])
        self.assertEqual(s.responses("N-OLD")[0]["reply"], "Preserve me")
        self.assertEqual(Store(self.path).notices(), data["notices"])
        self.assertTrue(s.migration_report()["verified"])
        self.assertEqual(
            json.loads(next(Path(self.tmp.name).glob("*.backup-*")).read_text()), data
        )

    def test_reject_malformed_without_partial_import(self):
        data = copy.deepcopy(SEED)
        data["assets"][0]["operator_id"] = "missing"
        self.path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "unknown organization"):
            Store(self.path)
        self.assertEqual(json.loads(self.path.read_text()), data)

    def test_foreign_keys_rollback_and_concurrent_writes(self):
        s = Store(self.path)
        with self.assertRaises(sqlite3.IntegrityError):
            with s.transaction() as c:
                c.execute("INSERT INTO organizations VALUES('rollback','{}')")
                c.execute("INSERT INTO assets VALUES('bad','absent','{}',NULL)")
        self.assertIsNone(s.operator("rollback"))

        def add(i):
            return Store(self.path).add_asset(
                {
                    "operator_id": "aurora",
                    "name": str(i),
                    "type": "solar_array",
                    "x": 0,
                    "y": 0,
                    "value_meur": 1,
                }
            )

        with ThreadPoolExecutor(max_workers=5) as pool:
            items = list(pool.map(add, range(20)))
        self.assertEqual(len({a["id"] for a in items}), 20)
        self.assertEqual(len(Store(self.path).assets()), 27)

    def test_online_backup_is_consistent_and_refuses_overwrite(self):
        from plume.maintenance import backup_database

        s = Store(self.path)
        destination = Path(self.tmp.name) / "snapshot.sqlite3"
        backup_database(s.db_path, destination)
        self.assertEqual(Store(destination).assets(), s.assets())
        with self.assertRaises(ValueError):
            backup_database(s.db_path, destination)


if __name__ == "__main__":
    unittest.main()
