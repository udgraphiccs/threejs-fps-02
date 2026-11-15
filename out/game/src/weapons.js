// The armoury: four guns and one grenade. Each entry owns its numbers — damage,
// headshot multiplier, fire rate, magazine, reload, spread and price — so the buy
// menu and the judge can read the trade-offs. The arsenal owns the view model,
// the magazine and the reload, and main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'Sidearm-9', key: '1', price: 0, mag: 12, reserve: 36, damage: 26, head: 2.5,
    gap: 0.16, reload: 1.4, spreadStill: 0.003, spreadMove: 0.02, auto: false, zoom: 1,
  },
  smg: {
    name: 'Hornet-9', key: '2', price: 1500, mag: 30, reserve: 90, damage: 18, head: 2.2,
    gap: 0.075, reload: 1.7, spreadStill: 0.006, spreadMove: 0.032, auto: true, zoom: 1,
  },
  rifle: {
    name: 'Longshot-7', key: '3', price: 2700, mag: 30, reserve: 90, damage: 34, head: 2.5,
    gap: 0.096, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, auto: true, zoom: 1,
  },
  sniper: {
    name: 'Needle-50', key: '4', price: 4750, mag: 5, reserve: 15, damage: 95, head: 2.0,
    gap: 1.1, reload: 2.8, spreadStill: 0.0004, spreadMove: 0.06, auto: false, zoom: 2.4,
  },
};

export const GRENADE_PRICE = 400;
export const ARMOR_PRICE = 650;

export function createArsenal(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  const model = new THREE.Group();
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.16, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let current = 'pistol';
  const state = { mag: 12, reserve: 36, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, scoped: false };
  const owned = { pistol: true, smg: false, rifle: false, sniper: false };
  let grenades = 0;

  function clearModel() {
    while (model.children.length) model.remove(model.children[0]);
  }

  function buildModel() {
    clearModel();
    // One silhouette per gun, so the weapon reads at a glance in the view.
    const add = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      model.add(mesh);
      return mesh;
    };
    if (current === 'pistol') {
      add(0.06, 0.09, 0.24, 0, 0, -0.1, body);
      add(0.05, 0.12, 0.06, 0, -0.09, 0.02, grip);
    } else if (current === 'smg') {
      add(0.07, 0.09, 0.34, 0, 0, -0.12, body);
      add(0.04, 0.04, 0.22, 0, 0.02, -0.36, grip);
      add(0.05, 0.12, 0.05, 0, -0.09, -0.02, grip);
    } else if (current === 'rifle') {
      add(0.09, 0.1, 0.42, 0, 0, -0.1, body);
      add(0.045, 0.045, 0.4, 0, 0.025, -0.38, grip);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.3, grip);
      add(0.03, 0.05, 0.1, 0, 0.07, -0.05, accent);
    } else {
      add(0.08, 0.11, 0.62, 0, 0, -0.2, body);
      add(0.05, 0.05, 0.5, 0, 0.03, -0.5, grip);
      add(0.06, 0.06, 0.12, 0, 0.09, -0.12, accent);
      add(0.07, 0.09, 0.2, 0, -0.03, 0.28, grip);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.rotation.set(0, 0, 0);
  }

  buildModel();

  function def() {
    return WEAPONS[current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    get current() { return current; },
    get grenades() { return grenades; },
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = current === 'sniper' ? 0.12 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return;
      state.reloadLeft = def().reload;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove + (state.scoped ? -0.001 : 0);
    },
    refill() {
      state.mag = def().mag;
      state.reserve = def().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    select(name) {
      if (!owned[name] || name === current) return false;
      current = name;
      state.mag = def().mag;
      state.reserve = def().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.scoped = false;
      buildModel();
      return true;
    },
    buy(name) {
      if (owned[name]) return false;
      owned[name] = true;
      return true;
    },
    addGrenade() {
      grenades += 1;
    },
    useGrenade() {
      if (grenades <= 0) return false;
      grenades -= 1;
      return true;
    },
    resetRound() {
      grenades = 0;
      state.scoped = false;
    },
    setScoped(on) {
      state.scoped = on && def().zoom > 1;
    },
  };
}
