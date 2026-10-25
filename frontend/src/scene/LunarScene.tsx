import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, useTexture } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  Points,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type Group,
} from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { elevationAt, REPLAY_DURATION, useMission } from "../mission";
import type { TerrainMesh } from "../api";
import { RISK_COLOR } from "../api";
import MapView from "../MapView";
import { InfrastructureModel, LanderModel } from "./Models";
import {
  DistantEarth,
  InspectionPad,
  LandingLocator,
  OwnershipLinks,
  RegolithRocks,
} from "./Environment";

function random(seed = 23) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function Starfield() {
  const positions = useMemo(() => {
    const rnd = random();
    return new Float32Array(
      Array.from({ length: 1800 }, () => {
        const a = rnd() * Math.PI * 2,
          c = rnd() * 2 - 1,
          r = 65 + rnd() * 35;
        return [
          Math.sqrt(1 - c * c) * Math.cos(a) * r,
          c * r,
          Math.sqrt(1 - c * c) * Math.sin(a) * r,
        ];
      }).flat(),
    );
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#bdccdc"
        size={0.055}
        transparent
        opacity={0.65}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function OrbitalMoon() {
  const texture = useTexture("/moon.jpg");
  const moon = useRef<Mesh>(null);
  texture.colorSpace = SRGBColorSpace;
  useFrame((_, delta) => {
    if (moon.current && !useMission.getState().reducedMotion)
      moon.current.rotation.y += delta * 0.009;
  });
  const orbit = useMemo(
    () =>
      Array.from({ length: 161 }, (_, i) => {
        const a = (i / 160) * Math.PI * 2;
        return [
          2 + Math.cos(a) * 5.15,
          Math.sin(a) * 0.75,
          -1 + Math.sin(a) * 2.1,
        ] as [number, number, number];
      }),
    [],
  );
  return (
    <group>
      <mesh
        ref={moon}
        position={[2.2, 0.05, -0.7]}
        rotation={[0.16, -0.5, 0.18]}
      >
        <sphereGeometry args={[3.65, 96, 64]} />
        <meshStandardMaterial
          map={texture}
          bumpMap={texture}
          bumpScale={0.035}
          roughness={1}
          color="#b9bdc6"
        />
      </mesh>
      <Line
        points={orbit}
        color="#8c9ba9"
        opacity={0.25}
        transparent
        lineWidth={0.6}
      />
      <mesh position={[1.8, -2.86, 1.15]}>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshBasicMaterial color="#e9bd83" />
      </mesh>
      <directionalLight position={[-5, 5, 7]} intensity={2.1} color="#eef3ff" />
    </group>
  );
}

function regolithTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(512, 512),
    rnd = random(44);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 155 + rnd() * 55;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v + 2;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  for (let i = 0; i < 1000; i++) {
    const x = rnd() * 512,
      y = rnd() * 512,
      r = 0.3 + rnd() * 3;
    ctx.fillStyle = `rgba(60,64,72,${rnd() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = 1000;
  texture.repeat.set(40, 40);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function terrainGeometry(t: TerrainMesh, low: boolean) {
  const stride = low ? 2 : 1,
    n = Math.floor((t.n - 1) / stride) + 1,
    positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      positions.push(
        (t.x_min + i * stride * t.step_m) / 1000,
        t.elevations_m[j * stride * t.n + i * stride] / 1000,
        -(t.y_min + j * stride * t.step_m) / 1000,
      );
      uv.push(i / (n - 1), j / (n - 1));
    }
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      indices.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function TerrainSurface() {
  const terrain = useMission((s) => s.terrain)!;
  const low = useMission((s) => s.lowGraphics),
    visible = useMission((s) => s.layers.terrain);
  const style = useMission((s) => s.sceneStyle);
  const geometry = useMemo(() => terrainGeometry(terrain, low), [terrain, low]);
  const texture = useMemo(regolithTexture, []);
  const hillshade = useTexture("/api/terrain/hillshade.png");
  hillshade.colorSpace = SRGBColorSpace;
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      geometry={geometry}
      receiveShadow
      visible={visible}
      onClick={(e) => {
        if (e.delta > 4 || !useMission.getState().placeMode) return;
        e.stopPropagation();
        useMission.getState().moveSite({
          x: Math.round(e.point.x * 1000),
          y: Math.round(-e.point.z * 1000),
        });
      }}
      onPointerMove={(e) => {
        if (useMission.getState().placeMode) {
          e.stopPropagation();
          document.body.style.cursor = "crosshair";
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <meshStandardMaterial
        map={hillshade}
        bumpMap={texture}
        bumpScale={0.035}
        color={style === "heatmap" ? "#707b8a" : "#eeeef0"}
        roughness={0.98}
        metalness={0.05}
        wireframe={style === "wireframe"}
        flatShading={false}
      />
    </mesh>
  );
}

function FootprintOverlay() {
  const footprint = useMission((s) => s.preview?.footprint ?? s.footprint),
    terrain = useMission((s) => s.terrain),
    visible = useMission((s) => s.layers.hazard);
  const mesh = useRef<Mesh>(null);
  const output = useMemo(() => {
    if (!footprint) return null;
    const { n, values, x_min, x_max, y_min, y_max } = footprint,
      positions: number[] = [],
      uv: number[] = [],
      indices: number[] = [],
      data = new Uint8Array(n * n * 4);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = x_min + ((x_max - x_min) * i) / (n - 1),
          y = y_min + ((y_max - y_min) * j) / (n - 1),
          v = values[j * n + i];
        positions.push(x / 1000, elevationAt(terrain, x, y) + 0.018, -y / 1000);
        uv.push(i / (n - 1), j / (n - 1));
        const color = new Color(
          v < 0.005
            ? "#65d9ff"
            : v < 0.03
              ? "#e9bd83"
              : v < 0.15
                ? "#ff9d4a"
                : "#ff5c44",
        );
        const k = (j * n + i) * 4;
        data[k] = color.r * 255;
        data[k + 1] = color.g * 255;
        data[k + 2] = color.b * 255;
        data[k + 3] =
          footprint.valid_mask?.[j * n + i] === false || v < 0.0005
            ? 0
            : Math.min(210, 55 + Math.log10(1 + v * 1000) * 48);
      }
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        indices.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
      }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    const texture = new DataTexture(data, n, n, RGBAFormat);
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    texture.colorSpace = SRGBColorSpace;
    return { geometry, texture };
  }, [footprint, terrain]);
  useEffect(
    () => () => {
      output?.geometry.dispose();
      output?.texture.dispose();
    },
    [output],
  );
  useFrame(() => {
    if (mesh.current) {
      const s = useMission.getState();
      const replay = s.mode === "simulation" || s.mode === "replay";
      mesh.current.visible = visible && (!replay || s.replay >= 7);
    }
  });
  if (!output) return null;
  return (
    <mesh
      ref={mesh}
      geometry={output.geometry}
      renderOrder={2}
      raycast={() => {}}
    >
      <meshBasicMaterial
        map={output.texture}
        transparent
        opacity={0.48}
        depthWrite={false}
        side={DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function Infrastructure() {
  const assets = useMission((s) => s.assets),
    terrain = useMission((s) => s.terrain),
    results = useMission(
      (s) => (s.preview?.assessment ?? s.assessment)?.assets,
    ),
    selected = useMission((s) => s.selectedAsset);
  const visible = useMission((s) => s.layers.infrastructure);
  const mode = useMission((s) => s.mode),
    filter = useMission((s) => s.registryFilter);
  if (!visible) return null;
  return (
    <group>
      {assets
        .filter(
          (a) =>
            mode !== "registry" ||
            ((filter.operator === "all" || a.operator_id === filter.operator) &&
              (filter.type === "all" || a.type === filter.type) &&
              (filter.region === "all" ||
                (filter.region === "north" ? a.y >= 0 : a.y < 0))),
        )
        .map((a) => {
          const result = results?.find((r) => r.asset_id === a.id),
            color = result ? RISK_COLOR[result.risk] : "#aeb9c6",
            isSelected = selected === a.id;
          return (
            <group
              key={a.id}
              position={[
                a.x / 1000,
                elevationAt(terrain, a.x, a.y) + 0.025,
                -a.y / 1000,
              ]}
            >
              <group
                onClick={(e) => {
                  e.stopPropagation();
                  useMission.getState().selectAsset(a.id);
                }}
                onPointerOver={() => {
                  document.body.style.cursor = "pointer";
                }}
                onPointerOut={() => {
                  document.body.style.cursor = "";
                }}
              >
                <group scale={1.55}>
                  <InfrastructureModel type={a.type} />
                </group>
                <mesh visible={false}>
                  <sphereGeometry args={[0.35, 8, 8]} />
                  <meshBasicMaterial />
                </mesh>
              </group>
              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.008, 0]}
                raycast={() => {}}
              >
                <ringGeometry
                  args={[
                    isSelected ? 0.32 : 0.24,
                    isSelected ? 0.34 : 0.25,
                    48,
                  ]}
                />
                <meshBasicMaterial
                  color={isSelected ? "#65d9ff" : color}
                  transparent
                  opacity={isSelected ? 0.9 : 0.4}
                  depthWrite={false}
                />
              </mesh>
              <Html
                position={[0, 0.82, 0]}
                center
                zIndexRange={[20, 0]}
                style={{ pointerEvents: "none" }}
              >
                <button
                  title={a.name}
                  className={`spatial-label ${isSelected ? "selected" : ""}`}
                  style={{
                    pointerEvents: "auto",
                    borderLeftColor: color,
                    transform:
                      a.id === "a-hab"
                        ? "translate(-40px,-24px)"
                        : a.id === "a-sol"
                          ? "translate(0,12px)"
                          : a.id === "s-sol"
                            ? "translate(40px,-24px)"
                            : undefined,
                  }}
                  onClick={() => useMission.getState().selectAsset(a.id)}
                >
                  <span className="label-dot" style={{ background: color }} />
                  {a.name.replace(" (parked)", "")}
                  <small>{result ? result.risk : "SIMULATED ASSET"}</small>
                </button>
              </Html>
            </group>
          );
        })}
    </group>
  );
}

function LandingSite() {
  const site = useMission((s) => s.preview?.site ?? s.site),
    terrain = useMission((s) => s.terrain),
    dispersion = useMission((s) => s.lander.dispersion_m),
    zones = useMission((s) => s.layers.zones);
  const mode = useMission((s) => s.mode),
    group = useRef<Group>(null),
    exhaust = useRef<Group>(null);
  const h = elevationAt(terrain, site.x, site.y);
  useFrame((_, delta) => {
    const s = useMission.getState(),
      isReplay = s.mode === "simulation" || s.mode === "replay";
    if (group.current)
      group.current.position.y =
        h + (isReplay ? Math.max(0, 1 - s.replay / 12) * 2 : 0);
    if (group.current && s.mode === "setup" && !s.reducedMotion)
      group.current.rotation.y += delta * 0.1;
    if (exhaust.current)
      exhaust.current.visible = isReplay && s.replay >= 4 && s.replay < 14;
  });
  return (
    <group position={[site.x / 1000, 0, -site.y / 1000]}>
      <group
        ref={group}
        position={[0, h, 0]}
        scale={mode === "setup" ? 1.5 : 1.65}
      >
        <LanderModel />
        <group ref={exhaust} position={[0, -0.1, 0]} visible={false}>
          <mesh rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.09, 0.3, 20, 1, true]} />
            <meshBasicMaterial
              color="#b5e8ff"
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </mesh>
          <pointLight color="#c6eaff" intensity={1.8} distance={1.5} />
        </group>
      </group>
      {zones && mode !== "setup" && (
        <group position={[0, h + 0.027, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh raycast={() => {}}>
            <ringGeometry args={[0.42, 0.435, 80]} />
            <meshBasicMaterial color="#65d9ff" transparent opacity={0.9} />
          </mesh>
          <mesh raycast={() => {}}>
            <ringGeometry
              args={[
                Math.max(0.07, dispersion / 1000),
                Math.max(0.07, dispersion / 1000) + 0.012,
                64,
              ]}
            />
            <meshBasicMaterial color="#e9bd83" transparent opacity={0.8} />
          </mesh>
        </group>
      )}
      {mode !== "setup" && (
        <Html position={[0, h + 1.25, 0]} center zIndexRange={[25, 0]}>
          <div className="site-label">
            <span />
            PROPOSED TOUCHDOWN
            <small>
              E {(site.x / 1000).toFixed(2)} · N {(site.y / 1000).toFixed(2)} km
            </small>
          </div>
        </Html>
      )}
    </group>
  );
}

function Candidates() {
  const opt = useMission((s) => s.optimization),
    terrain = useMission((s) => s.terrain),
    visible = useMission((s) => s.layers.candidates);
  const positions = useMemo(
    () =>
      new Float32Array(
        opt?.search.points
          .filter((p) => p[2] !== null)
          .map(([x, y]) => [
            x / 1000,
            elevationAt(terrain, x, y) + 0.04,
            -y / 1000,
          ])
          .flat() ?? [],
      ),
    [opt, terrain],
  );
  if (!opt || !visible) return null;
  const candidates = [
    ...(opt.best
      ? [
          {
            ...opt.best.site,
            expected_loss_meur: opt.best.summary.expected_loss_meur,
          },
        ]
      : []),
    ...opt.alternatives,
  ];
  const min = Math.min(...candidates.map((c) => c.expected_loss_meur)),
    max = Math.max(...candidates.map((c) => c.expected_loss_meur));
  return (
    <group>
      <points raycast={() => {}}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          color="#65d9ff"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </points>
      {candidates.map((c, i) => {
        const color = new Color("#35d7a0").lerp(
          new Color("#ff684a"),
          max === min ? 0 : (c.expected_loss_meur - min) / (max - min),
        );
        const h = elevationAt(terrain, c.x, c.y),
          origin = opt.target.site;
        return (
          <group key={i}>
            <Line
              points={[
                [
                  origin.x / 1000,
                  origin.elevation_m / 1000 + 0.12,
                  -origin.y / 1000,
                ],
                [c.x / 1000, h + 0.12, -c.y / 1000],
              ]}
              color={color}
              transparent
              opacity={0.45}
              lineWidth={1}
              dashed
              dashSize={0.1}
              gapSize={0.08}
            />
            <mesh
              position={[c.x / 1000, h + 0.06, -c.y / 1000]}
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={(e) => {
                e.stopPropagation();
                useMission.getState().moveSite({ x: c.x, y: c.y }, true);
                useMission.getState().focus("site");
              }}
            >
              <ringGeometry args={[0.18, 0.24, 40]} />
              <meshBasicMaterial color={color} side={DoubleSide} />
            </mesh>
            <Html
              position={[c.x / 1000, h + 0.5, -c.y / 1000]}
              center
              zIndexRange={[18, 0]}
            >
              <button
                className="candidate-label"
                style={{
                  transform:
                    i === 1
                      ? "translate(-40px,-18px)"
                      : i === 2
                        ? "translate(40px,10px)"
                        : undefined,
                }}
                onClick={() => {
                  useMission.getState().moveSite({ x: c.x, y: c.y }, true);
                  useMission.getState().focus("site");
                }}
              >
                {i === 0 ? "BEST SITE" : `ALT ${i}`}
                <small>€{c.expected_loss_meur.toFixed(2)}M loss</small>
              </button>
            </Html>
          </group>
        );
      })}
      <Html
        position={[
          opt.target.site.x / 1000,
          opt.target.site.elevation_m / 1000 + 0.4,
          -opt.target.site.y / 1000,
        ]}
        center
        zIndexRange={[15, 0]}
      >
        <div className="origin-label">ORIGINAL SITE</div>
      </Html>
    </group>
  );
}

function Ejecta() {
  const site = useMission((s) => s.site),
    terrain = useMission((s) => s.terrain),
    footprint = useMission((s) => s.footprint),
    low = useMission((s) => s.lowGraphics);
  const ref = useRef<Points>(null),
    n = low ? 240 : 900;
  const data = useMemo(() => {
    const rnd = random(91),
      radius = (footprint?.radius_m ?? 1000) / 1000;
    return Array.from({ length: n }, () => {
      const a = rnd() * Math.PI * 2,
        r = 0.2 + rnd() * radius * 0.65;
      return {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        start: rnd() * 0.4,
        height: 0.02 + rnd() * 0.2,
        h: elevationAt(
          terrain,
          site.x + Math.cos(a) * r * 1000,
          site.y - Math.sin(a) * r * 1000,
        ),
      };
    });
  }, [n, site, terrain, footprint]);
  const positions = useMemo(() => new Float32Array(n * 3), [n]);
  useFrame(() => {
    if (!ref.current) return;
    const s = useMission.getState(),
      active =
        (s.mode === "simulation" || s.mode === "replay") &&
        s.replay >= 7 &&
        s.replay < 23;
    ref.current.visible = active && !s.reducedMotion;
    if (!active) return;
    const origin = elevationAt(terrain, site.x, site.y);
    data.forEach((d, i) => {
      const p = Math.max(0, Math.min(1, (s.replay - 7) / 12 - d.start));
      positions[i * 3] = d.x * p;
      positions[i * 3 + 1] =
        origin + (d.h - origin) * p + Math.sin(p * Math.PI) * d.height + 0.04;
      positions[i * 3 + 2] = d.z * p;
    });
    (ref.current.geometry.attributes.position as BufferAttribute).needsUpdate =
      true;
  });
  return (
    <points
      ref={ref}
      position={[site.x / 1000, 0, -site.y / 1000]}
      frustumCulled={false}
      raycast={() => {}}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color="#e9cba5"
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </points>
  );
}

function CameraRig() {
  const controls = useRef<OrbitControlsType>(null),
    { camera } = useThree();
  const mode = useMission((s) => s.mode),
    view = useMission((s) => s.cameraView),
    tick = useMission((s) => s.cameraTick);
  const viewpoint = useMission((s) => s.viewpoint);
  const destination = useRef({
    position: new Vector3(0, 1, 11),
    target: new Vector3(0, 0, 0),
    moving: true,
  });
  useEffect(() => {
    const s = useMission.getState(),
      a = s.assets.find((a) => a.id === s.selectedAsset);
    let target = new Vector3(
        s.site.x / 1000,
        elevationAt(s.terrain, s.site.x, s.site.y),
        -s.site.y / 1000,
      ),
      offset = new Vector3(9, 9, 12);
    if (mode === "gateway" || mode === "login" || mode === "pricing") {
      target = new Vector3(0.5, 0, 0);
      offset = new Vector3(0, 0.5, 11);
    } else if (view === "overview") {
      if (viewpoint === "crater") {
        target = new Vector3(-7.7, -0.6, 5.8);
        offset = new Vector3(6, 3.6, 8);
      } else if (viewpoint === "ridge") {
        target = new Vector3(-0.5, 0.3, -1.5);
        offset = new Vector3(6.5, 3.8, 7);
      } else {
        target = new Vector3(0, 0.15, 0.7);
        offset = new Vector3(8, 3.2, 10);
      }
    } else if (view === "top") offset = new Vector3(0, 18, 0.01);
    else if (view === "lander") {
      target.y += 0.4;
      offset = new Vector3(1.6, 0.95, 2.2);
    } else if (view === "site") offset = new Vector3(4, 3.2, 5);
    else if (view === "asset" && a) {
      target = new Vector3(
        a.x / 1000,
        elevationAt(s.terrain, a.x, a.y),
        -a.y / 1000,
      );
      offset = new Vector3(1.8, 1.3, 2.2);
    }
    destination.current = {
      position: target.clone().add(offset),
      target,
      moving: true,
    };
    if (s.reducedMotion) {
      camera.position.copy(destination.current.position);
      controls.current?.target.copy(target);
      controls.current?.update();
      destination.current.moving = false;
    }
  }, [mode, view, tick, camera, viewpoint]);
  useFrame((_, delta) => {
    const d = destination.current;
    if (d.moving && controls.current) {
      const a = 1 - Math.exp(-Math.min(delta, 0.1) * 3.5);
      camera.position.lerp(d.position, a);
      controls.current.target.lerp(d.target, a);
      controls.current.update();
      if (camera.position.distanceTo(d.position) < 0.007) d.moving = false;
    }
    const s = useMission.getState();
    if (
      s.tour &&
      !s.reducedMotion &&
      !d.moving &&
      controls.current &&
      ["operations", "optimizer", "registry"].includes(s.mode)
    ) {
      const offset = camera.position.clone().sub(controls.current.target);
      offset.applyAxisAngle(new Vector3(0, 1, 0), Math.min(delta, 0.1) * 0.035);
      camera.position.copy(controls.current.target).add(offset);
      controls.current.update();
    }
    if (s.playing) {
      const replay = Math.min(
        REPLAY_DURATION,
        s.replay + Math.min(delta, 0.1) * s.speed,
      );
      useMission.setState({ replay, playing: replay < REPLAY_DURATION });
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={0.6}
      maxDistance={45}
      maxPolarAngle={Math.PI * 0.485}
      enabled={!["gateway", "login", "pricing"].includes(mode)}
      onStart={() => {
        destination.current.moving = false;
        useMission.setState({ tour: false });
      }}
    />
  );
}

function World() {
  const { scene, gl } = useThree();
  const mode = useMission((s) => s.mode),
    terrain = useMission((s) => s.terrain),
    low = useMission((s) => s.lowGraphics);
  const orbital = ["gateway", "login", "pricing"].includes(mode);
  const placing = useMission((s) => s.placeMode);
  const inspection = mode === "setup" && !placing;
  useEffect(() => {
    scene.background = inspection ? null : new Color("#02060c");
    gl.setClearColor("#02060c", inspection ? 0 : 1);
  }, [inspection, scene, gl]);
  return (
    <>
      {!inspection && <color attach="background" args={["#02060c"]} />}
      {!inspection && <fog attach="fog" args={["#040910", 30, 85]} />}
      <ambientLight
        intensity={orbital ? 0.045 : inspection ? 0.38 : 0.4}
        color="#9aabc2"
      />
      <directionalLight
        position={[8, 5, 10]}
        intensity={orbital ? 0.6 : 3.5}
        color="#f6eddf"
        castShadow={!low && !orbital}
        shadow-mapSize={low ? [512, 512] : [2048, 2048]}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={17}
        shadow-camera-bottom={-17}
        shadow-camera-far={65}
        shadow-bias={-0.0003}
      />
      <Starfield />
      {mode === "setup" && (
        <>
          <hemisphereLight
            intensity={1.2}
            color="#dae6f7"
            groundColor="#66616c"
          />
          <directionalLight
            position={[5, 6, 8]}
            intensity={2.5}
            color="#dae6f7"
          />
        </>
      )}
      {orbital ? (
        <OrbitalMoon />
      ) : (
        terrain && (
          <group>
            {inspection ? (
              <InspectionPad />
            ) : (
              <>
                <TerrainSurface />
                <RegolithRocks />
                <DistantEarth />
              </>
            )}
            {mode !== "setup" && (
              <>
                <FootprintOverlay />
                <Infrastructure />
              </>
            )}
            <LandingSite />
            {!inspection && (
              <>
                <LandingLocator />
                <OwnershipLinks />
              </>
            )}
            {mode !== "setup" && <Candidates />}
            <Ejecta />
            <RegisteredPlans />
          </group>
        )
      )}
      <CameraRig />
      <SceneScale />
    </>
  );
}

function SceneScale() {
  const { camera, size } = useThree();
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.2) return;
    elapsed.current = 0;
    const element = document.querySelector<HTMLElement>(".map-scale"),
      bar = element?.querySelector<HTMLElement>("span"),
      label = element?.querySelector<HTMLElement>("b");
    if (!element || !bar || !label) return;
    const s = useMission.getState(),
      origin = new Vector3(
        s.site.x / 1000,
        elevationAt(s.terrain, s.site.x, s.site.y),
        -s.site.y / 1000,
      );
    const a = origin.clone().project(camera),
      b = origin
        .clone()
        .add(new Vector3(1, 0, 0))
        .project(camera);
    const px = Math.hypot(
      ((a.x - b.x) * size.width) / 2,
      ((a.y - b.y) * size.height) / 2,
    );
    const meters = px > 160 ? 100 : px > 80 ? 500 : 1000;
    bar.style.width = `${(px * meters) / 1000}px`;
    label.textContent = meters === 1000 ? "1 km" : `${meters} m`;
  });
  return null;
}

function RegisteredPlans() {
  const plans = useMission((s) => s.plans),
    terrain = useMission((s) => s.terrain),
    mode = useMission((s) => s.mode);
  if (mode !== "registry" && mode !== "notices") return null;
  return (
    <group>
      {plans.map((p) => (
        <group
          key={p.id}
          position={[
            p.site.x / 1000,
            elevationAt(terrain, p.site.x, p.site.y) + 0.04,
            -p.site.y / 1000,
          ]}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.25, 0.28, 40]} />
            <meshBasicMaterial color="#e9bd83" transparent opacity={0.6} />
          </mesh>
          <Html position={[0, 0.2, 0]} center zIndexRange={[12, 0]}>
            <span className="origin-label">{p.id}</span>
          </Html>
        </group>
      ))}
    </group>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function OperationalFallback() {
  const meta = useMission((s) => s.meta),
    assets = useMission((s) => s.assets),
    operators = useMission((s) => s.operators),
    site = useMission((s) => s.preview?.site ?? s.site),
    footprint = useMission((s) => s.preview?.footprint ?? s.footprint),
    assessment = useMission((s) => s.preview?.assessment ?? s.assessment),
    mode = useMission((s) => s.mode),
    place = useMission((s) => s.placeMode);
  return (
    <div className="fallback-map">
      {mode === "gateway" ? (
        <img
          className="fallback-brand"
          src="/plume-logo.jpg"
          alt="PLUME lunar mission artwork"
        />
      ) : (
        meta && (
          <MapView
            meta={meta}
            assets={assets}
            operators={operators}
            site={site}
            footprint={footprint}
            results={assessment?.assets}
            onSiteChange={(p) => {
              if (place) useMission.getState().moveSite(p);
            }}
          />
        )
      )}
      <div className="graphics-warning">
        2D graphics mode · real backend analysis remains available
      </div>
    </div>
  );
}

export default function LunarScene() {
  const [lost, setLost] = useState(false),
    terrainError = useMission((s) => s.terrainError),
    mode = useMission((s) => s.mode),
    low = useMission((s) => s.lowGraphics);
  const [supported] = useState(() => {
    try {
      const c = document.createElement("canvas");
      return !!c.getContext("webgl2");
    } catch {
      return false;
    }
  });
  if (!supported || lost || (terrainError && mode !== "gateway"))
    return <OperationalFallback />;
  return (
    <SceneBoundary fallback={<OperationalFallback />}>
      <Suspense
        fallback={
          <div className="scene-loading">
            <span className="spin" />
            Preparing lunar environment
          </div>
        }
      >
        <Canvas
          frameloop={mode === "gateway" ? "demand" : "always"}
          shadows={!low}
          dpr={low ? 1 : [1, 1.6]}
          camera={{ position: [0, 1, 11], fov: 43, near: 0.02, far: 180 }}
          gl={{
            antialias: !low,
            powerPreference: low ? "low-power" : "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              setLost(true);
            });
          }}
          fallback={
            <span>
              3D rendering is unavailable. The operational map will be used.
            </span>
          }
        >
          <World />
        </Canvas>
      </Suspense>
    </SceneBoundary>
  );
}
