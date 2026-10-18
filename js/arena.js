'use strict';
/* =========================================================
   ARENA — the abandoned street the fight happens in.
   The static floor, walls and obstacles are drawn ONCE into an
   offscreen canvas, then copied to the screen each frame.
   ========================================================= */

const Arena = (() => {
  const W = CONFIG.WORLD.width;
  const H = CONFIG.WORLD.height;
  const WALL = CONFIG.WORLD.wall;

  // Solid obstacles (axis-aligned rectangles). Player, zombies and bullets collide with them.
  const obstacles = [
    // Wrecked cars
    { type: 'car', x: 300, y: 250, w: 130, h: 64, color: '#6a2a2a' },
    { type: 'car', x: 1500, y: 300, w: 64, h: 130, color: '#2a3d5e', flip: true },
    { type: 'car', x: 1640, y: 1060, w: 130, h: 64, color: '#5a5640', flip: true },
    { type: 'car', x: 420, y: 1000, w: 64, h: 130, color: '#35503a' },
    { type: 'car', x: 1180, y: 1180, w: 130, h: 64, color: '#4b4b55' },
    // Crates
    { type: 'crate', x: 700, y: 380, w: 48, h: 48 },
    { type: 'crate', x: 748, y: 380, w: 48, h: 48 },
    { type: 'crate', x: 700, y: 428, w: 48, h: 48 },
    { type: 'crate', x: 1250, y: 950, w: 48, h: 48 },
    { type: 'crate', x: 1298, y: 950, w: 48, h: 48 },
    { type: 'crate', x: 1150, y: 300, w: 48, h: 48 },
    { type: 'crate', x: 200, y: 640, w: 48, h: 48 },
    { type: 'crate', x: 1752, y: 640, w: 48, h: 48 },
    { type: 'crate', x: 1752, y: 688, w: 48, h: 48 },
    { type: 'crate', x: 760, y: 1180, w: 48, h: 48 },
    // Concrete barricades
    { type: 'barrier', x: 840, y: 1060, w: 220, h: 26 },
    { type: 'barrier', x: 950, y: 190, w: 26, h: 170 },
    { type: 'barrier', x: 1360, y: 600, w: 26, h: 200 },
    { type: 'barrier', x: 560, y: 640, w: 26, h: 180 },
  ];

  // Street lights (visual only). Some flicker.
  const lights = [
    { x: 180, y: 180, radius: 300, flicker: false },
    { x: 1000, y: 120, radius: 280, flicker: true },
    { x: 1820, y: 180, radius: 300, flicker: false },
    { x: 180, y: 1220, radius: 300, flicker: true },
    { x: 1000, y: 1290, radius: 280, flicker: false },
    { x: 1820, y: 1220, radius: 300, flicker: false },
    { x: 640, y: 540, radius: 260, flicker: false },
    { x: 1440, y: 900, radius: 260, flicker: true },
  ];
  lights.forEach(l => { l.intensity = 1; l.target = 1; l.timer = 0; });

  let bg = null;

  /* ---------- Drawing helpers (used once, at build time) ---------- */

  function drawCar(g, o, rnd) {
    const horizontal = o.w >= o.h;
    const L = Math.max(o.w, o.h), D = Math.min(o.w, o.h);
    g.save();
    g.translate(o.x + o.w / 2, o.y + o.h / 2);
    if (!horizontal) g.rotate(Math.PI / 2);
    if (o.flip) g.rotate(Math.PI);

    // Wheels
    g.fillStyle = '#0b0b0c';
    for (const sx of [-1, 1]) {
      g.fillRect(sx * L * 0.3 - 11, -D / 2 - 3, 22, 7);
      g.fillRect(sx * L * 0.3 - 11, D / 2 - 4, 22, 7);
    }
    // Body
    roundRectPath(g, -L / 2, -D / 2, L, D, 12);
    g.fillStyle = o.color;
    g.fill();
    const shade = g.createLinearGradient(0, -D / 2, 0, D / 2);
    shade.addColorStop(0, 'rgba(255,255,255,0.14)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = shade;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.stroke();

    // Hood lines
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(L * 0.3, -D * 0.3); g.lineTo(L * 0.46, -D * 0.25);
    g.moveTo(L * 0.3, D * 0.3); g.lineTo(L * 0.46, D * 0.25);
    g.stroke();

    // Windshield (front = +x)
    g.fillStyle = '#18222b';
    g.beginPath();
    g.moveTo(L * 0.1, -D * 0.38); g.lineTo(L * 0.26, -D * 0.32);
    g.lineTo(L * 0.26, D * 0.32); g.lineTo(L * 0.1, D * 0.38);
    g.closePath(); g.fill();
    // Rear window
    g.beginPath();
    g.moveTo(-L * 0.24, -D * 0.36); g.lineTo(-L * 0.34, -D * 0.3);
    g.lineTo(-L * 0.34, D * 0.3); g.lineTo(-L * 0.24, D * 0.36);
    g.closePath(); g.fill();
    // Roof
    roundRectPath(g, -L * 0.24, -D * 0.37, L * 0.34, D * 0.74, 6);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fill();

    // Cracked glass
    g.strokeStyle = 'rgba(220,235,255,0.35)';
    g.lineWidth = 1;
    const cx = L * 0.18, cy = (rnd() - 0.5) * D * 0.3;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU, len = 6 + rnd() * 10;
      g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    }
    g.stroke();

    // Rust / dents
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(${60 + rnd() * 40},${30 + rnd() * 20},10,0.45)`;
      g.beginPath();
      g.arc((rnd() - 0.5) * L * 0.85, (rnd() - 0.5) * D * 0.8, 2 + rnd() * 6, 0, TAU);
      g.fill();
    }

    // Headlights (one smashed) and tail lights
    g.fillStyle = '#f2e6b5';
    g.fillRect(L / 2 - 5, -D / 2 + 5, 4, 9);
    g.fillStyle = '#2a2a2a';
    g.fillRect(L / 2 - 5, D / 2 - 14, 4, 9);
    g.fillStyle = '#8a1c1c';
    g.fillRect(-L / 2 + 1, -D / 2 + 5, 4, 8);
    g.fillRect(-L / 2 + 1, D / 2 - 13, 4, 8);
    g.restore();
  }

  function drawCrate(g, o) {
    g.fillStyle = '#6b4a2b';
    g.fillRect(o.x, o.y, o.w, o.h);
    g.strokeStyle = 'rgba(30,18,8,0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 1; i < 4; i++) {
      const yy = o.y + (o.h * i) / 4;
      g.moveTo(o.x + 3, yy); g.lineTo(o.x + o.w - 3, yy);
    }
    g.stroke();
    g.strokeStyle = '#3e2a17';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(o.x + 4, o.y + 4); g.lineTo(o.x + o.w - 4, o.y + o.h - 4);
    g.moveTo(o.x + o.w - 4, o.y + 4); g.lineTo(o.x + 4, o.y + o.h - 4);
    g.stroke();
    g.lineWidth = 3;
    g.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
    g.fillStyle = 'rgba(255,220,170,0.12)';
    g.fillRect(o.x + 2, o.y + 2, o.w - 4, 3);
  }

  function drawBarrier(g, o) {
    g.save();
    g.fillStyle = '#6d6f72';
    g.fillRect(o.x, o.y, o.w, o.h);
    g.beginPath();
    g.rect(o.x + 3, o.y + 3, o.w - 6, o.h - 6);
    g.clip();
    // Hazard stripes
    const len = Math.max(o.w, o.h);
    g.translate(o.x, o.y);
    for (let i = -len; i < len * 2; i += 24) {
      g.fillStyle = '#b8901f';
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 12, 0); g.lineTo(i + 12 - len, len); g.lineTo(i - len, len);
      g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, o.w, o.h);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 2;
    g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
  }

  function drawWalls(g) {
    g.fillStyle = '#2a2b30';
    g.fillRect(0, 0, W, WALL);
    g.fillRect(0, H - WALL, W, WALL);
    g.fillRect(0, 0, WALL, H);
    g.fillRect(W - WALL, 0, WALL, H);

    // Brick pattern
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = 0; y < H; y += 10) {
      const off = (y / 10) % 2 ? 11 : 0;
      for (let x = -off; x < W; x += 22) {
        if (y < WALL || y >= H - WALL || x < WALL || x > W - WALL - 22) g.rect(x, y, 22, 10);
      }
    }
    g.stroke();

    // Inner edge highlight + shadow cast onto the floor
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 2;
    g.strokeRect(WALL, WALL, W - WALL * 2, H - WALL * 2);
    const sides = [
      [WALL, WALL, W - WALL * 2, 30, 0, 1],
      [WALL, H - WALL - 30, W - WALL * 2, 30, 0, -1],
      [WALL, WALL, 30, H - WALL * 2, 1, 0],
      [W - WALL - 30, WALL, 30, H - WALL * 2, -1, 0],
    ];
    for (const [x, y, w, h, dx, dy] of sides) {
      const gx0 = dx === -1 ? x + w : x, gy0 = dy === -1 ? y + h : y;
      const gr = g.createLinearGradient(gx0, gy0, gx0 + dx * 30, gy0 + dy * 30);
      gr.addColorStop(0, 'rgba(0,0,0,0.5)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, w, h);
    }
  }

  /** Build the static background once. */
  function build() {
    bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    const g = bg.getContext('2d');
    const rnd = mulberry32(20261018);
    const r = (a, b) => a + rnd() * (b - a);

    // Asphalt base
    g.fillStyle = '#16181b';
    g.fillRect(0, 0, W, H);

    // Large tonal patches
    for (let i = 0; i < 40; i++) {
      const x = r(0, W), y = r(0, H), rad = r(80, 260);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, rnd() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.14)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    // Grain
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${r(0.02, 0.06)})` : `rgba(0,0,0,${r(0.1, 0.25)})`;
      g.fillRect(r(0, W), r(0, H), r(1, 2.5), r(1, 2.5));
    }

    // Sidewalk band along the walls
    const SW = 70;
    g.fillStyle = '#212327';
    g.fillRect(WALL, WALL, W - WALL * 2, SW);
    g.fillRect(WALL, H - WALL - SW, W - WALL * 2, SW);
    g.fillRect(WALL, WALL, SW, H - WALL * 2);
    g.fillRect(W - WALL - SW, WALL, SW, H - WALL * 2);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = WALL; x < W - WALL; x += 35) {
      g.moveTo(x, WALL); g.lineTo(x, WALL + SW);
      g.moveTo(x, H - WALL - SW); g.lineTo(x, H - WALL);
    }
    for (let y = WALL; y < H - WALL; y += 35) {
      g.moveTo(WALL, y); g.lineTo(WALL + SW, y);
      g.moveTo(W - WALL - SW, y); g.lineTo(W - WALL, y);
    }
    g.stroke();
    g.strokeStyle = '#34363b';
    g.lineWidth = 4;
    g.strokeRect(WALL + SW, WALL + SW, W - (WALL + SW) * 2, H - (WALL + SW) * 2);

    // Road markings (faded dashed lines forming a crossroads)
    g.strokeStyle = 'rgba(200,170,60,0.32)';
    g.lineWidth = 5;
    g.setLineDash([40, 30]);
    g.beginPath();
    g.moveTo(WALL + SW + 20, H / 2); g.lineTo(W / 2 - 120, H / 2);
    g.moveTo(W / 2 + 120, H / 2); g.lineTo(W - WALL - SW - 20, H / 2);
    g.moveTo(W / 2, WALL + SW + 20); g.lineTo(W / 2, H / 2 - 120);
    g.moveTo(W / 2, H / 2 + 120); g.lineTo(W / 2, H - WALL - SW - 20);
    g.stroke();
    g.setLineDash([]);

    // Crosswalks
    g.fillStyle = 'rgba(220,220,220,0.09)';
    for (let i = -80; i < 80; i += 22) {
      g.fillRect(W / 2 + 90, H / 2 + i, 34, 12);
      g.fillRect(W / 2 - 124, H / 2 + i, 34, 12);
      g.fillRect(W / 2 + i, H / 2 + 90, 12, 34);
      g.fillRect(W / 2 + i, H / 2 - 124, 12, 34);
    }

    // Cracks
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < 45; i++) {
      let x = r(WALL, W - WALL), y = r(WALL, H - WALL), a = r(0, TAU);
      g.lineWidth = r(0.8, 2);
      g.beginPath();
      g.moveTo(x, y);
      const segs = randIntSeeded(rnd, 4, 9);
      for (let s = 0; s < segs; s++) {
        a += r(-0.8, 0.8);
        x += Math.cos(a) * r(8, 26);
        y += Math.sin(a) * r(8, 26);
        g.lineTo(x, y);
      }
      g.stroke();
    }

    // Oil stains
    for (let i = 0; i < 16; i++) {
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.beginPath();
      g.ellipse(r(100, W - 100), r(100, H - 100), r(15, 45), r(10, 28), r(0, TAU), 0, TAU);
      g.fill();
    }

    // Old blood stains and drag marks
    for (let i = 0; i < 18; i++) {
      const x = r(120, W - 120), y = r(120, H - 120), size = r(14, 34);
      g.fillStyle = `rgba(${r(70, 100)},8,8,0.5)`;
      g.beginPath();
      for (let b = 0; b < 7; b++) {
        const bx = x + r(-size, size) * 0.7, by = y + r(-size, size) * 0.7, br = r(size * 0.25, size * 0.6);
        g.moveTo(bx + br, by);
        g.arc(bx, by, br, 0, TAU);
      }
      g.fill();
      if (rnd() < 0.45) {
        g.strokeStyle = 'rgba(80,8,8,0.28)';
        g.lineWidth = r(6, 12);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y);
        const a = r(0, TAU), len = r(60, 160);
        g.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
      }
    }

    // Manholes
    for (const [mx, my] of [[520, 360], [1480, 1040], [1300, 470], [700, 940]]) {
      g.fillStyle = '#1d1f22';
      g.beginPath(); g.arc(mx, my, 20, 0, TAU); g.fill();
      g.strokeStyle = '#2d2f33'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
      g.beginPath();
      for (let k = -12; k <= 12; k += 6) { g.moveTo(mx - 14, my + k); g.lineTo(mx + 14, my + k); }
      g.stroke();
    }

    // Debris
    for (let i = 0; i < 140; i++) {
      const x = r(WALL, W - WALL), y = r(WALL, H - WALL);
      if (rnd() < 0.4) {
        g.save(); g.translate(x, y); g.rotate(r(0, TAU));
        g.fillStyle = `rgba(210,200,180,${r(0.06, 0.14)})`;
        g.fillRect(-5, -4, r(7, 12), r(5, 9));
        g.restore();
      } else {
        g.fillStyle = `rgba(${r(40, 70)},${r(40, 70)},${r(40, 70)},0.8)`;
        g.beginPath(); g.arc(x, y, r(1, 3), 0, TAU); g.fill();
      }
    }

    // Obstacle shadows, then obstacles
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (const o of obstacles) {
      roundRectPath(g, o.x + 6, o.y + 8, o.w, o.h, o.type === 'car' ? 12 : 3);
      g.fill();
    }
    for (const o of obstacles) {
      if (o.type === 'car') drawCar(g, o, rnd);
      else if (o.type === 'crate') drawCrate(g, o);
      else drawBarrier(g, o);
    }

    drawWalls(g);
  }

  function randIntSeeded(rnd, min, max) { return Math.floor(min + rnd() * (max - min + 1)); }

  /* ---------- Runtime ---------- */

  function update(dt) {
    for (const l of lights) {
      if (!l.flicker) { l.intensity = 1; continue; }
      l.timer -= dt;
      if (l.timer <= 0) {
        l.target = Math.random() < 0.3 ? rand(0.1, 0.4) : 1;
        l.timer = l.target < 1 ? rand(0.04, 0.15) : rand(0.3, 2.5);
      }
      l.intensity = l.target;
    }
  }

  function isBlocked(x, y, radius) {
    if (x < WALL + radius || x > W - WALL - radius || y < WALL + radius || y > H - WALL - radius) return true;
    for (const o of obstacles) if (circleRectOverlap(x, y, radius + 4, o)) return true;
    return false;
  }

  function drawBackground(c, cam, viewW, viewH) {
    drawWorldLayer(c, bg, cam, viewW, viewH);
  }

  /** Warm color added on top of the darkness (call with 'lighter' blending). */
  function drawLightTint(c) {
    for (const l of lights) {
      const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
      g.addColorStop(0, `rgba(255,170,80,${0.13 * l.intensity})`);
      g.addColorStop(1, 'rgba(255,170,80,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(l.x, l.y, l.radius, 0, TAU); c.fill();
    }
  }

  function drawLampHeads(c) {
    for (const l of lights) {
      c.fillStyle = '#2b2d31';
      c.beginPath(); c.arc(l.x, l.y, 8, 0, TAU); c.fill();
      const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, 22);
      g.addColorStop(0, `rgba(255,225,160,${0.9 * l.intensity})`);
      g.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(l.x, l.y, 22, 0, TAU); c.fill();
    }
  }

  return { W, H, WALL, obstacles, lights, build, update, isBlocked, drawBackground, drawLightTint, drawLampHeads };
})();
