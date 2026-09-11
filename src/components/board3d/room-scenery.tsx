"use client";

import { BackSide } from "three";
import { TABLE_FOOT_Y } from "./layout";

const skyVertex = /* glsl */ `
  varying vec3 direction;
  void main() {
    direction = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// Direction-space noise has no panorama seam, texture size limit, or image download.
const skyFragment = /* glsl */ `
  varying vec3 direction;
  float hash(vec3 p) {
    p = fract(p * .3183099 + vec3(.1, .2, .3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                   mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                   mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float clouds(vec3 p) {
    float n = 0.0, amplitude = .5;
    for (int i = 0; i < 5; i++) {
      n += amplitude * noise(p);
      p = p * 2.07 + vec3(4.3, 2.1, 1.7);
      amplitude *= .5;
    }
    return n;
  }
  void main() {
    vec3 d = normalize(direction);
    float dust = clouds(d * 5.0);
    float band = exp(-pow((d.y + .35*d.x + .18 + (dust-.5)*.65)*2.8, 2.0));
    float filaments = clouds(d * 22.0 + dust * 3.0);
    vec3 base = vec3(.006, .013, .03);
    vec3 nebula = mix(vec3(.018, .09, .14), vec3(.09, .045, .16), smoothstep(-.8, .8, d.x));
    vec3 color = base + nebula * band * (.3 + dust * 1.4);
    color += vec3(.12, .17, .25) * pow(filaments, 3.0) * band;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function SpaceSky() {
  return (
    <mesh raycast={() => null} renderOrder={-10}>
      <sphereGeometry args={[150, 48, 24]} />
      <shaderMaterial
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        side={BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Physical light strips stay visible even on the Low tier with bloom disabled. */
export function NeonStage() {
  return (
    <group>
      <mesh position={[0, TABLE_FOOT_Y - 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={() => null}>
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color="#20263c" metalness={0.25} roughness={0.65} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0, side * 26]}>
          <mesh position={[0, 7, side * .1]} raycast={() => null}>
            <boxGeometry args={[90, 28, .2]} />
            <meshStandardMaterial color="#202238" roughness={0.85} />
          </mesh>
          {[-32, -24, -16, -8, 0, 8, 16, 24, 32].map((x) => (
            <mesh key={x} position={[x, 6, -side * .1]} raycast={() => null}>
              <boxGeometry args={[.075, 24, .08]} />
              <meshBasicMaterial color={x < 0 ? "#79e6f2" : "#ed85c7"} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, TABLE_FOOT_Y + .04, -side * .12]} raycast={() => null}>
            <boxGeometry args={[90, .065, .1]} />
            <meshBasicMaterial color="#8cd4ee" toneMapped={false} />
          </mesh>
        </group>
      ))}
      {[-20, -12, 12, 20].map((offset) => (
        <group key={offset}>
          <mesh position={[offset, TABLE_FOOT_Y - .035, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[.045, 160]} />
            <meshBasicMaterial color={offset < 0 ? "#79e6f2" : "#ed85c7"} toneMapped={false} />
          </mesh>
          <mesh position={[0, TABLE_FOOT_Y - .03, offset]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[160, .035]} />
            <meshBasicMaterial color="#7baacb" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <hemisphereLight args={["#c3dfff", "#44415e", 0.9]} />
      <directionalLight position={[7, 5, -7]} intensity={1.6} color="#ffe0f2" />
    </group>
  );
}
