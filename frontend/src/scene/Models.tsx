import { useMemo } from "react";
import { CylinderGeometry, Quaternion, Vector3 } from "three";

function Strut({
  from,
  to,
  radius = 0.014,
  color = "#a5a7ab",
}: {
  from: number[];
  to: number[];
  radius?: number;
  color?: string;
}) {
  const { geometry, position, quaternion } = useMemo(() => {
    const a = new Vector3(...(from as [number, number, number])),
      b = new Vector3(...(to as [number, number, number]));
    const geometry = new CylinderGeometry(radius, radius, a.distanceTo(b), 6);
    const position = a.clone().add(b).multiplyScalar(0.5);
    const quaternion = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return { geometry, position, quaternion };
  }, [from.join(","), to.join(","), radius]);
  return (
    <mesh
      geometry={geometry}
      position={position}
      quaternion={quaternion}
      castShadow
    >
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.4} />
    </mesh>
  );
}

// Keep geometry self-contained: no external GLTF or runtime asset dependencies.

export function LanderModel({ exhaust = false }: { exhaust?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.21, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.17, 0.22, 8]} />
        <meshStandardMaterial
          color="#d4c4a6"
          metalness={0.65}
          roughness={0.4}
        />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i * Math.PI) / 4;
        return (
          <group
            key={i}
            position={[Math.sin(angle) * 0.146, 0.215, Math.cos(angle) * 0.146]}
            rotation={[0, angle, 0]}
          >
            <mesh>
              <boxGeometry args={[0.095, 0.12, 0.008]} />
              <meshStandardMaterial
                color={i % 2 ? "#bca26d" : "#c8b589"}
                metalness={0.45}
                roughness={0.55}
              />
            </mesh>
            {[-0.025, 0, 0.025].map((x) => (
              <mesh key={x} position={[x, 0, 0.005]}>
                <boxGeometry args={[0.002, 0.105, 0.002]} />
                <meshStandardMaterial color="#685f4c" roughness={0.8} />
              </mesh>
            ))}
          </group>
        );
      })}
      <mesh position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.095, 0.12, 0.15, 8]} />
        <meshStandardMaterial
          color="#dadfe3"
          metalness={0.65}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0.48, 0]} castShadow>
        <sphereGeometry args={[0.095, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e3e8ed" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.4, 0.11]}>
        <boxGeometry args={[0.105, 0.055, 0.014]} />
        <meshStandardMaterial
          color="#101e29"
          metalness={0.8}
          roughness={0.15}
        />
      </mesh>
      <mesh position={[0, 0.075, 0]}>
        <cylinderGeometry args={[0.035, 0.07, 0.1, 16]} />
        <meshStandardMaterial
          color="#2b3037"
          metalness={0.8}
          roughness={0.35}
        />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4,
          x = Math.cos(a),
          z = Math.sin(a);
        return (
          <group key={i}>
            <Strut
              from={[x * 0.11, 0.23, z * 0.11]}
              to={[x * 0.28, 0.025, z * 0.28]}
              color="#c5aa76"
            />
            <Strut
              from={[x * 0.13, 0.12, z * 0.13]}
              to={[x * 0.28, 0.025, z * 0.28]}
              radius={0.009}
            />
            <mesh position={[x * 0.28, 0.015, z * 0.28]}>
              <cylinderGeometry args={[0.065, 0.065, 0.025, 12]} />
              <meshStandardMaterial
                color="#c4a877"
                metalness={0.65}
                roughness={0.55}
              />
            </mesh>
          </group>
        );
      })}
      <Strut from={[0.07, 0.48, 0]} to={[0.07, 0.65, 0]} radius={0.004} />
      <mesh position={[0.07, 0.65, 0]} rotation={[0.3, 0, 0.6]}>
        <sphereGeometry args={[0.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e8edf5" metalness={0.5} side={2} />
      </mesh>
      {exhaust && (
        <group position={[0, -0.11, 0]}>
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
      )}
    </group>
  );
}

function PanelArray() {
  return (
    <group>
      {[-1, 0, 1].map((i) => (
        <group key={i} position={[i * 0.17, 0, 0]}>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.007, 0.01, 0.12, 6]} />
            <meshStandardMaterial color="#a6a8aa" />
          </mesh>
          <group position={[0, 0.13, 0]} rotation={[-0.45, 0, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.15, 0.012, 0.27]} />
              <meshStandardMaterial
                color="#182b45"
                metalness={0.65}
                roughness={0.28}
              />
            </mesh>
            {[-1, 0, 1].map((k) => (
              <mesh key={k} position={[0, 0.008, k * 0.07]}>
                <boxGeometry args={[0.145, 0.002, 0.002]} />
                <meshBasicMaterial color="#6b90a8" />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}

export function InfrastructureModel({ type }: { type: string }) {
  if (type === "solar_array") return <PanelArray />;
  if (type === "habitat")
    return (
      <group>
        {[-0.13, 0.13].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.09, 0]} castShadow>
              <sphereGeometry
                args={[0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]}
              />
              <meshStandardMaterial
                color="#d8dbdd"
                roughness={0.6}
                metalness={0.35}
              />
            </mesh>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 16]} />
              <meshStandardMaterial
                color="#a1a3a7"
                metalness={0.5}
                roughness={0.6}
              />
            </mesh>
            <mesh position={[0, 0.085, 0.145]}>
              <boxGeometry args={[0.07, 0.08, 0.016]} />
              <meshStandardMaterial
                color="#d4a268"
                emissive="#a2692c"
                emissiveIntensity={0.4}
              />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.25, 0.09, 0.1]} />
          <meshStandardMaterial color="#9c9e9f" />
        </mesh>
      </group>
    );
  if (type === "comms_relay" || type === "telescope")
    return (
      <group>
        <mesh position={[0, 0.15, 0]} castShadow>
          <cylinderGeometry args={[0.015, 0.055, 0.3, 8]} />
          <meshStandardMaterial
            color="#bac0c4"
            metalness={0.6}
            roughness={0.45}
          />
        </mesh>
        <mesh position={[0, 0.32, 0]} rotation={[0.8, 0, 0.2]} castShadow>
          <sphereGeometry
            args={[0.14, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]}
          />
          <meshStandardMaterial
            color="#d9dce0"
            side={2}
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
        <Strut from={[0, 0.29, 0.04]} to={[0, 0.44, 0.2]} radius={0.006} />
        <mesh position={[0.1, 0.01, 0]}>
          <boxGeometry args={[0.1, 0.06, 0.12]} />
          <meshStandardMaterial color="#afa798" />
        </mesh>
      </group>
    );
  if (type === "rover")
    return (
      <group>
        <mesh position={[0, 0.08, 0]} castShadow>
          <boxGeometry args={[0.2, 0.08, 0.14]} />
          <meshStandardMaterial
            color="#c3bca9"
            metalness={0.4}
            roughness={0.6}
          />
        </mesh>
        {[-1, 1].flatMap((x) =>
          [-1, 0, 1].map((z) => (
            <mesh
              key={`${x}${z}`}
              position={[x * 0.12, 0.04, z * 0.085]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.04, 0.04, 0.035, 10]} />
              <meshStandardMaterial color="#44474b" />
            </mesh>
          )),
        )}
        <Strut from={[0.05, 0.1, 0]} to={[0.05, 0.25, 0]} radius={0.006} />
        <mesh position={[0.05, 0.25, 0]}>
          <boxGeometry args={[0.06, 0.04, 0.04]} />
          <meshStandardMaterial color="#deded8" />
        </mesh>
      </group>
    );
  return (
    <group>
      <mesh position={[0, 0.11, 0]} castShadow>
        <boxGeometry args={[0.3, 0.22, 0.2]} />
        <meshStandardMaterial
          color="#a7a6a0"
          metalness={0.45}
          roughness={0.65}
        />
      </mesh>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.22, 12]} />
          <meshStandardMaterial
            color="#dad9d0"
            metalness={0.7}
            roughness={0.35}
          />
        </mesh>
      ))}
      <PanelArray />
    </group>
  );
}
