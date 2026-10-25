"""Explicit provenance, not a claim of empirical validation."""

from dataclasses import asdict
from .damage import ASSET_TYPES

MODEL_VERSION = "plume-ballistic-2.0-scale-semantics"


def provenance(terrain):
    return {
        "model_version": MODEL_VERSION,
        "terrain": {
            "source": "procedural synthetic demo",
            "seed": terrain.seed,
            "version": "synthetic-v1",
            "native_resolution_m": 50,
            "render_mesh_resolution_m": 150,
            "size_m": 30000,
            "lookup_boundary_policy": "clamp to edge; invalid footprint pixels masked",
        },
        "quantity": "modeled damage fraction",
        "units": "dimensionless",
        "failure_probability": False,
        "vulnerability": [asdict(t) for t in ASSET_TYPES.values()],
        "assumptions": [
            "erosion_kg=33*(thrust_kN/15)*hover_s: illustrative engineering scaling",
            "four fixed mass fractions; lognormal speeds; uniform launch-angle bins",
            "constant lunar g=1.62 m/s2; flat local ballistics, no gas/particle coupling",
            "1680 m/s truncation is a legacy modeling assumption, not an escape criterion",
            "32 angle bins; 40 terrain samples; representative-speed terrain blocking with 0.5m tolerance",
            "azimuthally uniform ejecta; vertical exposed faces; no real CAD orientation",
            "damage=1-exp(-exposure/scale); scales are NOT 50-percent thresholds",
            "damage sensitivity and monetary values are illustrative, not calibrated failure probabilities",
        ],
        "validation": "software consistency tests only; not experimentally validated",
        "calibration_references": [],
    }
