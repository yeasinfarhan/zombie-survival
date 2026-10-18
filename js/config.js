'use strict';
/* =========================================================
   CONFIG — every gameplay number lives here.
   Tweak these to balance the game without touching logic.
   ========================================================= */

const CONFIG = {
  SURVIVAL_TIME: 60, // seconds

  WORLD: {
    width: 2000,
    height: 1400,
    wall: 40, // thickness of the outer wall
  },

  PLAYER: {
    radius: 16,
    speed: 220,
    maxHealth: 100,
    magazineSize: 12,
    startReserve: 60,
    maxReserve: 96,     // reserve ammo cap so pickups can't be hoarded
    reloadTime: 1.2,
    fireDelay: 0.2,     // seconds between shots (hold to fire)
    hitFlashTime: 0.25,
  },

  WEAPON: {
    damage: 25,
    bulletSpeed: 950,
    bulletRadius: 3,
    bulletLife: 0.9,
    spread: 0.03, // radians of random inaccuracy
  },

  RAPID_FIRE: {
    duration: 5,
    fireDelay: 0.075,
    bulletSpeedMult: 1.3,
  },

  ZOMBIE_TYPES: {
    normal: {
      health: 50, speed: 50, damage: 10, radius: 17, mass: 1, score: 100,
      skins: ['#6f8f55', '#7a9a5c', '#5f7f4a', '#768a5a'],
      cloths: ['#4a3f5c', '#5c4433', '#3d4f5c', '#5a5a42', '#5b3a3a'],
      eye: '#ff3b2f',
    },
    fast: {
      health: 30, speed: 90, damage: 8, radius: 14, mass: 0.7, score: 150,
      skins: ['#a3b86c', '#b5c47a', '#9fb070'],
      cloths: ['#6b2f2f', '#2f4f6b', '#3f3f3f'],
      eye: '#ffd23f',
    },
    tank: {
      health: 150, speed: 30, damage: 20, radius: 27, mass: 3, score: 500,
      skins: ['#5d6b5a', '#6a5f6e'],
      cloths: ['#2d2d33', '#3b2b2b'],
      eye: '#ff2a6d',
    },
  },

  ZOMBIE: {
    attackCooldown: 0.8, // seconds between bites from the same zombie
    knockback: 230,      // knockback speed when hit by a bullet (divided by mass)
  },

  // Difficulty: difficulty = 1 + elapsed / 20  (1.0 → 4.0 over the round)
  SPAWN: {
    baseInterval: 1.6,     // seconds between spawns at difficulty 1
    minInterval: 0.22,
    finalIntervalMult: 0.7, // final 10 seconds spawn 30% faster
    baseMax: 8,            // max zombies alive = baseMax + difficulty * maxPerDifficulty
    maxPerDifficulty: 9,
    finalExtraMax: 8,
    speedGrowth: 0.2,      // +20% speed per difficulty point
    fastFrom: 30,          // elapsed seconds when fast zombies appear
    tankFrom: 45,          // elapsed seconds when tank zombies appear
    maxTanks: 4,
  },

  PICKUPS: {
    health: { amount: 25, radius: 16, interval: 11, maxActive: 1, life: 14 },
    ammo:   { amount: 12, radius: 16, interval: 6,  maxActive: 2, life: 14, firstAt: 5 },
    rapid:  { radius: 16, interval: 16, maxActive: 1, life: 10, firstAt: 12 },
  },

  DROPS: {
    ammoChance: 0.09,   // chance a killed zombie drops ammo
    healthChance: 0.025,
  },

  SCORE: {
    perSecond: 25,       // points per second survived
    survivalBonus: 5000, // for surviving the full 60 seconds
    perHealth: 20,       // per remaining health point (win only)
    accuracyMax: 2000,   // 100% accuracy = +2000
    minShotsForAccuracy: 10,
  },

  // Messages shown at specific elapsed times
  EVENTS: [
    { at: 0.1, text: 'SURVIVE 60 SECONDS', cls: '' },
    { at: 15, text: 'THE HORDE GROWS…', cls: '' },
    { at: 30, text: '⚡ FAST ZOMBIES!', cls: 'danger' },
    { at: 45, text: '⚠ TANK ZOMBIES!', cls: 'danger' },
    { at: 50, text: 'FINAL 10 SECONDS!', cls: 'danger' },
  ],
};
