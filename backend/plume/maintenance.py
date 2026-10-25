"""Explicit non-destructive local maintenance. Never deletes or resets records."""

import argparse, json, sqlite3
from pathlib import Path
from .store import Store, DATA_FILE


def backup_database(source: Path, destination: Path):
    if not source.is_file():
        raise ValueError("Source database does not exist")
    if destination.exists():
        raise ValueError("Backup destination already exists; refusing overwrite")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True) as src:
        dst = sqlite3.connect(destination)
        try:
            src.backup(dst)
            if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Backup integrity check failed")
        finally:
            dst.close()
    src.close()
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("inspect")
    p.add_argument("--source", type=Path, default=DATA_FILE)
    p = sub.add_parser("backup")
    p.add_argument("--database", type=Path, default=DATA_FILE.with_suffix(".sqlite3"))
    p.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "backup":
        print(backup_database(args.database, args.destination))
    else:
        store = Store(args.source)
        print(json.dumps(store.migration_report(), indent=2))


if __name__ == "__main__":
    main()
