"""Tiny JSON-file store for the multi-operator registry.

All organisations, assets and values are fictional demo data.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path

from . import auth

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "state.json"

LANDER_PRESETS = [
    {"id": "clps", "label": "Light robotic lander", "thrust_kn": 4.0, "hover_s": 25.0, "dispersion_m": 150.0,
     "note": "Small science/cargo lander, ~1 t"},
    {"id": "crew", "label": "Crew lander (Apollo-class)", "thrust_kn": 15.0, "hover_s": 60.0, "dispersion_m": 60.0,
     "note": "Piloted descent, long hover"},
    {"id": "cargo", "label": "Heavy cargo lander", "thrust_kn": 250.0, "hover_s": 40.0, "dispersion_m": 100.0,
     "note": "10-20 t payload class"},
    {"id": "superheavy", "label": "Super-heavy lander", "thrust_kn": 1800.0, "hover_s": 30.0, "dispersion_m": 50.0,
     "note": "100 t class, the dominant risk driver after 2030"},
]

SEED = {
    "operators": [
        {"id": "kestrel", "name": "Kestrel Lunar Logistics", "short": "KLL", "color": "#f59e0b"},
        {"id": "aurora", "name": "Aurora Habitats", "short": "AUR", "color": "#38bdf8"},
        {"id": "selene", "name": "Selene Power Co.", "short": "SEL", "color": "#facc15"},
        {"id": "regolith", "name": "Regolith Dynamics", "short": "RGD", "color": "#a78bfa"},
        {"id": "relay", "name": "Polar Relay Networks", "short": "PRN", "color": "#34d399"},
        {"id": "farlight", "name": "Far Light Observatory", "short": "FLO", "color": "#f472b6"},
    ],
    "assets": [
        {"id": "a-hab", "operator_id": "aurora", "name": "Aurora Base Alpha", "type": "habitat",
         "x": -2000, "y": -1000, "value_meur": 380},
        {"id": "a-sol", "operator_id": "aurora", "name": "Alpha Power Field", "type": "solar_array",
         "x": -1000, "y": 0, "value_meur": 35},
        {"id": "s-sol", "operator_id": "selene", "name": "Helios Solar Farm", "type": "solar_array",
         "x": 0, "y": 1000, "value_meur": 42},
        {"id": "r-isru", "operator_id": "regolith", "name": "IceWorks ISRU Plant", "type": "isru_plant",
         "x": -1000, "y": -4000, "value_meur": 120},
        {"id": "r-rov", "operator_id": "regolith", "name": "Prospector Rover (parked)", "type": "rover",
         "x": -500, "y": -2600, "value_meur": 18},
        {"id": "p-rel", "operator_id": "relay", "name": "Pole Relay Tower", "type": "comms_relay",
         "x": 3000, "y": 3000, "value_meur": 65},
        {"id": "f-tel", "operator_id": "farlight", "name": "FLO Optical Telescope", "type": "telescope",
         "x": 2000, "y": -2000, "value_meur": 90},
    ],
    "plans": [],
    "notices": [],
}


class Store:
    def __init__(self, path: Path = DATA_FILE):
        self.path = path
        self.lock = threading.Lock()
        if path.exists():
            self.state = json.loads(path.read_text(encoding="utf-8"))
            if "users" not in self.state:
                self._seed_accounts()
                self._save()
        else:
            self.reset()

    def reset(self):
        self.state = json.loads(json.dumps(SEED))
        self._seed_accounts()
        self._save()

    def _seed_accounts(self):
        """Invite codes for every organisation and one demo account each."""
        self.state.setdefault("users", [])
        self.state.setdefault("sessions", [])
        for op in self.state["operators"]:
            op.setdefault("invite_code", auth.new_invite_code())
            email = f"{op['id']}@plume.demo"
            if not any(u["email"] == email for u in self.state["users"]):
                self.state["users"].append({
                    "id": f"u-{uuid.uuid4().hex[:8]}", "email": email, "name": f"{op['name']} (demo)",
                    "operator_id": op["id"], "role": "admin", "demo": True,
                    "password_hash": auth.hash_password(auth.DEMO_PASSWORD), "created_at": time.time(),
                })

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.state, indent=2), encoding="utf-8")

    # --- reads -------------------------------------------------------------
    def operators(self):
        """Public view: invite codes are never listed."""
        return [{k: v for k, v in o.items() if k != "invite_code"} for o in self.state["operators"]]

    def operator(self, op_id):
        return next((o for o in self.state["operators"] if o["id"] == op_id), None)

    def assets(self):
        return self.state["assets"]

    def plans(self):
        return sorted(self.state["plans"], key=lambda p: p["created_at"], reverse=True)

    def notices(self, operator_id=None):
        items = self.state["notices"]
        if operator_id:
            items = [n for n in items if n["to_operator_id"] == operator_id or n["from_operator_id"] == operator_id]
        return sorted(items, key=lambda n: n["created_at"], reverse=True)

    # --- writes ------------------------------------------------------------
    def add_asset(self, asset: dict) -> dict:
        with self.lock:
            asset = {**asset, "id": f"a-{uuid.uuid4().hex[:8]}"}
            self.state["assets"].append(asset)
            self._save()
            return asset

    def delete_asset(self, asset_id: str) -> bool:
        with self.lock:
            before = len(self.state["assets"])
            self.state["assets"] = [a for a in self.state["assets"] if a["id"] != asset_id]
            self._save()
            return len(self.state["assets"]) < before

    def add_plan(self, plan: dict, notices: list[dict]) -> dict:
        with self.lock:
            now = time.time()
            plan = {**plan, "id": f"LP-{uuid.uuid4().hex[:6].upper()}", "created_at": now}
            self.state["plans"].append(plan)
            for n in notices:
                self.state["notices"].append({
                    **n, "id": f"N-{uuid.uuid4().hex[:6].upper()}", "plan_id": plan["id"],
                    "created_at": now, "status": "unread",
                })
            self._save()
            return plan

    # --- accounts ----------------------------------------------------------
    def user_by_email(self, email: str):
        return next((u for u in self.state["users"] if u["email"] == email), None)

    def operator_by_invite(self, code: str):
        code = code.strip().upper()
        return next((o for o in self.state["operators"] if o.get("invite_code") == code), None)

    def create_account(self, name: str, email: str, password: str, operator_id: str | None,
                       new_org: dict | None) -> dict:
        with self.lock:
            if self.user_by_email(email):
                raise ValueError("An account with this email already exists")
            role = "member"
            if new_org:
                op_id = f"org-{uuid.uuid4().hex[:6]}"
                palette = ["#fb7185", "#22d3ee", "#a3e635", "#e879f9", "#fbbf24", "#60a5fa"]
                self.state["operators"].append({
                    "id": op_id, "name": new_org["name"], "short": new_org["short"],
                    "color": palette[len(self.state["operators"]) % len(palette)],
                    "invite_code": auth.new_invite_code(),
                })
                operator_id, role = op_id, "admin"
            user = {
                "id": f"u-{uuid.uuid4().hex[:8]}", "email": email, "name": name, "operator_id": operator_id,
                "role": role, "demo": False, "password_hash": auth.hash_password(password), "created_at": time.time(),
            }
            self.state["users"].append(user)
            self._save()
            return user

    def create_session(self, user_id: str) -> str:
        with self.lock:
            now = time.time()
            token = auth.new_token()
            self.state["sessions"] = [s for s in self.state["sessions"] if s["expires_at"] > now]
            self.state["sessions"].append({"token_hash": auth.token_digest(token), "user_id": user_id,
                                           "created_at": now, "expires_at": now + auth.SESSION_TTL_S})
            self._save()
            return token

    def user_for_token(self, token: str):
        digest = auth.token_digest(token)
        now = time.time()
        s = next((s for s in self.state["sessions"] if s["token_hash"] == digest and s["expires_at"] > now), None)
        if not s:
            return None
        return next((u for u in self.state["users"] if u["id"] == s["user_id"]), None)

    def delete_session(self, token: str):
        with self.lock:
            digest = auth.token_digest(token)
            self.state["sessions"] = [s for s in self.state["sessions"] if s["token_hash"] != digest]
            self._save()

    def notice(self, notice_id: str):
        return next((n for n in self.state["notices"] if n["id"] == notice_id), None)

    def asset(self, asset_id: str):
        return next((a for a in self.state["assets"] if a["id"] == asset_id), None)

    def set_notice_status(self, notice_id: str, status: str, reply: str | None = None):
        with self.lock:
            for n in self.state["notices"]:
                if n["id"] == notice_id:
                    n["status"] = status
                    if reply:
                        n["reply"] = reply
                    self._save()
                    return n
            return None
