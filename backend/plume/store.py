"""Compatibility exports for fictional presets, seed and transactional Store."""

from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "state.json"

LANDER_PRESETS = [
    {
        "id": "clps",
        "label": "Light robotic lander",
        "thrust_kn": 4.0,
        "hover_s": 25.0,
        "dispersion_m": 150.0,
        "note": "Small science/cargo lander, ~1 t",
    },
    {
        "id": "crew",
        "label": "Crew lander (Apollo-class)",
        "thrust_kn": 15.0,
        "hover_s": 60.0,
        "dispersion_m": 60.0,
        "note": "Piloted descent, long hover",
    },
    {
        "id": "cargo",
        "label": "Heavy cargo lander",
        "thrust_kn": 250.0,
        "hover_s": 40.0,
        "dispersion_m": 100.0,
        "note": "10-20 t payload class",
    },
    {
        "id": "superheavy",
        "label": "Super-heavy lander",
        "thrust_kn": 1800.0,
        "hover_s": 30.0,
        "dispersion_m": 50.0,
        "note": "100 t class, the dominant risk driver after 2030",
    },
]

SEED = {
    "operators": [
        {
            "id": "kestrel",
            "name": "Kestrel Lunar Logistics",
            "short": "KLL",
            "color": "#f59e0b",
        },
        {"id": "aurora", "name": "Aurora Habitats", "short": "AUR", "color": "#38bdf8"},
        {
            "id": "selene",
            "name": "Selene Power Co.",
            "short": "SEL",
            "color": "#facc15",
        },
        {
            "id": "regolith",
            "name": "Regolith Dynamics",
            "short": "RGD",
            "color": "#a78bfa",
        },
        {
            "id": "relay",
            "name": "Polar Relay Networks",
            "short": "PRN",
            "color": "#34d399",
        },
        {
            "id": "farlight",
            "name": "Far Light Observatory",
            "short": "FLO",
            "color": "#f472b6",
        },
    ],
    "assets": [
        {
            "id": "a-hab",
            "operator_id": "aurora",
            "name": "Aurora Base Alpha",
            "type": "habitat",
            "x": -2000,
            "y": -1000,
            "value_meur": 380,
        },
        {
            "id": "a-sol",
            "operator_id": "aurora",
            "name": "Alpha Power Field",
            "type": "solar_array",
            "x": -1000,
            "y": 0,
            "value_meur": 35,
        },
        {
            "id": "s-sol",
            "operator_id": "selene",
            "name": "Helios Solar Farm",
            "type": "solar_array",
            "x": 0,
            "y": 1000,
            "value_meur": 42,
        },
        {
            "id": "r-isru",
            "operator_id": "regolith",
            "name": "IceWorks ISRU Plant",
            "type": "isru_plant",
            "x": -1000,
            "y": -4000,
            "value_meur": 120,
        },
        {
            "id": "r-rov",
            "operator_id": "regolith",
            "name": "Prospector Rover (parked)",
            "type": "rover",
            "x": -500,
            "y": -2600,
            "value_meur": 18,
        },
        {
            "id": "p-rel",
            "operator_id": "relay",
            "name": "Pole Relay Tower",
            "type": "comms_relay",
            "x": 3000,
            "y": 3000,
            "value_meur": 65,
        },
        {
            "id": "f-tel",
            "operator_id": "farlight",
            "name": "FLO Optical Telescope",
            "type": "telescope",
            "x": 2000,
            "y": -2000,
            "value_meur": 90,
        },
    ],
    "plans": [],
    "notices": [],
}


# The implementation lives behind the existing Store interface.
from .database import Store
