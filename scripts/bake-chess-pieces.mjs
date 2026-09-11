/**
 * Rebuilds public/models/chess-pieces.glb from the six CC-BY Poly Pizza source GLBs.
 *
 *   node scripts/bake-chess-pieces.mjs
 *   npx @gltf-transform/cli weld public/models/chess-pieces.glb public/models/chess-pieces.glb
 *
 * Sources (unmodified) live in public/models/source/. Attribution: public/models/ATTRIBUTION.md.
 * Verified with three@0.185.1 + node 24.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'public/models/source');
const OUT = path.join(ROOT, 'public/models/chess-pieces.glb');

// three's GLTFExporter uses Blob + FileReader; node has Blob but not FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((ab) => { this.result = ab; this.onloadend?.(); });
  }
};

const SRC = { King: 'king.glb', Queen: 'queen.glb', Rook: 'rook.glb', Bishop: 'bishop.glb', Knight: 'knight.glb', Pawn: 'pawn.glb' };
const KING_TARGET_HEIGHT = 1.75; // board-square units (1 square = 1 unit)
const CREASE_ANGLE_DEG = 35;

const loader = new GLTFLoader();
const load = (file) => new Promise((res, rej) => {
  const b = fs.readFileSync(file);
  loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej);
});

const raw = {};
for (const [name, file] of Object.entries(SRC)) {
  const gltf = await load(path.join(SRC_DIR, file));
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isMesh) mesh = o; });
  const g = mesh.geometry.clone();
  g.computeBoundingBox();
  raw[name] = g;
}

const kingBB = raw.King.boundingBox;
const S = KING_TARGET_HEIGHT / (kingBB.max.y - kingBB.min.y); // 3.930078

const scene = new THREE.Scene();
scene.name = 'ChessPieces';
const material = new THREE.MeshStandardMaterial({ name: 'PieceMaterial', color: 0xffffff, metalness: 0, roughness: 0.35 });

for (const [name, g] of Object.entries(raw)) {
  const bb = g.boundingBox;
  const pos = g.attributes.position;
  // base centre = mean x/z of the vertices in the lowest 3% of the height
  const cut = bb.min.y + (bb.max.y - bb.min.y) * 0.03;
  let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) <= cut) { sx += pos.getX(i); sz += pos.getZ(i); n++; }
  }
  g.translate(-(sx / n), -bb.min.y, -(sz / n)); // base ring centred on origin, foot at y = 0
  g.scale(S, S, S);
  // source GLBs carry POSITION only (obj2gltf) -> three would flat-shade. Crease at 35 deg:
  // smooth around the lathe, hard at the collars.
  const mesh = new THREE.Mesh(toCreasedNormals(g, THREE.MathUtils.degToRad(CREASE_ANGLE_DEG)), material);
  mesh.name = name;
  scene.add(mesh);
}

const buf = await new Promise((res, rej) =>
  new GLTFExporter().parse(scene, res, rej, { binary: true, onlyVisible: false })
);
fs.writeFileSync(OUT, Buffer.from(buf));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes  (scale S =', S, ')');
console.log('now run: npx @gltf-transform/cli weld', OUT, OUT);
