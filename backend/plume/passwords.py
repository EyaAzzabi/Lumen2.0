"""Password hashing and session tokens (standard library only).

Passwords: PBKDF2-HMAC-SHA256 with a per-user random salt.
Sessions: random bearer tokens; only their SHA-256 hash is stored, so a leaked
state file does not leak usable tokens.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets

ITERATIONS = 200_000
SESSION_TTL_S = 7 * 24 * 3600
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Seeded demo accounts, one per seeded organisation: <operator id>@plume.demo
DEMO_PASSWORD = "plume-demo-2040"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, expected = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), expected)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_invite_code() -> str:
    return "-".join(secrets.token_hex(2).upper() for _ in range(3))


def normalize_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email))
