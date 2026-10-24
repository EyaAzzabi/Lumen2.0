"""Reference physics model of rocket-plume ejecta on the Moon.

This is the slow "ground truth" that the AI surrogate learns from.

Model (deliberately simple, every assumption is explicit):
- During the final low-altitude phase the engine erodes regolith at a rate
  proportional to thrust (calibrated so an Apollo-class lander, 15 kN for
  60 s, erodes ~2 t, the order of magnitude measured for Apollo and
  Chandrayaan-3).
- Eroded mass splits into four size classes. Each class leaves the surface
  at a shallow angle (1-12 deg) with a log-normal speed distribution; smaller
  grains are dragged to higher speeds by the gas.
- No atmosphere: once ejected, grains fly on pure ballistic arcs under lunar
  gravity (1.62 m/s^2) and keep their speed until impact. Grains faster than
  lunar orbital speed (~1.68 km/s) never come back down.
- Terrain between the landing site and a target blocks any trajectory that
  dips below the ground.

For a target (a vertical surface of height h at distance d) we integrate
analytically over speed and numerically over launch angle, giving the mass and
kinetic energy hitting each square metre of the target's exposed face.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.special import ndtr

G_MOON = 1.62
V_ORBIT = 1_680.0
T_REF_KN = 15.0
EROSION_KG_PER_S_AT_REF = 33.0
SPEED_EXPONENT = 0.15


@dataclass(frozen=True)
class SizeClass:
    name: str
    diameter_m: float
    mass_fraction: float
    v_median: float  # m/s at reference thrust
    v_sigma: float  # log-normal shape
    theta_min_deg: float
    theta_max_deg: float
    coarse: bool


SIZE_CLASSES = (
    SizeClass("dust", 30e-6, 0.55, 1_100.0, 0.35, 0.3, 3.0, False),
    SizeClass("sand", 300e-6, 0.33, 220.0, 0.40, 0.5, 4.0, False),
    SizeClass("gravel", 4e-3, 0.10, 35.0, 0.45, 2.0, 7.0, True),
    SizeClass("rock", 3e-2, 0.02, 8.0, 0.50, 3.0, 12.0, True),
)


@dataclass(frozen=True)
class Lander:
    thrust_kn: float
    hover_s: float

    @property
    def eroded_mass_kg(self) -> float:
        return EROSION_KG_PER_S_AT_REF * (self.thrust_kn / T_REF_KN) * self.hover_s

    @property
    def speed_scale(self) -> float:
        return (self.thrust_kn / T_REF_KN) ** SPEED_EXPONENT


def _partial_moment(n, mu, sigma, lo, hi):
    """E[V^n ; lo < V < hi] for V ~ LogNormal(mu, sigma)."""
    with np.errstate(divide="ignore"):
        a = (np.log(lo) - mu - n * sigma**2) / sigma
        b = (np.log(hi) - mu - n * sigma**2) / sigma
    return np.exp(n * mu + 0.5 * n**2 * sigma**2) * (ndtr(b) - ndtr(a))


def exposure(lander: Lander, xs, zs, za, d, height, n_theta: int = 32):
    """Ejecta hitting vertical targets.

    xs, zs: (P, K) terrain profile (along-track distance, height relative to
    the launch point). za: (P,) target base height relative to the launch
    point. d: (P,) distance. height: (P,) or scalar target height.

    Returns dict of (P,) arrays: mass fluence and kinetic-energy fluence per
    size class plus totals (kg/m^2 and J/m^2 of exposed face).
    """
    d = np.maximum(np.asarray(d, dtype=np.float64), 1.0)
    za = np.asarray(za, dtype=np.float64)
    h = np.broadcast_to(np.asarray(height, dtype=np.float64), d.shape)
    out: dict[str, np.ndarray] = {}
    e_total = np.zeros_like(d)
    e_coarse = np.zeros_like(d)
    m_total = np.zeros_like(d)
    for c in SIZE_CLASSES:
        mass = lander.eroded_mass_kg * c.mass_fraction
        mu = np.log(c.v_median * lander.speed_scale)
        theta = np.radians(
            np.linspace(c.theta_min_deg, c.theta_max_deg, n_theta + 1)[:-1]
            + (c.theta_max_deg - c.theta_min_deg) / (2 * n_theta)
        )
        tan_t = np.tan(theta)[None, :]
        cos2 = np.cos(theta)[None, :] ** 2
        dd = d[:, None]
        rise = dd * tan_t  # height a straight line would reach at the target
        # Speed at which the arc crosses the target at height Y:
        #   Y = d tan(t) - g d^2 / (2 v^2 cos^2 t)
        with np.errstate(divide="ignore", invalid="ignore"):
            gap_lo = rise - za[:, None]
            gap_hi = rise - (za + h)[:, None]
            v_lo = np.sqrt(G_MOON * dd**2 / (2 * cos2 * gap_lo))
            v_hi = np.where(gap_hi > 0, np.sqrt(G_MOON * dd**2 / (2 * cos2 * gap_hi)), np.inf)
        reachable = gap_lo > 0
        v_lo = np.where(reachable, v_lo, V_ORBIT)
        v_hi = np.minimum(v_hi, V_ORBIT)
        valid = reachable & (v_hi > v_lo)
        v_lo = np.where(valid, v_lo, 1.0)
        v_hi = np.where(valid, v_hi, 1.0)

        # Terrain blocking, tested with a representative speed in the window.
        v_rep = np.sqrt(v_lo * v_hi)
        x = xs[:, None, :]
        y = x * tan_t[..., None] - G_MOON * x**2 / (2 * v_rep[..., None] ** 2 * cos2[..., None])
        blocked = (y < zs[:, None, :] - 0.5).any(axis=-1)
        open_ = valid & ~blocked

        p = np.where(open_, _partial_moment(0, mu, c.v_sigma, v_lo, v_hi), 0.0).mean(axis=1)
        v2 = np.where(open_, _partial_moment(2, mu, c.v_sigma, v_lo, v_hi), 0.0).mean(axis=1)
        # Mass heading into the target's azimuth wedge, spread over its face.
        geom = mass / (2 * np.pi * d * h)
        m_flu = geom * p
        e_flu = geom * 0.5 * v2
        out[f"mass_{c.name}"] = m_flu
        out[f"energy_{c.name}"] = e_flu
        m_total += m_flu
        e_total += e_flu
        if c.coarse:
            e_coarse += e_flu
    out["mass_total"] = m_total
    out["energy_total"] = e_total
    out["energy_coarse"] = e_coarse
    return out


def max_range_m(lander: Lander) -> float:
    """Distance beyond which essentially no dust lands (for display)."""
    c = SIZE_CLASSES[0]
    v = min(c.v_median * lander.speed_scale * np.exp(2 * c.v_sigma), V_ORBIT)
    return float(v**2 * np.sin(2 * np.radians(c.theta_max_deg)) / G_MOON)
