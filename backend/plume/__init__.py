"""PLUME backend package.

Local configuration is read from backend/.env (git-ignored) when the server
starts. Variables already set in the environment always win. Tests and the
isolated browser-test server never load it, so they cannot reach a real LLM
with a developer's key.
"""

import os
import sys
from pathlib import Path

if os.getenv("PLUME_ENV") != "test" and "unittest" not in sys.modules:
    try:
        from dotenv import load_dotenv
    except ImportError:  # optional dependency: environment variables still work
        pass
    else:
        load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
