// Dustline Yard: an original freight yard, 36 x 30 m, walled, open to a dusk sky.
// Two spike sites (A west, B east) at the north end, a mid lane down the middle, and
// container rows and crates for cover. Every solid box is a collider for the player
// and the bots, and a surface a bullet stops on. Waypoints form the nav graph the
// bots walk: each point lists the neighbours it can reach in a straight line.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'A', center: new THREE.Vector3(-13, 0, -9), radius: 3.6 },
  B: { name: 'B', center: new THREE.Vector3(13, 0, -9), radius: 3.6 },
};

export const PLAYER_SPAWN = { x: 0, z: 12.5, yaw: 0 };

export const BOT_SPAWNS = [
  { x: -10, z: -12 },
  { x: -4, z: -12.5 },
  { x: 0, z: -12 },
  { x: 4, z: -12.5 },
  { x: 10, z: -12 },
];

// Waypoints: [x, z, neighbours...]. Lanes: west (0-3), mid (4-7), east (8-11),
// plus site holds (12 A, 13 B) and the south approach (14).
export const WAYPOINTS = [
  { x: -13, z: -4, to: [1, 4, 12] },
  { x: -13, z: 4, to: [0, 2, 14] },
  { x: -7, z: 8, to: [1, 3, 14] },
  { x: -7, z: -8, to: [2, 4, 12] },
  { x: 0, z: -6, to: [0, 3, 5, 8] },
  { x: 0, z: 0, to: [4, 6, 7] },
  { x: 0, z: 7, to: [2, 5, 14] },
  { x: 7, z: 8, to: [6, 8, 14] },
  { x: 7, z: -8, to: [4, 9, 13] },
  { x: 13, z: -4, to: [8, 10, 13] },
  { x: 13, z: 4, to: [7, 9, 14] },
  { x: -13, z: 8, to: [1, 2, 14] },
  { x: -13, z: -9, to: [0, 3] },
  { x: 13, z: -9, to: [8, 9] },
  { x: 0, z: 12, to: [2, 6, 7, 11] },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // Container paint: rust red and teal, the yard's own colours.
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a4a28, roughness: 0.8, metalness: 0.15 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x2e6f66, roughness: 0.8, metalness: 0.15 });
  const sand = new THREE.MeshStandardMaterial({ color: 0x9a7d4f, roughness: 0.95, metalness: 0.02 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function visual(width, height, depth, x, y, z, material) {
    // Scenery that bullets and bodies pass through (overhead gantry beams).
    // They cast no shadow: at dusk height they would stripe the whole yard.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Floor and perimeter: 36 x 30 m, 5 m walls, open to the sky.
  box(36.4, 0.4, 30.4, 0, -0.2, 0, materials.canvas);
  box(0.4, 5, 30.4, -18.2, 2.5, 0, materials.surface);
  box(0.4, 5, 30.4, 18.2, 2.5, 0, materials.surface);
  box(36.4, 5, 0.4, 0, 2.5, -15.2, materials.surface);
  box(36.4, 5, 0.4, 0, 2.5, 15.2, materials.surface);

  // Site markers: painted ground pads the spike reads as a zone.
  for (const site of Object.values(SITES)) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(site.radius, site.radius, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.9, transparent: true, opacity: 0.35 }),
    );
    pad.position.set(site.center.x, 0.03, site.center.z);
    pad.receiveShadow = true;
    group.add(pad);
  }

  // Containers: the yard's big cover, two rows guarding the sites.
  box(2.6, 2.6, 6.2, -8, 1.3, -4, rust);
  box(2.6, 2.6, 6.2, 8, 1.3, -4, teal);
  box(6.2, 2.6, 2.6, -8, 1.3, 2, teal);
  box(6.2, 2.6, 2.6, 8, 1.3, 2, rust);
  box(2.6, 2.6, 5.0, -15.5, 1.3, -4, rust);
  box(2.6, 2.6, 5.0, 15.5, 1.3, -4, teal);

  // Mid pillar, offset from the centre line so the middle lane keeps a sightline.
  box(1.4, 3.4, 1.4, 3.5, 1.7, -2, materials.hairline);
  box(3.4, 1.0, 0.9, -3.4, 0.5, 4.5, materials.hairline);
  box(3.4, 1.0, 0.9, 3.4, 0.5, 4.5, materials.hairline);
  box(0.9, 1.0, 3.4, -5.5, 0.5, -9.5, materials.hairline);
  box(0.9, 1.0, 3.4, 5.5, 0.5, -9.5, materials.hairline);

  // Crates: crouch cover scattered through the lanes.
  const crates = [
    [-11, -1, 1.2], [-11, 0.2, 1.2], [11, -1, 1.2], [11, 0.2, 1.2],
    [-3, -11, 0.8], [3, -11, 0.8], [-1.5, 9, 0.8], [1.5, 9, 0.8],
    [-16, 8, 1.0], [16, 8, 1.0], [-16, -12, 1.0], [16, -12, 1.0],
  ];
  for (const [x, z, s] of crates) box(s, s, s, x, s / 2, z, sand);

  // Overhead gantry: beams high above mid, visual only, so the sky stays open.
  visual(36, 0.5, 0.8, 0, 5.6, -2, materials.hairline);
  visual(0.8, 0.5, 30, -6, 5.6, 0, materials.hairline);
  visual(0.8, 0.5, 30, 6, 5.6, 0, materials.hairline);

  // Light: low amber sun from the west, cool teal fill from the east, dusk sky.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8fb8b2), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color(0xffc27a), 2.8);
  sun.position.set(-14, 12, 6);
  sun.target.position.set(0, 0, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(0x4fb3a9), 0.5);
  fill.position.set(12, 9, 10);
  scene.add(fill);

  return { colliders, shootables, group, sites: SITES, waypoints: WAYPOINTS, botSpawns: BOT_SPAWNS };
}
