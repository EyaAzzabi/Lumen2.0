"""Isolated real-backend browser test server; never writes the user's registry."""

from pathlib import Path
from tempfile import TemporaryDirectory

import os

os.environ["PLUME_ENV"] = "test"
os.environ["PLUME_DEMO_AUTH"] = "true"

import uvicorn

from plume import api
from plume.store import Store

if __name__ == "__main__":
    with TemporaryDirectory(prefix="plume-e2e-") as directory:
        api.store = Store(Path(directory) / "state.json")
        uvicorn.run(api.app, host="127.0.0.1", port=8002)
