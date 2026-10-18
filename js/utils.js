'use strict';
/* =========================================================
   Small math / helper functions used everywhere
   ========================================================= */

const TAU = Math.PI * 2;

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function chance(p) { return Math.random() < p; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

/** Smoothly rotate angle `a` toward angle `b` (handles wrap-around). */
function angleLerp(a, b, t) {
  let diff = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + diff * t;
}

/** Circle ↔ circle overlap. Both objects need x, y, radius. */
function circlesOverlap(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}

/**
 * Does the line segment (x1,y1)->(x2,y2) pass within `r` of point (cx,cy)?
 * Used for bullets so fast bullets can't "tunnel" through zombies between frames.
 */
function segmentCircleHit(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const ex = cx - (x1 + dx * t), ey = cy - (y1 + dy * t);
  return ex * ex + ey * ey <= r * r;
}

function pointInRect(x, y, r, pad = 0) {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

function circleRectOverlap(cx, cy, radius, r) {
  const nx = clamp(cx, r.x, r.x + r.w), ny = clamp(cy, r.y, r.y + r.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * Push a circle entity (x, y, radius) out of an axis-aligned rectangle.
 * Pushing along the shortest direction makes entities "slide" along walls.
 */
function resolveCircleRect(e, r) {
  const nx = clamp(e.x, r.x, r.x + r.w), ny = clamp(e.y, r.y, r.y + r.h);
  const dx = e.x - nx, dy = e.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= e.radius * e.radius) return false;

  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = e.radius - d;
    e.x += (dx / d) * push;
    e.y += (dy / d) * push;
  } else {
    // Center is inside the rectangle: push out through the closest side
    const left = e.x - r.x, right = r.x + r.w - e.x;
    const top = e.y - r.y, bottom = r.y + r.h - e.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) e.x = r.x - e.radius;
    else if (m === right) e.x = r.x + r.w + e.radius;
    else if (m === top) e.y = r.y - e.radius;
    else e.y = r.y + r.h + e.radius;
  }
  return true;
}

/** Deterministic random generator so the arena looks the same every time. */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Draw only the visible part of a world-sized canvas layer (much faster). */
function drawWorldLayer(c, img, cam, viewW, viewH) {
  const m = 24; // margin for screen shake
  const sx = Math.max(0, Math.floor(cam.x - m));
  const sy = Math.max(0, Math.floor(cam.y - m));
  const ex = Math.min(img.width, Math.ceil(cam.x + viewW + m));
  const ey = Math.min(img.height, Math.ceil(cam.y + viewH + m));
  const sw = ex - sx, sh = ey - sy;
  if (sw > 0 && sh > 0) c.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
}

function formatNumber(n) { return Math.round(n).toLocaleString('en-US'); }

/** localStorage can throw (private mode, blocked storage) — always wrap it. */
const Storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },
};
