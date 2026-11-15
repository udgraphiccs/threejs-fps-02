// Dustline Yard: boot, the one loop, and the match itself. A fixed 60 Hz
// simulation feeds a render at the display's rate. Rounds, money, the buy menu,
// the spike objective, bots, grenades and tracers all live here; the modules
// own their pieces (movement, guns, bots, sound, HUD) and main.js owns the
// rules that bind them.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, PLAYER_SPAWN } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_SECONDS = 100;
const FUSE_SECONDS = 35;
const PLANT_SECONDS = 3;
const BUY_SECONDS = 14;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const PLANT_REWARD = 300;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world, random);
const arsenal = createArsenal(camera);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange, onKeyDown);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const eyePos = new THREE.Vector3();

const body = player.state;
let phase = 'menu'; // menu | buy | playing | roundEnd | matchEnd
let round = 1;
let scoreUs = 0;
let scoreThem = 0;
let money = 800;
let roundTimer = ROUND_SECONDS;
let buyTimer = BUY_SECONDS;
let endTimer = 0;
let spike = { state: 'carried', site: null, plant: 0, fuse: 0 };
let grenades = [];
let tracers = [];
let noise = null;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let plantBeepAt = 0;

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function pushHud() {
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(money);
  hud.setTimer(spike.state === 'planted' ? spike.fuse : roundTimer);
  hud.setScore(scoreUs, scoreThem, round);
  hud.setAlive(bots.aliveCount());
  hud.setSpike(
    spike.state === 'planted' ? `SPIKE PLANTED at ${spike.site} — ${Math.ceil(spike.fuse)}s to detonation`
      : spike.state === 'carried' ? 'You carry the spike — plant it at A or B (hold E)'
      : 'Spike defused',
  );
}

function startBuyPhase() {
  phase = 'buy';
  buyTimer = BUY_SECONDS;
  arsenal.resetRound();
  hud.showBuy(money, arsenal.owned, arsenal.grenades);
  hud.banner(`Round ${round}`, 'Buy phase — press Enter to start the round', 3000);
  pushHud();
}

function startRound() {
  hud.hideBuy();
  hud.hideBanner();
  phase = 'playing';
  roundTimer = ROUND_SECONDS;
  spike = { state: 'carried', site: null, plant: 0, fuse: 0 };
  player.reset(PLAYER_SPAWN.x, PLAYER_SPAWN.z, PLAYER_SPAWN.yaw);
  bots.reset();
  arsenal.refill();
  syncCamera();
  pushHud();
}

function endRound(usWon, reason) {
  if (phase !== 'playing') return;
  phase = 'roundEnd';
  endTimer = 3.5;
  if (usWon) {
    scoreUs += 1;
    money += WIN_REWARD;
    audio.win();
    hud.banner('Round won', reason, 3200);
  } else {
    scoreThem += 1;
    money += LOSS_REWARD;
    audio.lose();
    hud.banner('Round lost', reason, 3200);
  }
  if (document.pointerLockElement) document.exitPointerLock();
  pushHud();
}

function endMatch() {
  phase = 'matchEnd';
  const won = scoreUs > scoreThem;
  hud.showOverlay('end', won
    ? `Vanguard take the yard ${scoreUs} — ${scoreThem}. The Rustjackals are done.`
    : `The Rustjackals hold the yard ${scoreThem} — ${scoreUs}. Run it back.`);
  if (document.pointerLockElement) document.exitPointerLock();
}

function buyItem(id) {
  if (phase !== 'buy') return;
  if (id === 'grenade') {
    if (money < GRENADE_PRICE) return;
    money -= GRENADE_PRICE;
    arsenal.addGrenade();
  } else if (id === 'armor') {
    if (money < ARMOR_PRICE || body.armor >= 50) return;
    money -= ARMOR_PRICE;
    body.armor = 50;
  } else {
    const def = WEAPONS[id];
    if (!def) return;
    if (!arsenal.owned[id]) {
      if (money < def.price) return;
      money -= def.price;
      arsenal.buy(id);
    }
    arsenal.select(id);
    audio.click();
  }
  audio.click();
  hud.showBuy(money, arsenal.owned, arsenal.grenades);
  pushHud();
}

function onKeyDown(code) {
  if (phase === 'buy') {
    if (code === 'Enter') startRound();
    else if (code === 'KeyB') hud.hideBuy(), startRound();
    else if (code.startsWith('Digit')) buyItem({ 1: 'pistol', 2: 'smg', 3: 'rifle', 4: 'sniper', 5: 'grenade', 6: 'armor' }[code.slice(5)]);
  } else if (phase === 'playing') {
    if (code === 'KeyG') throwGrenade();
    if (code.startsWith('Digit')) {
      const name = { 1: 'pistol', 2: 'smg', 3: 'rifle', 4: 'sniper' }[code.slice(5)];
      if (name && arsenal.select(name)) pushHud();
    }
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (phase === 'playing' && !started) {
    hud.showOverlay('start');
  } else if (phase === 'playing') {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (phase === 'matchEnd') {
    round = 1; scoreUs = 0; scoreThem = 0; money = 800;
    startBuyPhase();
    input.requestLock();
    return;
  }
  if (phase === 'menu') {
    started = true;
    startBuyPhase();
  }
  input.requestLock();
});
hud.onBuy((id) => buyItem(id));
hud.onBuyClose(() => { if (phase === 'buy') startRound(); });

function addTracer(from, to, color = 0xffe0a0) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, life: 0.07 });
}

function raySphere(origin, dir, center, radius) {
  // Returns distance along the ray to the sphere, or Infinity.
  const ox = center.x - origin.x;
  const oy = center.y - origin.y;
  const oz = center.z - origin.z;
  const tca = ox * dir.x + oy * dir.y + oz * dir.z;
  if (tca < 0) return Infinity;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

function shootPlayer(spread) {
  if (!arsenal.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = direction.clone().multiplyScalar(hit ? hit.distance : 80).add(camera.position);
  addTracer(camera.position.clone().add(direction.clone().multiplyScalar(0.6)), end);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const def = arsenal.def();
    const dist = hit.distance;
    const falloff = dist > 30 ? 0.7 : 1;
    const amount = Math.round(def.damage * (hit.object.userData.part === 'head' ? def.head : 1) * falloff);
    const result = bots.damage(hit.object, amount);
    if (result) {
      hud.hitMarker(result.killed, shot ? 60000 : 90);
      audio.hit();
      if (result.killed) {
        money += KILL_REWARD;
        audio.kill();
        hud.killfeed(`You dropped ${result.bot.name}  +$${KILL_REWARD}`);
        if (bots.aliveCount() === 0) endRound(true, 'Every Rustjackal is down.');
      }
    }
  }
  arsenal.pullTrigger();
  audio.shot(arsenal.current);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  noise = { x: body.position.x, z: body.position.z, at: elapsed };
  pushHud();
  return true;
}

function botShoot(bot, dist) {
  // A bot fires at the player: an error cone around the true aim, resolved
  // against two spheres (head, torso) so cover and distance matter.
  eyePos.set(bot.group.position.x, 1.5, bot.group.position.z);
  const target = new THREE.Vector3(body.position.x, body.position.y + 1.1, body.position.z);
  direction.copy(target).sub(eyePos).normalize();
  const speed = player.groundSpeed();
  const error = 0.035 + dist * 0.0012 + speed * 0.004;
  direction.x += (random() * 2 - 1) * error;
  direction.y += (random() * 2 - 1) * error;
  direction.z += (random() * 2 - 1) * error;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(eyePos, direction);
  const wall = raycaster.intersectObjects(world.shootables, false)[0];
  const headCenter = new THREE.Vector3(body.position.x, body.position.y + 1.5, body.position.z);
  const torsoCenter = new THREE.Vector3(body.position.x, body.position.y + 1.0, body.position.z);
  const headHit = raySphere(eyePos, direction, headCenter, 0.24);
  const torsoHit = raySphere(eyePos, direction, torsoCenter, 0.5);
  const hitDist = Math.min(headHit, torsoHit);
  const end = direction.clone().multiplyScalar(wall && wall.distance < hitDist ? wall.distance : Math.min(hitDist, 60)).add(eyePos);
  addTracer(eyePos.clone(), end, 0xff9a7a);
  audio.enemyShot();
  if (hitDist !== Infinity && (!wall || wall.distance > hitDist)) {
    const amount = headHit < torsoHit ? 20 : 13;
    const died = player.damage(amount);
    hud.damageFlash();
    audio.hurt();
    pushHud();
    if (died) {
      hud.killfeed(`${bot.name} dropped you`);
      endRound(false, `${bot.name} dropped you.`);
    }
  }
}

function throwGrenade() {
  if (phase !== 'playing' || !arsenal.useGrenade()) return;
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.8 }),
  );
  mesh.position.copy(camera.position).add(direction.clone().multiplyScalar(0.5));
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0)),
    fuse: 1.6,
  });
  audio.click();
  pushHud();
}

function detonateGrenade(g) {
  scene.remove(g.mesh);
  const flash = new THREE.PointLight(new THREE.Color(0xffffff), 60, 18);
  flash.position.copy(g.mesh.position);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 120);
  audio.grenade();
  for (const bot of bots.items) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.group.position.x - g.mesh.position.x, bot.group.position.z - g.mesh.position.z);
    if (d < 14) {
      bot.blind = 2.5;
      bot.state = 'hold';
    }
  }
  hud.killfeed('Spark grenade burst — Rustjackals blinded');
}

function siteAt(x, z) {
  for (const site of Object.values(SITES)) {
    if (Math.hypot(x - site.center.x, z - site.center.z) <= site.radius) return site;
  }
  return null;
}

function step(dt) {
  elapsed += dt;
  if (phase === 'buy') {
    buyTimer -= dt;
    if (buyTimer <= 0) startRound();
    pushHud();
    return;
  }
  if (phase === 'roundEnd') {
    endTimer -= dt;
    if (endTimer <= 0) {
      if (scoreUs >= WIN_ROUNDS || scoreThem >= WIN_ROUNDS || round >= MAX_ROUNDS) endMatch();
      else {
        round += 1;
        startBuyPhase();
      }
    }
    return;
  }
  if (phase !== 'playing') return;

  player.step(dt, input.state.keys);
  arsenal.step(dt);

  // Scope: right mouse with the Needle zooms the view.
  const wantScope = input.state.scoped && arsenal.def().zoom > 1 && arsenal.ready();
  arsenal.setScoped(wantScope);
  const targetFov = wantScope ? 74 / arsenal.def().zoom : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }

  // Planting: hold E inside a site while carrying the spike.
  const site = siteAt(body.position.x, body.position.z);
  if (spike.state === 'carried' && site && input.state.keys.has('KeyE') && body.alive) {
    spike.plant += dt;
    if (Math.floor(spike.plant) > plantBeepAt) {
      plantBeepAt = Math.floor(spike.plant);
      audio.plantBeep(false);
    }
    if (spike.plant >= PLANT_SECONDS) {
      spike.state = 'planted';
      spike.site = site.name;
      spike.fuse = FUSE_SECONDS;
      money += PLANT_REWARD;
      audio.plantBeep(true);
      hud.banner('Spike planted', `Hold ${site.name} — ${FUSE_SECONDS}s to detonation  +$${PLANT_REWARD}`, 3000);
      hud.killfeed(`Spike planted at ${site.name}`);
    }
  } else {
    spike.plant = 0;
    plantBeepAt = 0;
  }

  if (spike.state === 'planted') {
    spike.fuse -= dt;
    if (spike.fuse <= 0) endRound(true, 'The spike detonated at ' + spike.site + '.');
  } else {
    roundTimer -= dt;
    if (roundTimer <= 0) endRound(false, 'Time ran out with the spike unplanted.');
  }

  const botCtx = {
    time: elapsed,
    playerPos: body.position,
    playerAlive: body.alive,
    spikePlanted: spike.state === 'planted',
    spikeSite: spike.state === 'planted' ? SITES[spike.site].center : null,
    noise: noise && elapsed - noise.at < 1.5 ? noise : null,
    shootFrom: botShoot,
    onDefused: (bot) => {
      if (phase !== 'playing' || spike.state !== 'planted') return;
      spike.state = 'defused';
      hud.killfeed(`${bot.name} defused the spike`);
      endRound(false, `${bot.name} defused the spike.`);
    },
  };
  bots.step(dt, botCtx);

  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 12 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.09) {
      g.mesh.position.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      detonateGrenade(g);
      grenades.splice(i, 1);
    }
  }
  for (let i = tracers.length - 1; i >= 0; i -= 1) {
    const t = tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }

  pushHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (phase === 'playing' && body.alive) {
      const wantFire = input.state.firing && (arsenal.def().auto || input.state.firing);
      if (wantFire && arsenal.ready()) shootPlayer(shot ? 0 : arsenal.spread(player.groundSpeed()));
      if (input.state.keys.has('KeyR')) arsenal.reload();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    hud.setSpread(arsenal.spread(player.groundSpeed()) * 400);
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(0.6, 0, 12.5);
    settle(10);
    aimAt(new THREE.Vector3(-4, 1.5, -4));
    hud.showOverlay('start');
  } else if (name === 'play') {
    phase = 'playing';
    roundTimer = 80;
    money = 1100;
    player.reset(0, 6, 0);
    bots.reset();
    arsenal.buy('rifle');
    arsenal.select('rifle');
    arsenal.refill();
    settle(30);
    // Pick a bot with a clear lane from the player (no cover in between),
    // aim at it and drop it — cover genuinely blocks shots in this game.
    let victim = null;
    let victimPoint = null;
    for (const bot of bots.items) {
      if (!bot.alive) continue;
      const point = new THREE.Vector3(bot.group.position.x, 1.2, bot.group.position.z);
      camera.getWorldDirection(direction);
      direction.copy(point).sub(camera.position).normalize();
      scene.updateMatrixWorld(true);
      raycaster.set(camera.position, direction);
      const hit = raycaster.intersectObjects(shootables, false)[0];
      if (hit && hit.object.userData.bot === bot) {
        victim = bot;
        victimPoint = point;
        break;
      }
    }
    if (victim) {
      for (let roundShot = 0; roundShot < 4; roundShot += 1) {
        // Re-aim each round: the bot keeps moving between shots.
        aimAt(new THREE.Vector3(victim.group.position.x, 1.2, victim.group.position.z));
        shootPlayer(0);
        if (!victim.alive) break;
        settle(8);
      }
    }
    settle(30);
    pushHud();
  } else if (name === 'buy') {
    phase = 'buy';
    money = 3200;
    arsenal.buy('smg');
    player.reset(0, 12.5, 0);
    bots.reset();
    hud.showBuy(money, arsenal.owned, arsenal.grenades);
    settle(10);
    pushHud();
  } else {
    // end: round won, score on the board, two bots down.
    phase = 'roundEnd';
    endTimer = 3.5;
    scoreUs = 1;
    round = 2;
    money = 800 + WIN_REWARD + KILL_REWARD * 2;
    player.reset(-2, 4, 0.4);
    bots.reset();
    bots.items[0].alive = false;
    bots.items[0].fall = 1;
    bots.items[0].group.position.set(-4, -0.08, 0);
    bots.items[0].group.rotation.set(-1.45, 0.6, 0);
    bots.items[1].alive = false;
    bots.items[1].fall = 1;
    bots.items[1].group.position.set(1.5, -0.08, -1.5);
    bots.items[1].group.rotation.set(-1.45, -0.4, 0);
    arsenal.buy('rifle');
    arsenal.select('rifle');
    settle(5);
    // Long hold in shot mode: the capture's real-time clock runs far past the
    // banner's normal 4 s while SwiftShader paints the frozen frames.
    hud.banner('Round won', 'Every Rustjackal is down.', shot ? 60000 : 4000);
    pushHud();
  }
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

pushHud();
syncCamera();
// Dev handle for play-testing in a browser console (not part of the game).
window.__dustline = { bots, player, arsenal, world, camera, raycaster, shootables, THREE, get phase() { return phase; }, get score() { return [scoreUs, scoreThem]; } };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
