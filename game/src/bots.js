// The Rustjackals: five bots that hold the yard. Each one walks the waypoint
// graph, holds a lane, and reacts: it engages on line of sight, investigates
// gunfire it hears, and retakes a site to defuse a planted spike. Shooting is
// resolved by main.js — a bot here only decides when to pull the trigger, and
// its aim error grows with distance and with the player's movement, so stopping
// to aim pays against them too.
import * as THREE from 'three';

const HEALTH = 100;
const SPEED = 3.3;
const RADIUS = 0.34;
const HEIGHT = 1.72;
const ENGAGE_RANGE = 42;
const HEAR_RANGE = 26;
const DEFUSE_SECONDS = 4;

const NAMES = ['Rook', 'Vex', 'Marrow', 'Pike', 'Sable'];

export function createBots(scene, world, random) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a2f26, roughness: 0.65, metalness: 0.05 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.6, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.85 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x3fae9e, roughness: 0.3, metalness: 0.4, emissive: 0x1a4a44 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 16, 12);
  const legGeo = new THREE.BoxGeometry(0.2, 0.62, 0.24);
  const visorGeo = new THREE.BoxGeometry(0.3, 0.06, 0.05);

  const colliders = world.colliders;
  const probe = new THREE.Box3();
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const toPlayer = new THREE.Vector3();
  const items = [];
  const hitMeshes = [];
  let now = 0;

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function hasLineOfSight(from, to) {
    toPlayer.copy(to).sub(from);
    const dist = toPlayer.length();
    if (dist < 0.01) return true;
    raycaster.set(from, toPlayer.normalize());
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance >= dist - 0.2;
  }

  function moveBot(bot, tx, tz, dt) {
    const dx = tx - bot.group.position.x;
    const dz = tz - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = Math.min(dist, SPEED * dt);
    const nx = bot.group.position.x + (dx / dist) * stepLen;
    const nz = bot.group.position.z + (dz / dist) * stepLen;
    if (!overlaps(nx, bot.group.position.y, bot.group.position.z)) bot.group.position.x = nx;
    if (!overlaps(bot.group.position.x, bot.group.position.y, nz)) bot.group.position.z = nz;
    bot.group.rotation.y = Math.atan2(dx, dz);
    return dist - stepLen < 0.6;
  }

  for (let index = 0; index < 5; index += 1) {
    const spawn = world.botSpawns[index % world.botSpawns.length];
    const group = new THREE.Group();
    group.position.set(spawn.x, 0, spawn.z);
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.31, 0);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.55, -0.14);
    group.add(legL, legR, torso, head, visor);
    group.traverse((mesh) => {
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    scene.add(group);

    const item = {
      name: NAMES[index], group, torso, head, health: HEALTH, alive: true,
      state: 'hold', waypoint: index * 2, target: null, holdUntil: now + 1 + random() * 2,
      burstLeft: 0, burstTimer: 0, pauseTimer: 0, strafeDir: 1, strafeTimer: 0,
      lastSeen: new THREE.Vector3(), investigate: null, defuse: 0, blind: 0,
      fall: 0, flash: 0, yaw: 0,
    };
    torso.userData.bot = item;
    head.userData.bot = item;
    hitMeshes.push(torso, head);
    items.push(item);
  }

  function damage(mesh, amount) {
    const item = mesh.userData.bot;
    if (!item || !item.alive) return null;
    item.health -= amount;
    item.flash = 0.12;
    if (item.health > 0) return { killed: false, bot: item };
    item.alive = false;
    item.fall = 0;
    return { killed: true, bot: item };
  }

  function step(dt, ctx) {
    now = ctx.time;
    const playerPos = ctx.playerPos;
    for (const bot of items) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      if (bot.flash > 0) {
        bot.flash -= dt;
        bot.torso.material.emissive.setHex(0x552200);
        if (bot.flash <= 0) bot.torso.material.emissive.setHex(0x000000);
      }
      if (bot.blind > 0) bot.blind -= dt;

      const eye = new THREE.Vector3(bot.group.position.x, 1.5, bot.group.position.z);
      const chest = new THREE.Vector3(playerPos.x, playerPos.y + 1.2, playerPos.z);
      const dist = eye.distanceTo(chest);
      const sees = ctx.playerAlive && bot.blind <= 0 && dist < ENGAGE_RANGE && hasLineOfSight(eye, chest);

      // Hearing: a fresh shot nearby pulls a bot off its hold to investigate.
      if (ctx.noise && !sees && bot.state !== 'retake' && bot.state !== 'defuse') {
        const nd = Math.hypot(ctx.noise.x - bot.group.position.x, ctx.noise.z - bot.group.position.z);
        if (nd < HEAR_RANGE) {
          bot.state = 'investigate';
          bot.investigate = new THREE.Vector3(ctx.noise.x, 0, ctx.noise.z);
        }
      }

      if (ctx.spikePlanted && bot.state !== 'defuse') bot.state = 'retake';
      if (!ctx.spikePlanted && bot.state === 'retake') bot.state = 'hold';

      if (sees) {
        bot.state = 'engage';
        bot.lastSeen.copy(playerPos);
        bot.pauseTimer -= dt;
        // Strafe while firing so the player cannot just hold an angle.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir = random() < 0.5 ? -1 : 1;
          bot.strafeTimer = 1 + random() * 1.2;
        }
        const px = playerPos.x - bot.group.position.x;
        const pz = playerPos.z - bot.group.position.z;
        const len = Math.hypot(px, pz) || 1;
        const sx = (-pz / len) * bot.strafeDir;
        const sz = (px / len) * bot.strafeDir;
        const want = dist > 24 ? 1 : dist < 8 ? -1 : 0;
        moveBot(bot, bot.group.position.x + sx * 2 + (px / len) * want * 2, bot.group.position.z + sz * 2 + (pz / len) * want * 2, dt);
        bot.group.rotation.y = Math.atan2(px, pz);
        if (bot.pauseTimer <= 0) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.pauseTimer = 0.7 + random() * 0.5;
          }
          bot.burstTimer -= dt;
          if (bot.burstTimer <= 0 && bot.burstLeft > 0) {
            bot.burstLeft -= 1;
            bot.burstTimer = 0.13;
            ctx.shootFrom(bot, dist);
          }
        }
        continue;
      }

      if (bot.state === 'engage') bot.state = 'hold';

      if (bot.state === 'retake' && ctx.spikeSite) {
        const site = ctx.spikeSite;
        const d = Math.hypot(site.x - bot.group.position.x, site.z - bot.group.position.z);
        if (d > 1.4) {
          moveBot(bot, site.x, site.z, dt);
        } else {
          bot.state = 'defuse';
          bot.defuse = 0;
        }
        continue;
      }

      if (bot.state === 'defuse') {
        bot.defuse += dt;
        if (bot.defuse >= DEFUSE_SECONDS) ctx.onDefused(bot);
        continue;
      }

      if (bot.state === 'investigate' && bot.investigate) {
        const done = moveBot(bot, bot.investigate.x, bot.investigate.z, dt);
        if (done) {
          bot.state = 'hold';
          bot.investigate = null;
          bot.holdUntil = now + 2 + random() * 2;
        }
        continue;
      }

      // Hold, then patrol: walk to a random neighbour on the nav graph.
      if (now >= bot.holdUntil) {
        const wp = world.waypoints[bot.waypoint];
        const next = wp.to[Math.floor(random() * wp.to.length)];
        bot.waypoint = next;
        bot.target = world.waypoints[next];
        bot.state = 'patrol';
      }
      if (bot.state === 'patrol' && bot.target) {
        const done = moveBot(bot, bot.target.x, bot.target.z, dt);
        if (done) {
          bot.state = 'hold';
          bot.holdUntil = now + 1.5 + random() * 3;
        }
      } else if (bot.state === 'hold') {
        // Idle sweep: look around the lane while holding.
        bot.group.rotation.y += dt * 0.5 * Math.sin(now * 0.7 + bot.waypoint);
      }
    }
  }

  function reset() {
    for (let index = 0; index < items.length; index += 1) {
      const bot = items[index];
      const spawn = world.botSpawns[index % world.botSpawns.length];
      bot.group.position.set(spawn.x, 0, spawn.z);
      bot.group.rotation.set(0, 0, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'hold';
      bot.waypoint = index * 2;
      bot.target = null;
      bot.holdUntil = now + 1 + random() * 2;
      bot.burstLeft = 0;
      bot.burstTimer = 0;
      bot.pauseTimer = 0;
      bot.defuse = 0;
      bot.blind = 0;
      bot.fall = 0;
      bot.flash = 0;
      bot.investigate = null;
      bot.torso.material.emissive.setHex(0x000000);
    }
  }

  return {
    items,
    hitMeshes,
    damage,
    step,
    reset,
    aliveCount() {
      return items.filter((bot) => bot.alive).length;
    },
  };
}
