import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, useTexture } from "@react-three/drei";
import {
  Color,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  SRGBColorSpace,
} from "three";
import { elevationAt, useMission } from "../mission";
import { RISK_COLOR } from "../api";

export function RegolithRocks() {
  const terrain = useMission((s) => s.terrain),
    assets = useMission((s) => s.assets),
    low = useMission((s) => s.lowGraphics),
    visible = useMission((s) => s.layers.terrain),
    ref = useRef<InstancedMesh>(null);
  const rocks = useMemo(() => {
    let seed = 347;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: low ? 450 : 2100 }, () => {
      const x = (rnd() - 0.5) * 25,
        y = (rnd() - 0.5) * 25,
        s = 0.008 + Math.pow(rnd(), 4) * 0.065;
      return {
        x,
        y,
        h: elevationAt(terrain, x * 1000, y * 1000),
        s,
        rotation: rnd() * Math.PI * 2,
        shade: 0.08 + rnd() * 0.14,
      };
    }).filter((p) =>
      assets.every((a) => Math.hypot(a.x - p.x * 1000, a.y - p.y * 1000) > 420),
    );
  }, [terrain, assets, low]);
  useEffect(() => {
    if (!ref.current) return;
    const dummy = new Object3D();
    rocks.forEach((r, i) => {
      dummy.position.set(r.x, r.h + r.s * 0.3, -r.y);
      dummy.rotation.set(r.rotation, 0.5 + r.rotation, r.rotation * 0.3);
      dummy.scale.set(r.s * 1.5, r.s * 0.65, r.s);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(
        i,
        new Color(r.shade, r.shade * 1.015, r.shade * 1.04),
      );
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [rocks]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, rocks.length]}
      visible={visible}
      castShadow={!low}
      receiveShadow
      raycast={() => {}}
    >
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={0.99} metalness={0.04} flatShading />
    </instancedMesh>
  );
}

export function LandingLocator() {
  const site = useMission((s) => s.site),
    terrain = useMission((s) => s.terrain),
    assessment = useMission((s) => s.assessment),
    busy = useMission((s) => s.busy),
    mode = useMission((s) => s.mode),
    layers = useMission((s) => s.layers);
  const spinning = useRef<Group>(null),
    pulse = useRef<Mesh>(null);
  const color = assessment
    ? RISK_COLOR[assessment.summary.worst_risk]
    : "#65d9ff";
  useFrame(({ clock }, delta) => {
    if (useMission.getState().reducedMotion) return;
    if (spinning.current) spinning.current.rotation.y += delta * 0.15;
    if (pulse.current) {
      const v = 1 + (Math.sin(clock.elapsedTime * 1.3) + 1) * 0.12;
      pulse.current.scale.set(v, v, 1);
    }
  });
  if (mode === "setup" || !layers.zones) return null;
  const height = elevationAt(terrain, site.x, site.y) + 0.045;
  return (
    <group position={[site.x / 1000, height, -site.y / 1000]}>
      <group ref={spinning}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, (i * Math.PI) / 2]}>
            <ringGeometry args={[0.61, 0.625, 40, 1, 0, 0.85]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.8}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.73, 0.735, 96]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((y) => (
          <group key={`${x}${y}`} position={[x * 0.48, 0.02, y * 0.48]}>
            <mesh>
              <cylinderGeometry args={[0.012, 0.025, 0.1, 8]} />
              <meshStandardMaterial color="#aeb7c2" />
            </mesh>
            <mesh position={[0, 0.06, 0]}>
              <sphereGeometry args={[0.017, 10, 8]} />
              <meshBasicMaterial color="#9eeaff" />
            </mesh>
          </group>
        )),
      )}
      {busy === "optimizer" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.1, 1.115, 100]} />
          <meshBasicMaterial color="#65d9ff" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

export function OwnershipLinks() {
  const assets = useMission((s) => s.assets),
    terrain = useMission((s) => s.terrain),
    style = useMission((s) => s.sceneStyle);
  const lines = useMemo(() => {
    const out: { key: string; points: [number, number, number][] }[] = [];
    assets.forEach((a, i) => {
      const b = assets
        .slice(i + 1)
        .find((b) => b.operator_id === a.operator_id);
      if (b)
        out.push({
          key: a.id,
          points: Array.from({ length: 26 }, (_, k) => {
            const t = k / 25,
              x = a.x + (b.x - a.x) * t,
              y = a.y + (b.y - a.y) * t;
            return [
              x / 1000,
              elevationAt(terrain, x, y) + 0.05 + Math.sin(t * Math.PI) * 0.04,
              -y / 1000,
            ];
          }),
        });
    });
    return out;
  }, [assets, terrain]);
  if (style !== "infrastructure") return null;
  return (
    <group>
      {lines.map((l) => (
        <Line
          key={l.key}
          points={l.points}
          color="#65d9ff"
          transparent
          opacity={0.65}
          lineWidth={1.3}
          dashed
          dashSize={0.06}
          gapSize={0.04}
        />
      ))}
    </group>
  );
}

export function InspectionPad() {
  const site = useMission((s) => s.site),
    terrain = useMission((s) => s.terrain),
    spinning = useRef<Group>(null);
  useFrame((_, delta) => {
    if (spinning.current && !useMission.getState().reducedMotion)
      spinning.current.rotation.y += delta * 0.09;
  });
  return (
    <group
      position={[
        site.x / 1000,
        elevationAt(terrain, site.x, site.y) - 0.025,
        -site.y / 1000,
      ]}
    >
      <mesh receiveShadow>
        <cylinderGeometry args={[0.78, 0.82, 0.045, 96]} />
        <meshStandardMaterial color="#192331" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.72, 0.73, 96]} />
        <meshBasicMaterial color="#e9bd83" />
      </mesh>
      <group ref={spinning} position={[0, 0.03, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh rotation={[-Math.PI / 2, 0, (i * Math.PI) / 2]} key={i}>
            <ringGeometry args={[0.77, 0.79, 40, 1, 0, 0.35]} />
            <meshBasicMaterial color="#65d9ff" />
          </mesh>
        ))}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]}>
        <ringGeometry args={[0.5, 0.503, 96]} />
        <meshBasicMaterial color="#9db7c6" transparent opacity={0.25} />
      </mesh>
      <pointLight
        position={[0, 0.1, 0.65]}
        intensity={1.5}
        color="#e9bd83"
        distance={2}
      />
    </group>
  );
}

export function DistantEarth() {
  const texture = useTexture("/earth.png");
  texture.colorSpace = SRGBColorSpace;
  return (
    <group position={[-6, 4.2, -25]} rotation={[0.2, 0.6, -0.3]}>
      <mesh>
        <sphereGeometry args={[2.3, 48, 32]} />
        <meshStandardMaterial
          map={texture}
          roughness={1}
          emissive="#1a3455"
          emissiveIntensity={0.18}
        />
      </mesh>
      <directionalLight
        position={[-10, 8, 10]}
        intensity={0.35}
        color="#b9d8ff"
      />
    </group>
  );
}
