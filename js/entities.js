'use strict';
/* =========================================================
   ENTITIES — creating and drawing the player, zombies,
   bullets, pickups and particle effects.
   (Game rules that move them live in game.js.)
   ========================================================= */

/* ---------------- PLAYER ---------------- */

function createPlayer(x, y) {
  const P = CONFIG.PLAYER;
  return {
    x, y,
    radius: P.radius,
    health: P.maxHealth,
    maxHealth: P.maxHealth,
    speed: P.speed,
    ammo: P.magazineSize,
    magazineSize: P.magazineSize,
    reserveAmmo: P.startReserve,
    kills: 0,
    score: 0,

    angle: 0,
    moving: false,
    walkCycle: 0,
    fireCooldown: 0,
    reloading: false,
    reloadTimer: 0,
    rapidFire: 0,   // seconds of rapid fire remaining
    hitFlash: 0,
    muzzleFlash: 0,
    recoil: 0,
    dead: false,
  };
}

/** World position of the pistol's muzzle. */
function gunTip(p) {
  const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
  const fwd = p.radius + 16, side = 3.5;
  return { x: p.x + dx * fwd - dy * side, y: p.y + dy * fwd + dx * side };
}

function drawPlayer(c, p) {
  const r = p.radius;
  c.save();
  c.translate(p.x, p.y);

  // Shadow
  c.fillStyle = 'rgba(0,0,0,0.4)';
  c.beginPath(); c.ellipse(3, 5, r * 1.1, r * 0.95, 0, 0, TAU); c.fill();

  // Rapid fire aura
  if (p.rapidFire > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
    const g = c.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.4);
    g.addColorStop(0, `rgba(255,120,40,${0.35 + 0.2 * pulse})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, r * 2.4, 0, TAU); c.fill();
  }

  c.rotate(p.angle);
  if (p.dead) c.globalAlpha = 0.75;
  const recoil = p.recoil * 3;

  // Feet (walking animation)
  const step = p.moving ? Math.sin(p.walkCycle) * 6 : 0;
  c.fillStyle = '#1f1f22';
  c.beginPath();
  c.ellipse(step, -7, 6, 4, 0, 0, TAU);
  c.ellipse(-step, 7, 6, 4, 0, 0, TAU);
  c.fill();

  // Backpack
  c.fillStyle = '#4b3b2a';
  roundRectPath(c, -r * 1.05, -r * 0.6, r * 0.6, r * 1.2, 4);
  c.fill();

  // Gun
  c.fillStyle = '#1b1c1f';
  c.fillRect(r - 2 - recoil, 1, 18, 5);
  c.fillStyle = '#3d3f45';
  c.fillRect(r + 2 - recoil, 1, 14, 2);

  // Arms
  c.strokeStyle = '#33506a';
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(2, r * 0.8); c.lineTo(r + 1 - recoil, 4);
  c.moveTo(2, -r * 0.8); c.lineTo(r - 3 - recoil, 0);
  c.stroke();
  // Hands
  c.fillStyle = '#e0b48a';
  c.beginPath();
  c.arc(r + 1 - recoil, 4, 3.6, 0, TAU);
  c.arc(r - 3 - recoil, 0, 3.4, 0, TAU);
  c.fill();

  // Body (shoulders)
  c.fillStyle = '#3d5a73';
  c.beginPath(); c.ellipse(0, 0, r * 0.7, r, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.4)';
  c.lineWidth = 1.5;
  c.stroke();

  // Head + hair
  c.fillStyle = '#e0b48a';
  c.beginPath(); c.arc(2, 0, r * 0.52, 0, TAU); c.fill();
  c.fillStyle = '#3b2a1d';
  c.beginPath(); c.arc(1, 0, r * 0.52, Math.PI * 0.55, Math.PI * 1.45); c.closePath(); c.fill();

  // Hit flash
  if (p.hitFlash > 0) {
    c.globalAlpha = Math.min(1, p.hitFlash / CONFIG.PLAYER.hitFlashTime) * 0.75;
    c.fillStyle = '#ff3030';
    c.beginPath(); c.ellipse(0, 0, r * 0.95, r * 1.15, 0, 0, TAU); c.fill();
  }
  c.restore();
}

/* ---------------- ZOMBIES ---------------- */

function createZombie(type, x, y, speedMult) {
  const def = CONFIG.ZOMBIE_TYPES[type];
  return {
    type, x, y,
    radius: def.radius,
    health: def.health,
    maxHealth: def.health,
    speed: def.speed * speedMult * rand(0.9, 1.1),
    damage: def.damage,
    mass: def.mass,
    angle: 0,
    attackCooldown: 0.3,
    hitFlash: 0,
    kx: 0, ky: 0,        // knockback velocity
    anim: rand(0, TAU),
    phase: rand(0, TAU),
    wobbleFreq: rand(1.2, 2.4),
    wobbleAmt: rand(0.15, 0.4),
    spawnT: 0,
    dead: false,
    skin: pick(def.skins),
    cloth: pick(def.cloths),
    eye: def.eye,
  };
}

function drawZombie(c, z) {
  const r = z.radius;
  const alpha = Math.min(1, z.spawnT / 0.5);
  c.save();
  c.translate(z.x, z.y);
  c.globalAlpha = alpha;

  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.ellipse(3, 5, r * 1.05, r * 0.9, 0, 0, TAU); c.fill();

  c.rotate(z.angle);
  const sway = Math.sin(z.anim);

  // Reaching arms
  const reach = r * (z.type === 'fast' ? 1.3 : 1.15);
  c.strokeStyle = z.skin;
  c.lineWidth = r * 0.34;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(r * 0.1, -r * 0.7); c.lineTo(reach + sway * r * 0.14, -r * 0.45 + sway * r * 0.1);
  c.moveTo(r * 0.1, r * 0.7); c.lineTo(reach - sway * r * 0.14, r * 0.45 + sway * r * 0.1);
  c.stroke();

  // Torso
  c.fillStyle = z.cloth;
  c.beginPath(); c.ellipse(-r * 0.05, 0, r * 0.62, r * 0.95, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(-r * 0.25, r * 0.3, r * 0.3, r * 0.4, 0.4, 0, TAU); c.fill();
  c.fillStyle = 'rgba(110,10,10,0.7)';
  c.beginPath(); c.arc(r * 0.15, -r * 0.35, r * 0.22, 0, TAU); c.fill();

  if (z.type === 'tank') {
    c.fillStyle = '#25252a';
    c.beginPath();
    c.ellipse(0, -r * 0.78, r * 0.38, r * 0.28, 0, 0, TAU);
    c.ellipse(0, r * 0.78, r * 0.38, r * 0.28, 0, 0, TAU);
    c.fill();
  }

  // Head
  c.fillStyle = z.skin;
  c.beginPath(); c.arc(r * 0.12, 0, r * 0.5, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = 'rgba(80,0,0,0.7)';
  c.beginPath(); c.arc(-r * 0.05, r * 0.18, r * 0.13, 0, TAU); c.fill();

  // Hit flash
  if (z.hitFlash > 0) {
    c.globalAlpha = alpha * Math.min(1, z.hitFlash / 0.1) * 0.85;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(0, 0, r * 0.75, r, 0, 0, TAU); c.fill();
  }
  c.restore();

  // Health bar when damaged
  if (z.health < z.maxHealth && z.health > 0) {
    const w = r * 2, pct = z.health / z.maxHealth;
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fillRect(z.x - w / 2, z.y - r - 12, w, 4);
    c.fillStyle = pct > 0.5 ? '#8bc34a' : pct > 0.25 ? '#ffb547' : '#e53935';
    c.fillRect(z.x - w / 2, z.y - r - 12, w * pct, 4);
  }
}

/** Glowing eyes, drawn AFTER the darkness layer so they shine in the dark. */
function drawZombieEyes(c, z) {
  const r = z.radius;
  const a = Math.min(1, z.spawnT / 0.5);
  const cos = Math.cos(z.angle), sin = Math.sin(z.angle);
  const fx = r * 0.44;
  for (const side of [-1, 1]) {
    const ox = fx * cos - side * r * 0.2 * sin;
    const oy = fx * sin + side * r * 0.2 * cos;
    c.globalAlpha = 0.25 * a;
    c.fillStyle = z.eye;
    c.beginPath(); c.arc(z.x + ox, z.y + oy, r * 0.28, 0, TAU); c.fill();
    c.globalAlpha = a;
    c.beginPath(); c.arc(z.x + ox, z.y + oy, Math.max(1.4, r * 0.09), 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}

/* ---------------- BULLETS ---------------- */

function drawBullets(c, bullets) {
  c.lineCap = 'round';
  for (const b of bullets) {
    c.strokeStyle = b.rapid ? 'rgba(255,120,40,0.35)' : 'rgba(255,190,80,0.3)';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
    c.lineTo(b.x, b.y);
    c.stroke();
    c.strokeStyle = b.rapid ? '#ffd0a0' : '#fff3c4';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(b.x - b.vx * 0.015, b.y - b.vy * 0.015);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
}

function drawMuzzleFlash(c, p) {
  if (p.muzzleFlash <= 0) return;
  const tip = gunTip(p);
  const s = p.muzzleFlash / 0.06;
  c.save();
  c.translate(tip.x, tip.y);
  c.rotate(p.angle);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 30);
  g.addColorStop(0, `rgba(255,210,100,${0.7 * s})`);
  g.addColorStop(1, 'rgba(255,150,50,0)');
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.fill();
  c.scale(1.7, 1);
  c.fillStyle = `rgba(255,240,190,${s})`;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, rr = i % 2 ? 4 * s : 11 * s;
    c.lineTo(Math.cos(a) * rr + 4, Math.sin(a) * rr);
  }
  c.closePath(); c.fill();
  c.restore();
}

/* ---------------- PICKUPS ---------------- */

const PICKUP_COLORS = { health: '110,231,120', ammo: '255,200,80', rapid: '255,120,40' };

function drawPickup(c, k) {
  if (k.life < 3 && Math.floor(k.life * 8) % 2 === 0) return; // blink before vanishing
  const bob = Math.sin(k.bob) * 3;
  const pop = Math.min(1, k.spawnT / 0.25);
  const col = PICKUP_COLORS[k.type];
  const pulse = 0.5 + 0.5 * Math.sin(k.bob * 1.5);

  c.save();
  c.translate(k.x, k.y + bob);
  c.scale(pop, pop);

  // Glow
  const g = c.createRadialGradient(0, 0, 4, 0, 0, 36);
  g.addColorStop(0, `rgba(${col},${0.35 + 0.2 * pulse})`);
  g.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, 36, 0, TAU); c.fill();
  c.strokeStyle = `rgba(${col},${0.45 + 0.4 * pulse})`;
  c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, 20 + pulse * 3, 0, TAU); c.stroke();

  if (k.type === 'health') {
    roundRectPath(c, -12, -12, 24, 24, 5);
    c.fillStyle = '#f2f2f2'; c.fill();
    c.fillStyle = '#2e9e45';
    c.fillRect(-3.5, -8, 7, 16);
    c.fillRect(-8, -3.5, 16, 7);
  } else if (k.type === 'ammo') {
    roundRectPath(c, -14, -10, 28, 20, 3);
    c.fillStyle = '#4d5a2a'; c.fill();
    c.strokeStyle = '#2c3418'; c.lineWidth = 2; c.stroke();
    for (let i = -1; i <= 1; i++) {
      c.fillStyle = '#c9a23a'; c.fillRect(i * 7 - 2, -6, 4, 9);
      c.fillStyle = '#e8c15a'; c.beginPath(); c.arc(i * 7, -6, 2, Math.PI, 0); c.fill();
    }
    c.fillStyle = '#e8e2c0';
    c.font = 'bold 6px sans-serif';
    c.textAlign = 'center';
    c.fillText('AMMO', 0, 8.5);
  } else {
    const og = c.createRadialGradient(0, 2, 2, 0, 0, 14);
    og.addColorStop(0, '#ffd166');
    og.addColorStop(1, '#e85d04');
    c.fillStyle = og;
    c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();
    // Flame
    c.fillStyle = '#fff3c4';
    c.beginPath();
    c.moveTo(0, -9);
    c.quadraticCurveTo(7, -1, 4, 6);
    c.quadraticCurveTo(0, 9, -4, 6);
    c.quadraticCurveTo(-7, -1, 0, -9);
    c.fill();
  }
  c.restore();
}

/* ---------------- PARTICLES & EFFECTS ---------------- */

const MAX_PARTICLES = 700;

function addParticle(list, p) {
  if (list.length >= MAX_PARTICLES) list.shift();
  list.push(p);
}

function emitBlood(list, x, y, angle, count, color = '#8a1414') {
  for (let i = 0; i < count; i++) {
    const a = angle + rand(-0.7, 0.7), sp = rand(60, 260);
    const life = rand(0.3, 0.7);
    addParticle(list, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, size: rand(1.5, 3.5), color, drag: 5, type: 'dot' });
  }
}

function emitGibs(list, z) {
  const n = z.type === 'tank' ? 34 : 20;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(40, z.type === 'tank' ? 320 : 240);
    const life = rand(0.4, 0.9);
    const chunk = chance(0.35);
    addParticle(list, {
      x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life,
      size: chunk ? rand(3, 5.5) : rand(1.5, 3), color: chunk ? z.skin : '#7a1010', drag: 4.5, type: 'dot',
    });
  }
}

function emitSparks(list, x, y, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU), sp = rand(150, 400), life = rand(0.12, 0.28);
    addParticle(list, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, size: 1.5, color: '#ffd27a', drag: 6, type: 'spark' });
  }
}

function emitCasing(list, p) {
  const side = p.angle + Math.PI / 2 + rand(-0.3, 0.3);
  const sp = rand(90, 150);
  addParticle(list, { x: p.x + Math.cos(p.angle) * 10, y: p.y + Math.sin(p.angle) * 10, vx: Math.cos(side) * sp, vy: Math.sin(side) * sp, life: 0.6, maxLife: 0.6, size: 2.4, color: '#d4a73a', drag: 7, type: 'casing' });
}

function emitBurst(list, x, y, color, count = 16) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rand(-0.2, 0.2), sp = rand(80, 200), life = rand(0.35, 0.6);
    addParticle(list, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, size: rand(2, 3.5), color, drag: 4, type: 'dot' });
  }
}

function emitDust(list, x, y) {
  for (let i = 0; i < 10; i++) {
    const a = rand(0, TAU), sp = rand(20, 70), life = rand(0.4, 0.8);
    addParticle(list, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, size: rand(3, 6), color: 'rgba(120,120,110,0.5)', drag: 3, type: 'dot' });
  }
}

function updateParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) { list.splice(i, 1); continue; }
    const d = Math.exp(-p.drag * dt);
    p.vx *= d; p.vy *= d;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

function drawParticles(c, list) {
  for (const p of list) {
    const a = p.life / p.maxLife;
    c.globalAlpha = Math.min(1, a * 1.5);
    if (p.type === 'spark') {
      c.strokeStyle = p.color;
      c.lineWidth = p.size;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      c.stroke();
    } else {
      c.fillStyle = p.color;
      const s = p.type === 'casing' ? p.size : p.size * (0.5 + a * 0.5);
      c.fillRect(p.x - s / 2, p.y - s / 2, s, p.type === 'casing' ? s * 0.6 : s);
    }
  }
  c.globalAlpha = 1;
}

/** Permanent blood splat painted onto the round's decal layer. */
function paintSplat(g, x, y, size, color = 'rgba(75,8,8,0.55)') {
  g.fillStyle = color;
  g.beginPath();
  const n = randInt(5, 9);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), d = rand(0, size * 0.8), r = rand(size * 0.2, size * 0.55);
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
    g.moveTo(cx + r, cy);
    g.arc(cx, cy, r, 0, TAU);
  }
  for (let i = 0; i < 6; i++) {
    const a = rand(0, TAU), d = rand(size, size * 1.8), r = rand(1, 3);
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
    g.moveTo(cx + r, cy);
    g.arc(cx, cy, r, 0, TAU);
  }
  g.fill();
}

/* ---------------- FLOATING TEXT ---------------- */

function drawFloatingTexts(c, texts) {
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  for (const t of texts) {
    c.globalAlpha = Math.min(1, t.life / 0.4);
    c.font = `800 ${t.size}px 'Segoe UI', system-ui, sans-serif`;
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.strokeText(t.text, t.x, t.y);
    c.fillStyle = t.color;
    c.fillText(t.text, t.x, t.y);
  }
  c.globalAlpha = 1;
}
