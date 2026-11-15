// The DOM HUD: crosshair, hit marker, health, ammo, money, round timer, score,
// kill feed, round banners and the buy menu. It never touches the simulation;
// main.js pushes numbers in and reads the play and buy callbacks out.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

const COPY = {
  start: {
    title: 'Dustline Yard',
    copy: 'Five Rustjackals hold the yard. Plant the spike at A or B — or drop them all. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Dustline Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthValue = $('health-value');
  const healthBar = $('health-bar');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const aliveValue = $('alive-value');
  const spikeValue = $('spike-value');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const crosshair = $('crosshair');
  const buy = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const buyClose = $('buy-close');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'weapon', name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      setText(healthValue, 'hp', String(Math.ceil(health)));
      setText(armorValue, 'armor', armor > 0 ? `+${armor}` : '');
      healthBar.style.width = `${Math.max(0, health)}%`;
      healthBar.classList.toggle('low', health <= 30);
    },
    setMoney(money) { setText(moneyValue, 'money', `$${money}`); },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      timerValue.classList.toggle('low', seconds <= 15);
    },
    setScore(us, them, round) {
      setText(scoreValue, 'score', `Vanguard ${us} — ${them} Rustjackals · Round ${round}`);
    },
    setAlive(alive) { setText(aliveValue, 'alive', `Foes left: ${alive}`); },
    setSpike(text) { setText(spikeValue, 'spike', text); },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(titleText, subText, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() { banner.hidden = true; },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 220);
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${4 + px}px`);
    },
    showBuy(money, owned, grenades) {
      buyMoney.textContent = `Funds: $${money}`;
      buyList.innerHTML = '';
      const rows = [];
      for (const [id, def] of Object.entries(WEAPONS)) {
        rows.push({ label: `${def.name} — $${def.price}`, key: def.key, id, owned: owned[id], price: def.price });
      }
      rows.push({ label: `Spark grenade — $${GRENADE_PRICE} (have ${grenades})`, key: '5', id: 'grenade', owned: false, price: GRENADE_PRICE });
      rows.push({ label: `Plating +50 — $${ARMOR_PRICE}`, key: '6', id: 'armor', owned: false, price: ARMOR_PRICE });
      for (const row of rows) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-row';
        button.innerHTML = `<kbd>${row.key}</kbd><span>${row.label}</span><span>${row.owned ? 'Owned' : ''}</span>`;
        button.addEventListener('click', () => { if (buyHandler) buyHandler(row.id); });
        buyList.appendChild(button);
      }
      buy.hidden = false;
    },
    hideBuy() { buy.hidden = true; },
    onBuy(handler) { buyHandler = handler; },
    onBuyClose(handler) { buyClose.addEventListener('click', handler); },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? score : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
