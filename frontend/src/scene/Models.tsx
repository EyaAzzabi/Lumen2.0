import { useMemo } from "react";
import { CanvasTexture, CylinderGeometry, Quaternion, Vector3 } from "three";

function Strut({
  from,
  to,
  radius = 0.008,
  color = "#b6c2ce",
}: {
  from: number[];
  to: number[];
  radius?: number;
  color?: string;
}) {
  const { geometry, position, quaternion } = useMemo(() => {
    const a = new Vector3(...(from as [number, number, number])),
      b = new Vector3(...(to as [number, number, number]));
    return {
      geometry: new CylinderGeometry(radius, radius, a.distanceTo(b), 7),
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      ),
    };
  }, [from.join(","), to.join(","), radius]);
  return (
    <mesh
      geometry={geometry}
      position={position}
      quaternion={quaternion}
      castShadow
    >
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.35} />
    </mesh>
  );
}

function FoilMaterial() {
  const map = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!,
      d = ctx.createImageData(128, 128);
    let seed = 91;
    for (let i = 0; i < d.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const n = seed / 2147483647,
        v = 125 + n * 110;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = 1000;
    t.repeat.set(3, 3);
    return t;
  }, []);
  return (
    <meshStandardMaterial
      color="#b6924e"
      metalness={0.72}
      roughness={0.48}
      bumpMap={map}
      bumpScale={0.0025}
    />
  );
}

export function LanderModel({ exhaust = false }: { exhaust?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.205, 0]} castShadow>
        <boxGeometry args={[0.29, 0.17, 0.265]} />
        <FoilMaterial />
      </mesh>
      <mesh position={[0, 0.298, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.028, 8]} />
        <meshStandardMaterial
          color="#a3abb2"
          metalness={0.75}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, 0.392, -0.015]} castShadow>
        <cylinderGeometry args={[0.105, 0.138, 0.17, 8]} />
        <meshStandardMaterial
          color="#d7dce0"
          metalness={0.4}
          roughness={0.45}
        />
      </mesh>
      <mesh position={[0, 0.493, -0.015]} castShadow>
        <boxGeometry args={[0.16, 0.045, 0.15]} />
        <meshStandardMaterial
          color="#d1d6dc"
          metalness={0.55}
          roughness={0.35}
        />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh
            position={[s * 0.066, 0.425, 0.108]}
            rotation={[0, s * 0.15, 0]}
          >
            <boxGeometry args={[0.07, 0.052, 0.012]} />
            <meshStandardMaterial
              color="#091521"
              metalness={0.5}
              roughness={0.12}
            />
          </mesh>
          <mesh position={[s * 0.066, 0.425, 0.116]}>
            <boxGeometry args={[0.074, 0.056, 0.002]} />
            <meshBasicMaterial color="#6595b5" wireframe />
          </mesh>
          <mesh
            position={[s * 0.17, 0.215, -0.025]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.047, 0.047, 0.16, 16]} />
            <FoilMaterial />
          </mesh>
          {[-1, 1].map((end) => (
            <mesh key={end} position={[s * 0.17 + end * 0.08, 0.215, -0.025]}>
              <sphereGeometry args={[0.047, 12, 10]} />
              <FoilMaterial />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 0.344, 0.126]}>
        <circleGeometry args={[0.034, 20]} />
        <meshStandardMaterial color="#8a949c" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.03, 0.069, 0.12, 24, 1, true]} />
        <meshStandardMaterial
          color="#343b42"
          metalness={0.8}
          roughness={0.3}
          side={2}
        />
      </mesh>
      <mesh position={[0, 0.028, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.071, 24]} />
        <meshStandardMaterial color="#b1b5b4" metalness={0.7} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4,
          x = Math.cos(a),
          z = Math.sin(a);
        return (
          <group key={i}>
            <Strut
              from={[x * 0.13, 0.26, z * 0.13]}
              to={[x * 0.33, 0.035, z * 0.33]}
              radius={0.011}
              color="#c1b18a"
            />
            <Strut
              from={[x * 0.16, 0.12, z * 0.16]}
              to={[x * 0.29, 0.08, z * 0.29]}
              radius={0.006}
            />
            <Strut
              from={[x * 0.13, 0.13, z * 0.13]}
              to={[x * 0.33, 0.035, z * 0.33]}
              radius={0.005}
              color="#d5c399"
            />
            <Strut
              from={[x * 0.24 - z * 0.04, 0.13, z * 0.24 + x * 0.04]}
              to={[x * 0.24 + z * 0.04, 0.13, z * 0.24 - x * 0.04]}
              radius={0.005}
            />
            <mesh position={[x * 0.33, 0.018, z * 0.33]} castShadow>
              <cylinderGeometry args={[0.058, 0.067, 0.018, 20]} />
              <meshStandardMaterial
                color="#b9a67b"
                metalness={0.55}
                roughness={0.55}
              />
            </mesh>
            <mesh
              position={[x * 0.33, 0.031, z * 0.33]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[0.034, 0.036, 24]} />
              <meshBasicMaterial color="#e9bd83" />
            </mesh>
          </group>
        );
      })}
      {[-0.034, 0.034].map((x) => (
        <Strut
          key={x}
          from={[x, 0.05, 0.23]}
          to={[x, 0.34, 0.15]}
          radius={0.003}
        />
      ))}
      {[0.09, 0.135, 0.18, 0.225, 0.27].map((y) => (
        <Strut
          key={y}
          from={[-0.034, y, 0.23 - (y - 0.05) * 0.27]}
          to={[0.034, y, 0.23 - (y - 0.05) * 0.27]}
          radius={0.003}
        />
      ))}
      <Strut
        from={[-0.06, 0.5, -0.03]}
        to={[-0.06, 0.66, -0.03]}
        radius={0.003}
      />
      <mesh position={[-0.06, 0.65, -0.03]} rotation={[0.4, 0, 0.5]}>
        <sphereGeometry
          args={[0.058, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]}
        />
        <meshStandardMaterial
          color="#dfe5e8"
          side={2}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      <Strut
        from={[0.075, 0.49, -0.07]}
        to={[0.075, 0.61, -0.07]}
        radius={0.0025}
      />
      <mesh position={[0.075, 0.612, -0.07]}>
        <sphereGeometry args={[0.009, 10, 8]} />
        <meshBasicMaterial color="#65d9ff" />
      </mesh>
      {exhaust && (
        <mesh position={[0, -0.08, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.1, 0.24, 20, 1, true]} />
          <meshBasicMaterial
            color="#b5e8ff"
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function PanelArray() {
  return (
    <group>
      {[-1, 1].flatMap((row) =>
        [-1, 0, 1].map((col) => (
          <group key={`${row}${col}`} position={[col * 0.16, 0, row * 0.12]}>
            <Strut from={[0, 0, 0]} to={[0, 0.1, 0]} radius={0.006} />
            <group position={[0, 0.12, 0]} rotation={[-0.42, 0, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.145, 0.009, 0.2]} />
                <meshStandardMaterial
                  color="#102d4c"
                  metalness={0.65}
                  roughness={0.28}
                  emissive="#0c2038"
                  emissiveIntensity={0.3}
                />
              </mesh>
              {[-0.05, 0, 0.05].map((x) => (
                <mesh key={x} position={[x, 0.005, 0]}>
                  <boxGeometry args={[0.0018, 0.001, 0.195]} />
                  <meshBasicMaterial color="#4b85ad" />
                </mesh>
              ))}
              {[-0.065, 0, 0.065].map((z) => (
                <mesh key={z} position={[0, 0.005, z]}>
                  <boxGeometry args={[0.14, 0.001, 0.0018]} />
                  <meshBasicMaterial color="#4b85ad" />
                </mesh>
              ))}
            </group>
          </group>
        )),
      )}
    </group>
  );
}

function Habitat() {
  return (
    <group>
      <mesh position={[0, 0.035, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.235, 0.07, 24]} />
        <meshStandardMaterial color="#b6bdc3" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.065, 0]} castShadow>
        <sphereGeometry args={[0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#415569" metalness={0.5} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.066, 0]}>
        <sphereGeometry args={[0.223, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#c6ced1"
          wireframe
          metalness={0.7}
          roughness={0.4}
        />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.214, 0.08, Math.sin(a) * 0.214]}
            rotation={[0, -a + Math.PI / 2, 0]}
          >
            <boxGeometry args={[0.05, 0.045, 0.008]} />
            <meshStandardMaterial
              color="#f0c087"
              emissive="#e9a557"
              emissiveIntensity={0.85}
            />
          </mesh>
        );
      })}
      <mesh
        position={[0.3, 0.075, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.075, 0.075, 0.28, 16]} />
        <meshStandardMaterial color="#d5d9db" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0.47, 0.075, 0]} castShadow>
        <boxGeometry args={[0.14, 0.15, 0.18]} />
        <meshStandardMaterial
          color="#c8cdd0"
          roughness={0.65}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[0.47, 0.08, 0.092]}>
        <boxGeometry args={[0.065, 0.09, 0.004]} />
        <meshStandardMaterial
          color="#d4a05d"
          emissive="#d9a05b"
          emissiveIntensity={0.7}
        />
      </mesh>
      <Strut from={[-0.22, 0, -0.2]} to={[-0.22, 0.33, -0.2]} radius={0.004} />
      <mesh position={[-0.22, 0.33, -0.2]}>
        <sphereGeometry args={[0.015, 12, 10]} />
        <meshBasicMaterial color="#fff1d2" />
      </mesh>
    </group>
  );
}

function Relay({ telescope = false }: { telescope?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.025, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.05, 16]} />
        <meshStandardMaterial color="#9da7ae" metalness={0.5} roughness={0.5} />
      </mesh>
      <Strut from={[0, 0.04, 0]} to={[0, 0.29, 0]} radius={0.015} />
      {[-1, 1].map((s) => (
        <Strut
          key={s}
          from={[s * 0.085, 0.04, 0]}
          to={[0, 0.28, 0]}
          radius={0.004}
        />
      ))}
      <group position={[0, 0.31, 0]} rotation={[0.6, 0, 0.2]}>
        {telescope ? (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.095, 0.085, 0.25, 24]} />
              <meshStandardMaterial
                color="#d6dce0"
                metalness={0.6}
                roughness={0.4}
              />
            </mesh>
            <mesh position={[0, 0.127, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.086, 24]} />
              <meshStandardMaterial
                color="#07101a"
                metalness={0.4}
                roughness={0.08}
              />
            </mesh>
            <mesh position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.085, 0.095, 24]} />
              <meshStandardMaterial color="#d1d6da" metalness={0.7} />
            </mesh>
          </group>
        ) : (
          <>
            <mesh castShadow>
              <sphereGeometry
                args={[0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]}
              />
              <meshStandardMaterial
                color="#d3dde4"
                side={2}
                metalness={0.45}
                roughness={0.4}
              />
            </mesh>
            <mesh>
              <sphereGeometry
                args={[0.172, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]}
              />
              <meshStandardMaterial wireframe color="#778d9f" side={2} />
            </mesh>
            <Strut from={[-0.13, 0.04, 0]} to={[0, 0.19, 0]} radius={0.003} />
            <Strut from={[0.13, 0.04, 0]} to={[0, 0.19, 0]} radius={0.003} />
          </>
        )}
      </group>
      <mesh position={[0.13, 0.045, 0.05]}>
        <boxGeometry args={[0.09, 0.09, 0.12]} />
        <meshStandardMaterial color="#aeb7bd" roughness={0.6} />
      </mesh>
      <mesh position={[0.13, 0.09, 0.112]}>
        <sphereGeometry args={[0.009, 8, 8]} />
        <meshBasicMaterial color="#65d9ff" />
      </mesh>
    </group>
  );
}

function Rover() {
  return (
    <group>
      <mesh position={[0, 0.105, 0]} castShadow>
        <boxGeometry args={[0.24, 0.085, 0.17]} />
        <FoilMaterial />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[0.27, 0.009, 0.2]} />
        <meshStandardMaterial color="#163957" metalness={0.6} roughness={0.3} />
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 0, 1].map((z) => (
          <group key={`${x}${z}`}>
            <Strut
              from={[x * 0.07, 0.1, z * 0.055]}
              to={[x * 0.145, 0.045, z * 0.1]}
              radius={0.005}
            />
            <mesh
              position={[x * 0.145, 0.045, z * 0.1]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.047, 0.047, 0.034, 16]} />
              <meshStandardMaterial
                color="#4d555b"
                metalness={0.4}
                roughness={0.8}
              />
            </mesh>
            <mesh
              position={[x * 0.164, 0.045, z * 0.1]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <torusGeometry args={[0.033, 0.004, 5, 12]} />
              <meshStandardMaterial color="#a4a9a9" metalness={0.6} />
            </mesh>
          </group>
        )),
      )}
      <Strut
        from={[0.07, 0.17, -0.03]}
        to={[0.07, 0.32, -0.03]}
        radius={0.006}
      />
      <mesh position={[0.07, 0.32, -0.03]}>
        <boxGeometry args={[0.075, 0.043, 0.04]} />
        <meshStandardMaterial color="#d6dbde" metalness={0.4} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.07 + s * 0.022, 0.32, -0.008]}>
          <sphereGeometry args={[0.01, 8, 8]} />
          <meshStandardMaterial
            color="#122130"
            metalness={0.5}
            roughness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

export function InfrastructureModel({ type }: { type: string }) {
  if (type === "habitat") return <Habitat />;
  if (type === "solar_array") return <PanelArray />;
  if (type === "comms_relay") return <Relay />;
  if (type === "telescope") return <Relay telescope />;
  if (type === "rover") return <Rover />;
  return (
    <group>
      <mesh position={[0, 0.11, 0]} castShadow>
        <boxGeometry args={[0.32, 0.22, 0.22]} />
        <meshStandardMaterial
          color="#b8c0c5"
          roughness={0.55}
          metalness={0.4}
        />
      </mesh>
      {[-0.1, 0.1].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.33, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.25, 16]} />
            <meshStandardMaterial
              color="#d1d8dc"
              metalness={0.65}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[x, 0.46, 0]}>
            <sphereGeometry
              args={[0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
            <meshStandardMaterial
              color="#d1d8dc"
              metalness={0.65}
              roughness={0.35}
            />
          </mesh>
        </group>
      ))}
      <group position={[0.35, 0, 0]} scale={0.6}>
        <PanelArray />
      </group>
      <mesh position={[0, 0.13, 0.112]}>
        <boxGeometry args={[0.15, 0.06, 0.004]} />
        <meshStandardMaterial
          color="#dfb177"
          emissive="#c89449"
          emissiveIntensity={0.45}
        />
      </mesh>
    </group>
  );
}
