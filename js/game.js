'use strict';
/* =========================================================
   60-SECOND ZOMBIE SURVIVAL — main game: state, rules,
   game loop, rendering and menus.
   ========================================================= */

/* =========================================================
   1. CANVAS & VIEW
   ========================================================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Darkness/lighting is drawn on a half-resolution offscreen canvas (cheaper, softer).
const lightCanvas = document.createElement('canvas');
const lctx = lightCanvas.getContext('2d');
const LIGHT_SCALE = 0.5;

const view = { w: 0, h: 0, dpr: 1, zoom: 1, worldW: 0, worldH: 0 };

function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  // Zoom so roughly the same amount of arena is visible on any screen size
  view.zoom = clamp(Math.min(view.w / 1100, view.h / 680), 0.55, 1.2);
  view.worldW = view.w / view.zoom;
  view.worldH = view.h / view.zoom;
  lightCanvas.width = Math.ceil(view.w * LIGHT_SCALE);
  lightCanvas.height = Math.ceil(view.h * LIGHT_SCALE);
  buildMenuSkyline();
}

/* =========================================================
   2. SETTINGS & STATE
   ========================================================= */
const settings = Object.assign({ sound: true, shake: true, autoReload: false }, Storage.get('zs_settings', {}));
function saveSettings() { Storage.set('zs_settings', settings); }

const Game = {
  state: 'menu', // menu | playing | paused | ending | over
  time: 0,       // seconds elapsed this round
  player: null,
  zombies: [],
  bullets: [],
  pickups: [],
  particles: [],
  texts: [],
  decalCanvas: null,
  decalCtx: null,
  camera: { x: 0, y: 0 },
  shake: 0,
  damageFlash: 0,
  winFlash: 0,
  spawnTimer: 0,
  pickupTimers: {},
  stats: null,
  events: [],
  lastCountdown: null,
  groanTimer: 2,
  endTimer: 0,
  result: null,
  bestScore: Storage.get('zs_best', 0),
};

/* =========================================================
   3. DIFFICULTY  (difficulty = 1 + elapsedTime / 20)
   ========================================================= */
function getDifficulty(t) { return 1 + t / 20; }
function isFinalStretch(t) { return t >= CONFIG.SURVIVAL_TIME - 10; }

function getSpawnInterval(t) {
  const S = CONFIG.SPAWN;
  let interval = S.baseInterval / getDifficulty(t);
  if (isFinalStretch(t)) interval *= S.finalIntervalMult;
  return Math.max(S.minInterval, interval);
}
function getMaxZombies(t) {
  const S = CONFIG.SPAWN;
  return Math.floor(S.baseMax + getDifficulty(t) * S.maxPerDifficulty + (isFinalStretch(t) ? S.finalExtraMax : 0));
}
function getSpeedMultiplier(t) { return 1 + (getDifficulty(t) - 1) * CONFIG.SPAWN.speedGrowth; }

function pickZombieType(t) {
  const S = CONFIG.SPAWN;
  const r = Math.random();
  const tanks = Game.zombies.filter(z => z.type === 'tank').length;
  if (t >= S.tankFrom) {
    if (r < 0.12 && tanks < S.maxTanks) return 'tank';
    if (r < 0.47) return 'fast';
    return 'normal';
  }
  if (t >= S.fastFrom) return r < 0.3 ? 'fast' : 'normal';
  return 'normal';
}

/* =========================================================
   4. ROUND SETUP
   ========================================================= */
function resetRound() {
  Game.player = createPlayer(Arena.W / 2, Arena.H / 2);
  Game.zombies = [];
  Game.bullets = [];
  Game.pickups = [];
  Game.particles = [];
  Game.texts = [];
  Game.time = 0;
  Game.shake = 0;
  Game.damageFlash = 0;
  Game.winFlash = 0;
  Game.spawnTimer = 0.6;
  Game.groanTimer = 2;
  Game.lastCountdown = null;
  Game.result = null;
  Game.pickupTimers = {
    health: CONFIG.PICKUPS.health.interval,
    ammo: CONFIG.PICKUPS.ammo.firstAt,
    rapid: CONFIG.PICKUPS.rapid.firstAt,
  };
  Game.stats = { shotsFired: 0, shotsHit: 0, kills: 0, killScore: 0, byType: { normal: 0, fast: 0, tank: 0 } };
  Game.events = CONFIG.EVENTS.map(e => Object.assign({ done: false }, e));

  // Fresh blood layer every round
  if (!Game.decalCanvas) {
    Game.decalCanvas = document.createElement('canvas');
    Game.decalCanvas.width = Arena.W;
    Game.decalCanvas.height = Arena.H;
    Game.decalCtx = Game.decalCanvas.getContext('2d');
  }
  Game.decalCtx.clearRect(0, 0, Arena.W, Arena.H);
  updateCamera();
}

/* =========================================================
   5. PLAYER LOGIC
   ========================================================= */
function clampToWorld(e) {
  e.x = clamp(e.x, Arena.WALL + e.radius, Arena.W - Arena.WALL - e.radius);
  e.y = clamp(e.y, Arena.WALL + e.radius, Arena.H - Arena.WALL - e.radius);
}

function nearestZombie(x, y, maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const z of Game.zombies) {
    if (z.dead || z.spawnT < 0.3) continue;
    const dx = z.x - x, dy = z.y - y, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = z; }
  }
  return best;
}

function updatePlayer(dt) {
  const p = Game.player;

  // --- Movement (WASD / arrows / joystick) ---
  let mx = 0, my = 0;
  if (Input.isDown('KeyW') || Input.isDown('ArrowUp')) my -= 1;
  if (Input.isDown('KeyS') || Input.isDown('ArrowDown')) my += 1;
  if (Input.isDown('KeyA') || Input.isDown('ArrowLeft')) mx -= 1;
  if (Input.isDown('KeyD') || Input.isDown('ArrowRight')) mx += 1;
  if (Input.touch.active) { mx += Input.touch.moveX; my += Input.touch.moveY; }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }

  p.x += mx * p.speed * dt;
  p.y += my * p.speed * dt;
  for (const o of Arena.obstacles) resolveCircleRect(p, o);
  clampToWorld(p);
  p.moving = len > 0.1;
  if (p.moving) p.walkCycle += dt * 12;

  // --- Aiming ---
  if (Input.mode === 'mouse') {
    const wx = Input.mouse.x / view.zoom + Game.camera.x;
    const wy = Input.mouse.y / view.zoom + Game.camera.y;
    p.angle = Math.atan2(wy - p.y, wx - p.x);
  } else {
    const target = nearestZombie(p.x, p.y, 650);
    let desired = p.angle;
    if (target) desired = Math.atan2(target.y - p.y, target.x - p.x);
    else if (p.moving) desired = Math.atan2(my, mx);
    p.angle = angleLerp(p.angle, desired, Math.min(1, dt * 14));
  }

  // --- Timers ---
  p.fireCooldown -= dt;
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  p.muzzleFlash = Math.max(0, p.muzzleFlash - dt);
  p.recoil = Math.max(0, p.recoil - dt * 8);
  if (p.rapidFire > 0) {
    p.rapidFire = Math.max(0, p.rapidFire - dt);
  }

  // --- Reloading ---
  if (p.reloading) {
    p.reloadTimer += dt;
    if (p.reloadTimer >= CONFIG.PLAYER.reloadTime) finishReload();
  }

  // --- Shooting ---
  const wantsFire = (Input.mode === 'mouse' && Input.mouse.down) || Input.touch.fire;
  if (wantsFire) tryShoot();

  if (settings.autoReload && p.ammo === 0 && !p.reloading && p.reserveAmmo > 0) startReload();
}

function tryShoot() {
  const p = Game.player;
  if (p.fireCooldown > 0) return;

  if (p.reloading) {
    if (p.ammo > 0) cancelReload(); // interrupt reload to shoot the bullets still loaded
    else return;
  }
  if (p.ammo <= 0) {
    p.fireCooldown = 0.3;
    Sound.dryFire();
    return;
  }

  const rapid = p.rapidFire > 0;
  p.fireCooldown = rapid ? CONFIG.RAPID_FIRE.fireDelay : CONFIG.PLAYER.fireDelay;
  p.ammo--;
  Game.stats.shotsFired++;

  const spread = CONFIG.WEAPON.spread * (rapid ? 1.6 : 1);
  const a = p.angle + rand(-spread, spread);
  const speed = CONFIG.WEAPON.bulletSpeed * (rapid ? CONFIG.RAPID_FIRE.bulletSpeedMult : 1);
  const tip = gunTip(p);
  Game.bullets.push({
    x: tip.x, y: tip.y, px: tip.x, py: tip.y,
    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    life: CONFIG.WEAPON.bulletLife, damage: CONFIG.WEAPON.damage, rapid,
  });

  p.muzzleFlash = 0.06;
  p.recoil = 1;
  emitCasing(Game.particles, p);
  addShake(1.5);
  Sound.shoot(rapid);
}

function startReload() {
  const p = Game.player;
  if (p.reloading || p.ammo >= p.magazineSize) return;
  if (p.reserveAmmo <= 0) {
    addText(p.x, p.y - 30, 'NO AMMO', '#ff5252', 15);
    return;
  }
  p.reloading = true;
  p.reloadTimer = 0;
  Sound.reloadStart();
}

function finishReload() {
  const p = Game.player;
  const take = Math.min(p.magazineSize - p.ammo, p.reserveAmmo);
  p.ammo += take;
  p.reserveAmmo -= take;
  p.reloading = false;
  p.reloadTimer = 0;
  Sound.reloadEnd();
}

function cancelReload() {
  const p = Game.player;
  p.reloading = false;
  p.reloadTimer = 0;
}

function hurtPlayer(amount, z) {
  const p = Game.player;
  if (p.health <= 0) return;
  p.health = Math.max(0, p.health - amount);
  p.hitFlash = CONFIG.PLAYER.hitFlashTime;
  Game.damageFlash = 0.55;
  addShake(7);
  Sound.playerHurt();
  const a = Math.atan2(p.y - z.y, p.x - z.x);
  emitBlood(Game.particles, p.x, p.y, a, 8, '#b71c1c');
  p.x += Math.cos(a) * 6;
  p.y += Math.sin(a) * 6;
  addText(p.x, p.y - 28, `-${amount}`, '#ff5252', 15);
}

/* =========================================================
   6. BULLETS
   ========================================================= */
function updateBullets(dt) {
  const W = Arena.W, H = Arena.H, WALL = Arena.WALL;
  for (let i = Game.bullets.length - 1; i >= 0; i--) {
    const b = Game.bullets[i];
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    let remove = b.life <= 0;

    // Outer walls
    if (!remove && (b.x < WALL || b.x > W - WALL || b.y < WALL || b.y > H - WALL)) {
      emitSparks(Game.particles, clamp(b.x, WALL, W - WALL), clamp(b.y, WALL, H - WALL));
      remove = true;
    }
    // Obstacles
    if (!remove) {
      for (const o of Arena.obstacles) {
        if (pointInRect(b.x, b.y, o, 1)) {
          emitSparks(Game.particles, b.px, b.py);
          remove = true;
          break;
        }
      }
    }
    // Zombies (segment test so fast bullets never pass through)
    if (!remove) {
      for (const z of Game.zombies) {
        if (z.dead) continue;
        if (segmentCircleHit(b.px, b.py, b.x, b.y, z.x, z.y, z.radius + CONFIG.WEAPON.bulletRadius)) {
          Game.stats.shotsHit++;
          damageZombie(z, b);
          remove = true;
          break;
        }
      }
    }
    if (remove) Game.bullets.splice(i, 1);
  }
}

/* =========================================================
   7. ZOMBIES
   ========================================================= */
function findSpawnPoint(radius) {
  const p = Game.player;
  const halfDiag = Math.hypot(view.worldW, view.worldH) / 2;
  for (let tries = 0; tries < 24; tries++) {
    const a = rand(0, TAU);
    const d = Math.min(halfDiag + rand(30, 140), 1200);
    let x = p.x + Math.cos(a) * d;
    let y = p.y + Math.sin(a) * d;
    x = clamp(x, Arena.WALL + radius + 2, Arena.W - Arena.WALL - radius - 2);
    y = clamp(y, Arena.WALL + radius + 2, Arena.H - Arena.WALL - radius - 2);
    if (dist(x, y, p.x, p.y) < 330) continue;
    if (Arena.isBlocked(x, y, radius)) continue;
    return { x, y };
  }
  return null;
}

function spawnZombie(type) {
  const def = CONFIG.ZOMBIE_TYPES[type];
  const pt = findSpawnPoint(def.radius);
  if (!pt) return;
  const z = createZombie(type, pt.x, pt.y, getSpeedMultiplier(Game.time));
  z.angle = Math.atan2(Game.player.y - z.y, Game.player.x - z.x);
  Game.zombies.push(z);
  emitDust(Game.particles, z.x, z.y);
}

function updateSpawning(dt) {
  Game.spawnTimer -= dt;
  if (Game.spawnTimer > 0) return;
  const t = Game.time;
  Game.spawnTimer = getSpawnInterval(t);

  let count = 1;
  if (isFinalStretch(t)) count = chance(0.55) ? randInt(2, 3) : 1;
  else if (t >= CONFIG.SPAWN.tankFrom) count = chance(0.35) ? 2 : 1;
  else if (t >= CONFIG.SPAWN.fastFrom) count = chance(0.15) ? 2 : 1;

  const max = getMaxZombies(t);
  for (let i = 0; i < count && Game.zombies.length < max; i++) spawnZombie(pickZombieType(t));
}

function damageZombie(z, b) {
  z.health -= b.damage;
  z.hitFlash = 0.1;
  const a = Math.atan2(b.vy, b.vx);
  const kb = CONFIG.ZOMBIE.knockback / z.mass;
  z.kx += Math.cos(a) * kb;
  z.ky += Math.sin(a) * kb;
  emitBlood(Game.particles, z.x, z.y, a, 6);
  if (z.health <= 0) killZombie(z);
  else Sound.zombieHit();
}

function killZombie(z, silent) {
  if (z.dead) return;
  z.dead = true;
  emitGibs(Game.particles, z);
  paintSplat(Game.decalCtx, z.x, z.y, z.radius * 1.2);
  if (silent) return;

  const def = CONFIG.ZOMBIE_TYPES[z.type];
  const st = Game.stats;
  st.kills++;
  st.killScore += def.score;
  st.byType[z.type]++;
  Game.player.kills = st.kills;
  addText(z.x, z.y - z.radius, `+${def.score}`, z.type === 'tank' ? '#ff7a2f' : '#ffb547', z.type === 'tank' ? 20 : 15);
  Sound.zombieDeath(z.type);
  if (z.type === 'tank') addShake(8);

  // Occasional drops
  if (chance(CONFIG.DROPS.ammoChance) && countPickups('ammo') < 3) spawnPickup('ammo', z.x, z.y);
  else if (chance(CONFIG.DROPS.healthChance) && countPickups('health') < 2) spawnPickup('health', z.x, z.y);
}

function updateZombies(dt) {
  const p = Game.player;
  const zs = Game.zombies;
  const kd = Math.exp(-10 * dt);

  for (const z of zs) {
    if (z.dead) continue;
    z.spawnT += dt;
    z.attackCooldown -= dt;
    z.hitFlash = Math.max(0, z.hitFlash - dt);
    z.anim += dt * (2 + z.speed * 0.06);

    // Head toward the player, with a little shambling wobble
    const dx = p.x - z.x, dy = p.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const w = Math.sin(Game.time * z.wobbleFreq + z.phase) * z.wobbleAmt;
    let dirx = nx - ny * w, diry = ny + nx * w;
    const dl = Math.hypot(dirx, diry) || 1;
    dirx /= dl; diry /= dl;

    // Freshly spawned zombies "rise" for a moment before chasing
    const speed = z.spawnT < 0.35 ? 0 : z.speed;
    z.angle = angleLerp(z.angle, Math.atan2(diry, dirx), Math.min(1, dt * 6));
    z.x += (dirx * speed + z.kx) * dt;
    z.y += (diry * speed + z.ky) * dt;
    z.kx *= kd; z.ky *= kd;

    for (const o of Arena.obstacles) {
      if (z.x + z.radius > o.x && z.x - z.radius < o.x + o.w && z.y + z.radius > o.y && z.y - z.radius < o.y + o.h) {
        resolveCircleRect(z, o);
      }
    }
    clampToWorld(z);

    // Bite!
    if (p.health > 0 && d < z.radius + p.radius + 4 && z.attackCooldown <= 0 && z.spawnT > 0.35) {
      hurtPlayer(z.damage, z);
      z.attackCooldown = CONFIG.ZOMBIE.attackCooldown;
    }
  }

  // Separation: zombies push each other apart so they form a crowd, not a single blob
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i];
    if (a.dead) continue;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const overlap = min - d;
        const total = a.mass + b.mass;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * overlap * (b.mass / total);
        a.y -= uy * overlap * (b.mass / total);
        b.x += ux * overlap * (a.mass / total);
        b.y += uy * overlap * (a.mass / total);
      }
    }
    // Don't overlap the player
    const dx = a.x - p.x, dy = a.y - p.y;
    const min = a.radius + p.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      a.x = p.x + (dx / d) * min;
      a.y = p.y + (dy / d) * min;
    }
  }

  Game.zombies = zs.filter(z => !z.dead);
}

/* =========================================================
   8. PICKUPS
   ========================================================= */
function countPickups(type) { return Game.pickups.filter(k => k.type === type).length; }

function findPickupPoint() {
  const p = Game.player;
  const maxD = Math.max(240, Math.min(view.worldW, view.worldH) * 0.45);
  for (let tries = 0; tries < 30; tries++) {
    const a = rand(0, TAU), d = rand(160, maxD);
    const x = clamp(p.x + Math.cos(a) * d, Arena.WALL + 40, Arena.W - Arena.WALL - 40);
    const y = clamp(p.y + Math.sin(a) * d, Arena.WALL + 40, Arena.H - Arena.WALL - 40);
    if (dist(x, y, p.x, p.y) < 140) continue;
    if (Arena.isBlocked(x, y, 24)) continue;
    return { x, y };
  }
  return null;
}

function spawnPickup(type, x, y) {
  if (x === undefined) {
    const pt = findPickupPoint();
    if (!pt) return;
    x = pt.x; y = pt.y;
  }
  const def = CONFIG.PICKUPS[type];
  Game.pickups.push({ type, x, y, radius: def.radius, life: def.life, bob: rand(0, TAU), spawnT: 0 });
}

function collectPickup(k) {
  const p = Game.player;
  if (k.type === 'health') {
    if (p.health >= p.maxHealth) return false;
    const gained = Math.min(CONFIG.PICKUPS.health.amount, p.maxHealth - p.health);
    p.health += gained;
    addText(p.x, p.y - 30, `+${Math.round(gained)} HP`, '#7CFC8A', 16);
    emitBurst(Game.particles, k.x, k.y, '#7CFC8A');
    Sound.pickup();
  } else if (k.type === 'ammo') {
    if (p.reserveAmmo >= CONFIG.PLAYER.maxReserve) return false;
    const gained = Math.min(CONFIG.PICKUPS.ammo.amount, CONFIG.PLAYER.maxReserve - p.reserveAmmo);
    p.reserveAmmo += gained;
    addText(p.x, p.y - 30, `+${gained} AMMO`, '#ffd166', 16);
    emitBurst(Game.particles, k.x, k.y, '#ffd166');
    Sound.pickup();
  } else if (k.type === 'rapid') {
    p.rapidFire = CONFIG.RAPID_FIRE.duration;
    showMessage('🔥 RAPID FIRE!', 'fire', 1.4);
    emitBurst(Game.particles, k.x, k.y, '#ff7a2f', 24);
    Sound.powerUp();
  }
  return true;
}

function updatePickups(dt) {
  // Timed spawns
  for (const type of ['health', 'ammo', 'rapid']) {
    const def = CONFIG.PICKUPS[type];
    Game.pickupTimers[type] -= dt;
    if (Game.pickupTimers[type] <= 0) {
      Game.pickupTimers[type] = def.interval * rand(0.8, 1.2);
      if (countPickups(type) < def.maxActive) spawnPickup(type);
    }
  }
  // Lifetime & collection
  const p = Game.player;
  for (let i = Game.pickups.length - 1; i >= 0; i--) {
    const k = Game.pickups[i];
    k.life -= dt;
    k.bob += dt * 3;
    k.spawnT += dt;
    if (k.life <= 0) { Game.pickups.splice(i, 1); continue; }
    if (circlesOverlap(k, p) && collectPickup(k)) Game.pickups.splice(i, 1);
  }
}

/* =========================================================
   9. EFFECTS, CAMERA, EVENTS
   ========================================================= */
function addShake(amount) { Game.shake = Math.min(14, Math.max(Game.shake, amount)); }

function addText(x, y, text, color, size = 15) {
  Game.texts.push({ x, y, text, color, size, life: 0.9 });
}

function updateEffects(dt) {
  updateParticles(Game.particles, dt);
  for (let i = Game.texts.length - 1; i >= 0; i--) {
    const t = Game.texts[i];
    t.life -= dt;
    t.y -= 38 * dt;
    if (t.life <= 0) Game.texts.splice(i, 1);
  }
  Game.shake = Math.max(0, Game.shake - dt * 30);
  Game.damageFlash = Math.max(0, Game.damageFlash - dt * 1.6);
  Game.winFlash = Math.max(0, Game.winFlash - dt * 1.2);
  Arena.update(dt);
}

function updateCamera() {
  const p = Game.player;
  const cam = Game.camera;
  cam.x = view.worldW >= Arena.W ? (Arena.W - view.worldW) / 2 : clamp(p.x - view.worldW / 2, 0, Arena.W - view.worldW);
  cam.y = view.worldH >= Arena.H ? (Arena.H - view.worldH) / 2 : clamp(p.y - view.worldH / 2, 0, Arena.H - view.worldH);
}

function updateEvents() {
  for (const ev of Game.events) {
    if (!ev.done && Game.time >= ev.at) {
      ev.done = true;
      showMessage(ev.text, ev.cls, 2.2);
    }
  }
  // Countdown beeps for the final 10 seconds
  const sec = Math.ceil(CONFIG.SURVIVAL_TIME - Game.time);
  if (sec <= 10 && sec >= 1 && sec !== Game.lastCountdown) {
    Game.lastCountdown = sec;
    Sound.countdown(sec <= 3);
  }
}

/* =========================================================
   10. MAIN UPDATE
   ========================================================= */
function updatePlaying(dt) {
  Game.time += dt;
  if (Game.time >= CONFIG.SURVIVAL_TIME) {
    Game.time = CONFIG.SURVIVAL_TIME;
    winRound();
    return;
  }

  updateEvents();
  updatePlayer(dt);
  updateBullets(dt);
  updateZombies(dt);
  updateSpawning(dt);
  updatePickups(dt);
  updateEffects(dt);
  updateCamera();

  // Ambient groans — more often when the horde is big
  Game.groanTimer -= dt;
  if (Game.groanTimer <= 0 && Game.zombies.length) {
    Sound.groan();
    Game.groanTimer = rand(1.5, 3.5) / Math.min(2.5, 1 + Game.zombies.length / 15);
  }

  if (Game.player.health <= 0) loseRound();
}

function updateEnding(dt) {
  Game.endTimer -= dt;
  const slow = dt * (Game.result.won ? 1 : 0.4); // slow-motion death
  if (!Game.result.won) updateZombies(slow);
  updateBullets(slow);
  updateEffects(slow);
  Game.player.muzzleFlash = Math.max(0, Game.player.muzzleFlash - dt);
  updateCamera();
  if (Game.endTimer <= 0) showEndScreen();
}

function loseRound() {
  const p = Game.player;
  p.dead = true;
  p.reloading = false;
  Game.state = 'ending';
  Game.result = { won: false };
  Game.endTimer = 1.6;
  addShake(12);
  emitBlood(Game.particles, p.x, p.y, 0, 30, '#b71c1c');
  emitBlood(Game.particles, p.x, p.y, Math.PI, 30, '#b71c1c');
  paintSplat(Game.decalCtx, p.x, p.y, 26, 'rgba(110,10,10,0.7)');
  Sound.death();
  ui.reloadPrompt.classList.add('hidden');
  showMessage('💀 YOU DIED', 'danger', 1.6);
}

function winRound() {
  Game.state = 'ending';
  Game.result = { won: true };
  Game.endTimer = 2;
  Game.winFlash = 1;
  for (const z of Game.zombies) killZombie(z, true); // the horde collapses
  Game.zombies = [];
  Game.player.reloading = false;
  addShake(10);
  Sound.victory();
  ui.reloadPrompt.classList.add('hidden');
  showMessage('🏆 YOU SURVIVED!', 'win', 2);
}

/* =========================================================
   11. SCORE
   ========================================================= */
function getAccuracy() {
  const s = Game.stats;
  return s.shotsFired > 0 ? s.shotsHit / s.shotsFired : 0;
}

function liveScore() {
  return Game.stats.killScore + Math.floor(Game.time * CONFIG.SCORE.perSecond);
}

function computeFinalScore(won) {
  const S = CONFIG.SCORE, st = Game.stats, p = Game.player;
  const parts = {
    kills: st.killScore,
    time: Math.floor(Game.time * S.perSecond),
    health: won ? Math.round(p.health * S.perHealth) : 0,
    survival: won ? S.survivalBonus : 0,
    accuracy: st.shotsFired >= S.minShotsForAccuracy ? Math.round(getAccuracy() * S.accuracyMax) : 0,
  };
  parts.total = parts.kills + parts.time + parts.health + parts.survival + parts.accuracy;
  return parts;
}

/* =========================================================
   12. RENDERING
   ========================================================= */
function renderLighting(sx, sy) {
  const p = Game.player, cam = Game.camera, z = view.zoom, L = LIGHT_SCALE;
  const lw = lightCanvas.width, lh = lightCanvas.height;
  const toX = wx => ((wx - cam.x) * z + sx) * L;
  const toY = wy => ((wy - cam.y) * z + sy) * L;

  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, lw, lh);
  lctx.fillStyle = 'rgba(4,6,10,0.74)';
  lctx.fillRect(0, 0, lw, lh);

  // Cut holes in the darkness wherever there is light
  lctx.globalCompositeOperation = 'destination-out';
  const punch = (x, y, r, strength) => {
    if (x + r < 0 || y + r < 0 || x - r > lw || y - r > lh) return;
    const g = lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath(); lctx.arc(x, y, r, 0, TAU); lctx.fill();
  };

  for (const l of Arena.lights) punch(toX(l.x), toY(l.y), l.radius * z * L, 0.92 * l.intensity);

  const px = toX(p.x), py = toY(p.y);
  punch(px, py, 190 * z * L, 0.9);

  // Flashlight cone in the aiming direction
  if (!p.dead) {
    const cr = 600 * z * L;
    const g = lctx.createRadialGradient(px, py, 0, px, py, cr);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.65, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath();
    lctx.moveTo(px, py);
    lctx.arc(px, py, cr, p.angle - 0.45, p.angle + 0.45);
    lctx.closePath();
    lctx.fill();
  }
  if (p.muzzleFlash > 0) {
    const tip = gunTip(p);
    punch(toX(tip.x), toY(tip.y), 280 * z * L, 0.9);
  }
  for (const b of Game.bullets) punch(toX(b.x), toY(b.y), 40 * z * L, 0.6);
  for (const k of Game.pickups) punch(toX(k.x), toY(k.y), 60 * z * L, 0.7);

  ctx.drawImage(lightCanvas, 0, 0, view.w, view.h);
}

function renderWorld() {
  const p = Game.player, cam = Game.camera, z = view.zoom, dpr = view.dpr;
  const s = settings.shake ? Game.shake : 0;
  const sx = s ? rand(-s, s) : 0, sy = s ? rand(-s, s) : 0;
  const setWorld = () => ctx.setTransform(dpr * z, 0, 0, dpr * z, (-cam.x * z + sx) * dpr, (-cam.y * z + sy) * dpr);

  // --- World layer ---
  setWorld();
  Arena.drawBackground(ctx, cam, view.worldW, view.worldH);
  drawWorldLayer(ctx, Game.decalCanvas, cam, view.worldW, view.worldH);
  for (const k of Game.pickups) drawPickup(ctx, k);
  for (const zb of Game.zombies) drawZombie(ctx, zb);
  drawPlayer(ctx, p);
  drawParticles(ctx, Game.particles);

  // --- Darkness ---
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderLighting(sx, sy);

  // --- Glowing things on top of the darkness ---
  setWorld();
  ctx.globalCompositeOperation = 'lighter';
  Arena.drawLightTint(ctx);
  for (const zb of Game.zombies) drawZombieEyes(ctx, zb);
  drawBullets(ctx, Game.bullets);
  drawMuzzleFlash(ctx, p);
  Arena.drawLampHeads(ctx);
  ctx.globalCompositeOperation = 'source-over';
  drawFloatingTexts(ctx, Game.texts);

  // --- Screen-space overlays ---
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlays();
  drawCrosshair();
}

function drawOverlays() {
  const w = view.w, h = view.h, p = Game.player;
  const now = performance.now() / 1000;

  // Permanent soft vignette
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);

  // Red vignette: damage, low health, final countdown
  let red = Game.damageFlash * 0.9;
  if (!p.dead && p.health <= 30) red = Math.max(red, 0.22 + 0.14 * Math.sin(now * 7));
  if (Game.state === 'playing' && isFinalStretch(Game.time)) red = Math.max(red, 0.16 + 0.12 * Math.sin(Game.time * TAU));
  if (p.dead) red = Math.max(red, 0.5);
  if (red > 0.01) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(170,0,0,0)');
    g.addColorStop(1, `rgba(170,0,0,${Math.min(0.75, red)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (Game.winFlash > 0) {
    ctx.fillStyle = `rgba(255,240,200,${Game.winFlash * 0.6})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawCrosshair() {
  if (Input.mode !== 'mouse' || Game.state !== 'playing') return;
  const p = Game.player, x = Input.mouse.x, y = Input.mouse.y;
  const gap = 5 + p.recoil * 6, len = 7;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = p.ammo === 0 ? '#ff4d4d' : p.rapidFire > 0 ? '#ffb070' : 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
  ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
  ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
  ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
  if (p.reloading) {
    ctx.strokeStyle = '#ffb547';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + TAU * (p.reloadTimer / CONFIG.PLAYER.reloadTime));
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- Main menu background scene ---------- */
const menuScene = { time: 0, walkers: [], fog: [], skyline: [], lightning: 0 };

function buildMenuSkyline() {
  const rnd = mulberry32(7);
  menuScene.skyline = [];
  let x = 0;
  while (x < view.w + 60) {
    const bw = 40 + rnd() * 90, bh = 40 + rnd() * 150;
    const windows = [];
    for (let i = 0; i < 6; i++) if (rnd() < 0.35) windows.push({ x: rnd() * (bw - 10), y: rnd() * (bh - 14), flick: rnd() });
    menuScene.skyline.push({ x, w: bw, h: bh, windows });
    x += bw + rnd() * 6;
  }
}

function initMenuScene() {
  menuScene.walkers = [];
  for (let i = 0; i < 9; i++) {
    menuScene.walkers.push({ x: rand(-100, window.innerWidth), speed: rand(10, 24), scale: rand(0.55, 1.5), phase: rand(0, TAU), dir: chance(0.5) ? 1 : -1 });
  }
  menuScene.walkers.sort((a, b) => a.scale - b.scale);
  menuScene.fog = [];
  for (let i = 0; i < 7; i++) menuScene.fog.push({ x: rand(0, 1), y: rand(0.6, 1), r: rand(0.25, 0.5), speed: rand(0.005, 0.02) });
}

function updateMenuScene(dt) {
  menuScene.time += dt;
  const w = view.w;
  for (const z of menuScene.walkers) {
    z.x += z.speed * z.scale * z.dir * dt;
    z.phase += dt * z.speed * 0.13;
    if (z.dir > 0 && z.x > w + 120) z.x = -120 - rand(0, 300);
    if (z.dir < 0 && z.x < -120) z.x = w + 120 + rand(0, 300);
  }
  for (const f of menuScene.fog) { f.x += f.speed * dt; if (f.x > 1.5) f.x = -0.5; }
  menuScene.lightning = Math.max(0, menuScene.lightning - dt * 2.5);
  if (chance(dt * 0.08)) menuScene.lightning = 1;
}

function drawSilhouette(c, x, groundY, s, phase, dir, color) {
  c.save();
  c.translate(x, groundY);
  c.scale(s * dir, s);
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineCap = 'round';
  const step = Math.sin(phase);
  const bob = Math.abs(Math.cos(phase)) * 3;
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(0, -52 + bob); c.lineTo(step * 15, 0);
  c.moveTo(0, -52 + bob); c.lineTo(-step * 15, 0);
  c.stroke();
  c.lineWidth = 17;
  c.beginPath(); c.moveTo(0, -50 + bob); c.lineTo(9, -94 + bob); c.stroke();
  c.beginPath(); c.arc(17, -106 + bob, 11, 0, TAU); c.fill();
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(10, -88 + bob); c.lineTo(42, -86 + bob + Math.sin(phase * 0.7) * 4);
  c.moveTo(8, -84 + bob); c.lineTo(38, -78 + bob + Math.cos(phase * 0.7) * 4);
  c.stroke();
  c.restore();
}

function renderMenuScene() {
  const w = view.w, h = view.h;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  const horizon = h * 0.72;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#07080d');
  sky.addColorStop(1, '#2a1012');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // Moon
  const mx = w * 0.78, my = h * 0.2, mr = Math.min(w, h) * 0.07;
  const glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
  glow.addColorStop(0, 'rgba(255,220,200,0.18)');
  glow.addColorStop(1, 'rgba(255,220,200,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  ctx.fillStyle = '#e6d8c8';
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, TAU); ctx.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.15, 0, TAU); ctx.fill();

  // Skyline
  for (const b of menuScene.skyline) {
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(b.x, horizon - b.h, b.w, b.h);
    for (const win of b.windows) {
      const on = Math.sin(menuScene.time * (1 + win.flick * 3) + win.flick * 10) > -0.6;
      if (!on) continue;
      ctx.fillStyle = `rgba(255,170,80,${0.25 + win.flick * 0.3})`;
      ctx.fillRect(b.x + win.x, horizon - b.h + win.y + 4, 5, 7);
    }
  }

  // Ground
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, '#0d0d10');
  ground.addColorStop(1, '#030304');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Walkers (far ones lighter, near ones darker)
  for (const z of menuScene.walkers) {
    const t = (z.scale - 0.55) / 0.95;
    const groundY = horizon + t * (h - horizon) * 0.75 + 6;
    const shade = Math.round(22 - t * 20);
    drawSilhouette(ctx, z.x, groundY, z.scale, z.phase, z.dir, `rgb(${shade},${shade},${shade + 3})`);
  }

  // Fog
  for (const f of menuScene.fog) {
    const fx = f.x * w, fy = f.y * h, fr = f.r * Math.max(w, h);
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    g.addColorStop(0, 'rgba(120,110,120,0.10)');
    g.addColorStop(1, 'rgba(120,110,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
  }

  if (menuScene.lightning > 0) {
    ctx.fillStyle = `rgba(200,210,255,${menuScene.lightning * menuScene.lightning * 0.12})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#050607';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (Game.state === 'menu' || !Game.player) renderMenuScene();
  else renderWorld();
}

/* =========================================================
   13. UI (HUD + screens)
   ========================================================= */
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'),
  healthStat: $('healthStat'), healthFill: $('healthFill'), healthText: $('healthText'),
  ammoStat: $('ammoStat'), ammoText: $('ammoText'), reserveText: $('reserveText'),
  reloadBox: $('reloadBox'), reloadFill: $('reloadFill'), reloadPct: $('reloadPct'),
  powerBox: $('powerBox'), powerText: $('powerText'),
  timerText: $('timerText'), killsText: $('killsText'), scoreText: $('scoreText'),
  soundBtn: $('soundBtn'),
  centerMsg: $('centerMsg'),
  reloadPrompt: $('reloadPrompt'), reloadPromptText: $('reloadPromptText'), reloadPromptHint: $('reloadPromptHint'),
  touch: $('touchControls'),
  bestScore: $('bestScore'),
  pauseTime: $('pauseTime'),
  screens: { menu: $('menuScreen'), howto: $('howtoScreen'), settings: $('settingsScreen'), pause: $('pauseScreen'), end: $('endScreen') },
};
let currentScreen = 'menu';

function showScreen(name) {
  currentScreen = name;
  for (const k in ui.screens) ui.screens[k].classList.toggle('hidden', k !== name);
}

const hudCache = {};
function setText(key, el, value) {
  const v = String(value);
  if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; }
}

function updateHUD() {
  const p = Game.player;
  if (!p) return;
  setText('hp', ui.healthText, Math.ceil(p.health));
  ui.healthFill.style.width = `${(p.health / p.maxHealth) * 100}%`;
  ui.healthStat.classList.toggle('low', p.health <= 30);

  setText('ammo', ui.ammoText, p.ammo);
  setText('res', ui.reserveText, p.reserveAmmo);
  ui.ammoStat.classList.toggle('empty', p.ammo === 0);

  ui.reloadBox.classList.toggle('hidden', !p.reloading);
  if (p.reloading) {
    const pct = Math.min(1, p.reloadTimer / CONFIG.PLAYER.reloadTime);
    ui.reloadFill.style.width = `${pct * 100}%`;
    setText('rpct', ui.reloadPct, `${Math.floor(pct * 100)}%`);
  }

  const needReload = Game.state === 'playing' && p.ammo === 0 && !p.reloading;
  ui.reloadPrompt.classList.toggle('hidden', !needReload);
  if (needReload) {
    const hasAmmo = p.reserveAmmo > 0;
    setText('rpt', ui.reloadPromptText, hasAmmo ? 'RELOAD!' : 'NO AMMO!');
    setText('rph', ui.reloadPromptHint, hasAmmo ? (Input.mode === 'touch' ? 'tap R' : 'press R') : 'find an ammo pickup');
  }

  ui.powerBox.classList.toggle('hidden', !(p.rapidFire > 0));
  if (p.rapidFire > 0) setText('pw', ui.powerText, `${p.rapidFire.toFixed(1).padStart(4, '0')}s`);

  const remaining = Math.max(0, CONFIG.SURVIVAL_TIME - Game.time);
  setText('timer', ui.timerText, remaining.toFixed(1));
  ui.timerText.classList.toggle('danger', remaining <= 10);
  setText('kills', ui.killsText, Game.stats.kills);
  setText('score', ui.scoreText, formatNumber(liveScore()));
}

let msgTimer = null;
function showMessage(text, cls = '', duration = 2) {
  const el = ui.centerMsg;
  el.className = 'center-msg';
  void el.offsetWidth; // restart CSS animation
  el.textContent = text;
  el.className = `center-msg show ${cls}`;
  el.style.animationDuration = `${duration}s`;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => el.classList.remove('show'), duration * 1000);
}

function applySettings() {
  Sound.setEnabled(settings.sound);
  const setToggle = (id, on) => { const el = $(id); el.textContent = on ? 'ON' : 'OFF'; el.classList.toggle('off', !on); };
  setToggle('setSound', settings.sound);
  setToggle('setShake', settings.shake);
  setToggle('setAuto', settings.autoReload);
  ui.soundBtn.textContent = settings.sound ? '🔊' : '🔇';
  saveSettings();
}

function startGame() {
  Sound.init();
  resetRound();
  Game.state = 'playing';
  showScreen(null);
  ui.hud.classList.remove('hidden');
  ui.touch.classList.toggle('hidden', !Input.isTouchDevice);
  document.body.classList.add('playing');
  Input.reset();
  for (const k in hudCache) delete hudCache[k];
  ui.centerMsg.className = 'center-msg';
  updateHUD();
}

function pauseGame() {
  if (Game.state !== 'playing') return;
  Game.state = 'paused';
  Input.reset();
  ui.pauseTime.textContent = Math.max(0, CONFIG.SURVIVAL_TIME - Game.time).toFixed(1);
  showScreen('pause');
  ui.touch.classList.add('hidden');
  document.body.classList.remove('playing');
}

function resumeGame() {
  if (Game.state !== 'paused') return;
  Game.state = 'playing';
  Input.reset();
  showScreen(null);
  ui.touch.classList.toggle('hidden', !Input.isTouchDevice);
  document.body.classList.add('playing');
}

function goToMenu() {
  Game.state = 'menu';
  Game.player = null;
  showScreen('menu');
  ui.hud.classList.add('hidden');
  ui.touch.classList.add('hidden');
  document.body.classList.remove('playing');
  ui.bestScore.textContent = formatNumber(Game.bestScore);
}

function showEndScreen() {
  Game.state = 'over';
  Game.shake = 0;
  const won = Game.result.won;
  const score = computeFinalScore(won);
  const p = Game.player;
  p.score = score.total;

  const isBest = score.total > Game.bestScore;
  if (isBest) { Game.bestScore = score.total; Storage.set('zs_best', score.total); }

  const title = $('endTitle');
  title.textContent = won ? '🏆 YOU SURVIVED!' : '💀 YOU DIED';
  title.className = `end-title ${won ? 'win' : 'lose'}`;
  $('endSubtitle').textContent = won ? 'You outlasted the horde.' : 'The horde got you.';
  $('statTime').textContent = won ? '60 seconds' : `${Game.time.toFixed(1)} seconds`;
  const bt = Game.stats.byType;
  $('statKills').textContent = `${Game.stats.kills}` + (Game.stats.kills ? `  (${bt.normal}/${bt.fast}/${bt.tank})` : '');
  $('statKills').title = 'normal / fast / tank';
  $('statHealthLabel').classList.toggle('hidden', !won);
  $('statHealth').classList.toggle('hidden', !won);
  $('statHealth').textContent = Math.ceil(p.health);
  $('statAcc').textContent = `${Math.round(getAccuracy() * 100)}%  (${Game.stats.shotsHit}/${Game.stats.shotsFired})`;

  const rows = [['Zombie kills', score.kills], ['Survival time', score.time]];
  if (won) rows.push(['Survived 60s', score.survival], ['Health bonus', score.health]);
  rows.push(['Accuracy bonus', score.accuracy]);
  $('scoreBreakdown').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>+${formatNumber(v)}</b>`).join('');
  $('newBest').classList.toggle('hidden', !isBest);

  animateNumber($('statScore'), score.total, 1100);
  ui.hud.classList.add('hidden');
  ui.touch.classList.add('hidden');
  document.body.classList.remove('playing');
  showScreen('end');
}

function animateNumber(el, target, ms) {
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = formatNumber(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function handleAction(action) {
  switch (action) {
    case 'start':
    case 'restart': startGame(); break;
    case 'howto': showScreen('howto'); break;
    case 'settings': showScreen('settings'); break;
    case 'back': showScreen(Game.state === 'paused' ? 'pause' : 'menu'); break;
    case 'pause': pauseGame(); break;
    case 'resume': resumeGame(); break;
    case 'menu': goToMenu(); break;
    case 'toggle-sound': settings.sound = !settings.sound; applySettings(); break;
    case 'toggle-shake': settings.shake = !settings.shake; applySettings(); break;
    case 'toggle-autoreload': settings.autoReload = !settings.autoReload; applySettings(); break;
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  Sound.init();
  Sound.click();
  handleAction(btn.dataset.action);
  btn.blur(); // so Space/Enter don't re-trigger the button
});

Input.handlers.keydown = e => {
  Sound.init();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (Game.state === 'playing') pauseGame();
    else if (Game.state === 'paused') currentScreen === 'pause' ? resumeGame() : showScreen('pause');
    else if (Game.state === 'menu' && currentScreen !== 'menu') showScreen('menu');
  } else if (e.code === 'KeyR') {
    if (Game.state === 'playing') startReload();
  } else if (e.code === 'KeyM') {
    handleAction('toggle-sound');
  } else if (e.code === 'Enter' && ((Game.state === 'menu' && currentScreen === 'menu') || Game.state === 'over')) {
    startGame();
  }
};
Input.handlers.reload = () => { if (Game.state === 'playing') startReload(); };

// Pause automatically when the tab is hidden
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

/* =========================================================
   14. GAME LOOP
   ========================================================= */
let lastTime = performance.now();

function frame(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  dt = clamp(dt, 0, 0.05); // avoid huge jumps after lag / tab switch

  if (Game.state === 'playing') { updatePlaying(dt); updateHUD(); }
  else if (Game.state === 'ending') { updateEnding(dt); updateHUD(); }
  else if (Game.state === 'menu') updateMenuScene(dt);

  render();
  requestAnimationFrame(frame);
}

/* =========================================================
   15. BOOT
   ========================================================= */
Arena.build();
resize();
window.addEventListener('resize', resize);
initMenuScene();
applySettings();
goToMenu();
requestAnimationFrame(frame);
