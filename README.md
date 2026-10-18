# 🧟 60-Second Zombie Survival

Survive 60 seconds while the horde closes in.
Pure HTML5 + CSS3 + vanilla JavaScript + Canvas. Zero dependencies, no build step.

## ▶ How to run

Double-click `index.html`. It opens in any modern browser (Chrome, Edge, Firefox) and runs from `file://`.

(Optional) To test on your phone, serve the folder on your Wi-Fi, e.g. `npx serve .` or `python -m http.server`, then open the address on the phone.

## 🎮 Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | W A S D / arrows | Left joystick |
| Aim | Mouse | Automatic (nearest zombie) |
| Shoot | Left click (hold) | FIRE button (hold) |
| Reload | R | R button |
| Pause | ESC (or P) | ⏸ button |
| Sound | M | 🔊 button |

## 📁 Project structure

```
index.html      HUD, menus and screens (DOM)
style.css       All styling and animations
js/utils.js     Math, collision and storage helpers
js/config.js    ALL gameplay numbers (balance the game here)
js/audio.js     Web Audio sound effects (synthesized, no files)
js/arena.js     The arena: floor, walls, cars, crates, street lights
js/entities.js  Creating and drawing the player, zombies, bullets, pickups, particles
js/input.js     Keyboard, mouse, joystick and touch buttons
js/game.js      Game state, rules, difficulty, rendering, menus, game loop
```

Scripts load in that order as plain `<script>` tags (not ES modules), which is why the game works when opened straight from disk.

## 🧠 How it works (the big ideas)

1. **Game loop**: `frame()` in `game.js` runs about 60 times a second. It computes `dt` (seconds since the last frame), calls `update(dt)` and then `render()`. Every movement is `speed * dt`, so the game runs at the same speed on any monitor.
2. **States**: `menu → playing ⇄ paused → ending → over`. Only `playing` advances the timer, so pausing truly freezes everything.
3. **Difficulty**: `difficulty = 1 + elapsed / 20` controls spawn interval, max zombies and zombie speed. Fast zombies arrive at 30s elapsed, tanks at 45s, and the last 10 seconds spawn in bursts.
4. **Camera**: the arena (2000×1400) is bigger than the screen. The camera centers on the player and clamps at the walls.
5. **Lighting**: a dark layer is drawn over the world, then "holes" are cut out for street lights, the flashlight cone, muzzle flashes and pickups. Zombie eyes are drawn after the darkness so they glow.
6. **Collision**: circle ↔ circle for bodies and pickups, circle ↔ rectangle for obstacles (with push-out so you slide along walls), and segment ↔ circle for bullets so fast shots never skip through a zombie.

## ⚖ Balancing

Everything is in `js/config.js`. Some good knobs:

- `SPAWN.baseInterval` / `SPAWN.finalIntervalMult`: how fast zombies arrive
- `SPAWN.finalExtraMax`: how crowded the final 10 seconds get
- `PICKUPS.ammo.interval` and `DROPS.ammoChance`: how much ammo you find
- `ZOMBIE_TYPES`: health, speed, damage and score of each zombie

## 🧮 Score

- Kills: Normal +100, Fast +150, Tank +500
- +25 per second survived
- Surviving all 60s: +5,000
- Win only: +20 per remaining health point
- Accuracy bonus: up to +2,000 (needs 10+ shots)

Best score is saved in your browser (localStorage).

## 🚀 Next steps you could build

- A second weapon (shotgun with spread)
- A minimap or arrows pointing to off-screen pickups
- Zombies that steer around obstacles (simple pathfinding)
- An online leaderboard (would need a backend)
