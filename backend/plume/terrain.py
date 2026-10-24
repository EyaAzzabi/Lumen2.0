"""Synthetic lunar south-pole terrain.

The heightmap is procedurally generated (clearly labelled demo data): one large
polar crater, a connecting ridge where operators cluster for sunlight, smaller
craters and fractal roughness. Coordinates are local metres, origin at the map
centre, x pointing east and y pointing north.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

SIZE_M = 30_000.0
RES_M = 50.0
N = int(SIZE_M / RES_M)
HALF = SIZE_M / 2


def _fractal_noise(rng: np.random.Generator, n: int, beta: float = 3.3) -> np.ndarray:
    freqs = np.fft.fftfreq(n)
    fx, fy = np.meshgrid(freqs, freqs)
    f = np.hypot(fx, fy)
    f[0, 0] = 1.0
    spectrum = (rng.normal(size=(n, n)) + 1j * rng.normal(size=(n, n))) / f ** (beta / 2)
    spectrum[0, 0] = 0
    noise = np.real(np.fft.ifft2(spectrum))
    return noise / noise.std()


def _crater(X, Y, cx, cy, r, depth, rim):
    d = np.hypot(X - cx, Y - cy) / r
    bowl = np.where(d < 1, -depth * (1 - d**2) + rim, 0.0)
    outside = np.where(d >= 1, rim * np.exp(-((d - 1) / 0.35) ** 2), 0.0)
    return bowl + outside


def generate(seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    coords = (np.arange(N) + 0.5) * RES_M - HALF
    X, Y = np.meshgrid(coords, coords)  # row index = y (south -> north)

    z = 30.0 * _fractal_noise(rng, N) + 3.0 * _fractal_noise(rng, N, beta=2.0)
    # Large polar crater in the south-west.
    z += _crater(X, Y, -8_500, -6_500, 7_000, 2_100, 320)
    # Connecting ridge running north-east from the crater rim: the sunlit
    # high ground where everyone wants to build.
    t = ((X + 2_000) * 0.7 + (Y + 1_000) * 0.7)
    s = (-(X + 2_000) * 0.7 + (Y + 1_000) * 0.7)
    z += 380 * np.exp(-(s / 2_600) ** 2) * np.exp(-((t - 3_000) / 9_000) ** 2)
    # Scattered secondary craters.
    for _ in range(60):
        cx, cy = rng.uniform(-HALF, HALF, 2)
        r = rng.choice([rng.uniform(120, 400), rng.uniform(400, 1_400)], p=[0.7, 0.3])
        z += _crater(X, Y, cx, cy, r, 0.25 * r, 0.07 * r)
    return z.astype(np.float32)


class Terrain:
    def __init__(self, seed: int = 7):
        self.z = generate(seed)

    def elevation(self, x, y):
        """Bilinear elevation lookup; x, y arrays in metres."""
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        gx = np.clip((x + HALF) / RES_M - 0.5, 0, N - 1.001)
        gy = np.clip((y + HALF) / RES_M - 0.5, 0, N - 1.001)
        i0 = np.floor(gx).astype(int)
        j0 = np.floor(gy).astype(int)
        fx = gx - i0
        fy = gy - j0
        z = self.z
        return (
            z[j0, i0] * (1 - fx) * (1 - fy)
            + z[j0, i0 + 1] * fx * (1 - fy)
            + z[j0 + 1, i0] * (1 - fx) * fy
            + z[j0 + 1, i0 + 1] * fx * fy
        )

    def slope_deg(self, x, y):
        h = RES_M
        dzdx = (self.elevation(np.add(x, h), y) - self.elevation(np.subtract(x, h), y)) / (2 * h)
        dzdy = (self.elevation(x, np.add(y, h)) - self.elevation(x, np.subtract(y, h))) / (2 * h)
        return np.degrees(np.arctan(np.hypot(dzdx, dzdy)))

    def profiles(self, x0, y0, x1, y1, k: int = 40):
        """Terrain along straight paths from launch points to targets.

        Returns (xs, zs, za, d): along-track distances (P, k), terrain heights
        relative to the launch point (P, k), target base height relative to the
        launch point (P,), and path length (P,).
        """
        x0, y0, x1, y1 = (np.atleast_1d(np.asarray(a, dtype=np.float64)) for a in (x0, y0, x1, y1))
        x0, y0, x1, y1 = np.broadcast_arrays(x0, y0, x1, y1)
        d = np.hypot(x1 - x0, y1 - y0)
        z0 = self.elevation(x0, y0)
        frac = np.linspace(0.02, 0.97, k)
        px = x0[:, None] + (x1 - x0)[:, None] * frac
        py = y0[:, None] + (y1 - y0)[:, None] * frac
        zs = self.elevation(px, py) - z0[:, None]
        za = self.elevation(x1, y1) - z0
        return d[:, None] * frac, zs, za, d

    def hillshade_png(self) -> bytes:
        z = self.z.astype(np.float64)
        gy, gx = np.gradient(z, RES_M)
        # Low sun from the north-east (south-pole lighting is always grazing).
        az, alt = np.radians(45), np.radians(25)
        slope = np.arctan(np.hypot(gx, gy))
        aspect = np.arctan2(-gx, gy)
        shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
        shade = np.clip(shade, 0, 1)
        elev = (z - z.min()) / (z.max() - z.min())
        v = 0.18 + 0.62 * shade * (0.55 + 0.45 * elev)
        base = np.array([0.80, 0.82, 0.88])
        rgb = (np.clip(v, 0, 1)[..., None] * base * 255).astype(np.uint8)
        img = Image.fromarray(rgb[::-1])  # row 0 = north at the top
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
