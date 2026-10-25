"""From ejecta fluence to damage and money.

Three damage mechanisms, each saturating exponentially (1 - exp(-x/scale)):
- erosion: sandblasting of exposed surfaces, driven by total kinetic energy
  fluence (J/m^2);
- impact: dents and punctures from gravel and rocks, driven by coarse-particle
  kinetic energy fluence (J/m^2);
- coating: fine dust deposited on optical / photovoltaic surfaces, driven by
  fine-particle mass fluence (kg/m^2).

Sensitivities per asset type are engineering estimates for the prototype and
are the obvious thing to replace with test data.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .physics import Lander, exposure


@dataclass(frozen=True)
class AssetType:
    key: str
    label: str
    erosion_scale_j_m2: float  # J/m^2
    impact_scale_j_m2: float  # J/m^2 (gravel + rock)
    coating_scale_kg_m2: float | None  # kg/m^2 of fine dust, None if insensitive
    default_height_m: float

    # Deprecated API/source aliases: these are NOT 50-percent thresholds.
    @property
    def erosion_50(self):
        return self.erosion_scale_j_m2

    @property
    def impact_50(self):
        return self.impact_scale_j_m2

    @property
    def coating_50(self):
        return self.coating_scale_kg_m2


ASSET_TYPES = {
    t.key: t
    for t in (
        AssetType("habitat", "Habitat", 3e5, 2_000, None, 6.0),
        AssetType("solar_array", "Solar array", 5e4, 500, 0.10, 4.0),
        AssetType("isru_plant", "ISRU plant", 1.5e5, 1_000, 0.50, 5.0),
        AssetType("comms_relay", "Comms relay", 4e4, 400, 0.08, 8.0),
        AssetType("telescope", "Telescope", 1.5e4, 150, 0.02, 5.0),
        AssetType("rover", "Rover", 1e5, 800, 0.30, 2.5),
    )
}

RISK_BANDS = (
    (0.005, "negligible"),
    (0.03, "low"),
    (0.15, "elevated"),
    (1.01, "critical"),
)


def risk_level(fraction: float) -> str:
    for limit, name in RISK_BANDS:
        if fraction < limit:
            return name
    return "critical"


def damage_fraction(
    asset_type: AssetType, flu: dict[str, np.ndarray]
) -> dict[str, np.ndarray]:
    erosion = 1 - np.exp(-flu["energy_total"] / asset_type.erosion_scale_j_m2)
    impact = 1 - np.exp(-flu["energy_coarse"] / asset_type.impact_scale_j_m2)
    if asset_type.coating_scale_kg_m2 is None:
        coating = np.zeros_like(erosion)
    else:
        fine = flu["mass_dust"] + flu["mass_sand"]
        coating = 1 - np.exp(-fine / asset_type.coating_scale_kg_m2)
    total = 1 - (1 - erosion) * (1 - impact) * (1 - coating)
    return {"erosion": erosion, "impact": impact, "coating": coating, "total": total}


def landing_samples(site_x, site_y, dispersion_m, n_samples=48, seed=0):
    from .terrain import HALF

    if n_samples < 1 or not np.isfinite(dispersion_m) or dispersion_m < 0:
        raise ValueError("Invalid sampling parameters")
    rng = np.random.default_rng(seed)
    offsets = np.vstack(
        [[0.0, 0.0], rng.normal(0, dispersion_m, size=(n_samples - 1, 2))]
    )
    sx, sy = site_x + offsets[:, 0], site_y + offsets[:, 1]
    valid = (np.abs(sx) <= HALF) & (np.abs(sy) <= HALF)
    if not valid.any():
        raise ValueError("No touchdown samples inside terrain")
    return (
        sx[valid],
        sy[valid],
        {
            "requested_samples": n_samples,
            "valid_samples": int(valid.sum()),
            "excluded_samples": int((~valid).sum()),
            "seed": seed,
            "dispersion_m": dispersion_m,
            "distribution": "nominal plus independent Gaussian x/y offsets",
            "boundary_policy": "exclude out-of-domain samples; conditional in-domain estimate",
            "quantiles_are_confidence_intervals": False,
        },
    )


def assess_assets(
    terrain,
    lander: Lander,
    dispersion_m: float,
    site_x: float,
    site_y: float,
    assets: list[dict],
    n_samples: int = 48,
    seed: int = 0,
) -> list[dict]:
    """Damage for each asset, averaged over the lander's landing dispersion."""
    if not assets:
        return []
    sx, sy, sampling = landing_samples(site_x, site_y, dispersion_m, n_samples, seed)
    results = []
    for a in assets:
        atype = ASSET_TYPES[a["type"]]
        xs, zs, za, d = terrain.profiles(
            sx, sy, np.full_like(sx, a["x"]), np.full_like(sy, a["y"])
        )
        flu = exposure(
            lander, xs, zs, za, d, a.get("height_m") or atype.default_height_m
        )
        dmg = damage_fraction(atype, flu)
        mean = {k: float(v.mean()) for k, v in dmg.items()}
        nominal_d = float(d[0])
        frac = mean["total"]
        results.append(
            {
                "asset_id": a["id"],
                "distance_m": nominal_d,
                "shielded": bool(flu["energy_total"][0] < 1e-6 and nominal_d < 20_000),
                "damage_fraction": frac,
                "uncertainty": {
                    **sampling,
                    "mean_damage": frac,
                    "nominal_damage": float(dmg["total"][0]),
                    "q05": float(np.quantile(dmg["total"], 0.05)),
                    "q50": float(np.quantile(dmg["total"], 0.5)),
                    "q95": float(np.quantile(dmg["total"], 0.95)),
                    "worst_sample_damage": float(dmg["total"].max()),
                },
                "mechanisms": {k: mean[k] for k in ("erosion", "impact", "coating")},
                "expected_loss_meur": frac * a["value_meur"],
                "risk": risk_level(frac),
                "energy_fluence_j_m2": float(flu["energy_total"].mean()),
                "dust_mass_g_m2": float(
                    (flu["mass_dust"] + flu["mass_sand"]).mean() * 1000
                ),
            }
        )
    return results
