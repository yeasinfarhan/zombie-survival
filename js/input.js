'use strict';
/* =========================================================
   INPUT — keyboard, mouse and mobile touch controls.
   The game reads this state every frame.
   ========================================================= */

const Input = {
  keys: new Set(),
  mouse: { x: 0, y: 0, down: false },
  touch: { active: false, moveX: 0, moveY: 0, fire: false },
  mode: 'mouse', // 'mouse' (desktop aiming) or 'touch' (auto-aim)
  isTouchDevice: false,
  handlers: {},  // game.js fills these in: keydown(e), reload()

  isDown(code) { return this.keys.has(code); },

  reset() {
    this.keys.clear();
    this.mouse.down = false;
    this.touch.fire = false;
    this.touch.active = false;
    this.touch.moveX = 0;
    this.touch.moveY = 0;
    resetJoystickVisual();
    const fireBtn = document.getElementById('touchFire');
    if (fireBtn) fireBtn.classList.remove('active');
  },
};

function resetJoystickVisual() {
  const knob = document.getElementById('joyKnob');
  if (knob) knob.style.transform = 'translate(0px, 0px)';
}

(function setupInput() {
  const canvas = document.getElementById('game');
  const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

  Input.isTouchDevice = ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (Input.isTouchDevice && !(window.matchMedia && window.matchMedia('(pointer: fine)').matches)) Input.mode = 'touch';

  /* ---- Keyboard ---- */
  window.addEventListener('keydown', e => {
    if (GAME_KEYS.includes(e.code) && !(e.target && e.target.tagName === 'BUTTON' && e.code === 'Space')) e.preventDefault();
    if (!e.repeat && Input.handlers.keydown) Input.handlers.keydown(e);
    Input.keys.add(e.code);
  });
  window.addEventListener('keyup', e => Input.keys.delete(e.code));
  window.addEventListener('blur', () => Input.reset());

  /* ---- Mouse ---- */
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    Input.mouse.x = e.clientX;
    Input.mouse.y = e.clientY;
    Input.mode = 'mouse';
  });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) {
        Input.mouse.down = true;
        Input.mouse.x = e.clientX;
        Input.mouse.y = e.clientY;
        Input.mode = 'mouse';
      }
    } else {
      Input.isTouchDevice = true;
    }
  });
  window.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse' && e.button === 0) Input.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  /* ---- Touch: virtual joystick ---- */
  const joy = document.getElementById('joystick');
  const knob = document.getElementById('joyKnob');
  let joyId = null;

  function updateJoy(e) {
    const rect = joy.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const max = rect.width / 2 - 10;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let mx = dx / max, my = dy / max;
    if (Math.hypot(mx, my) < 0.15) { mx = 0; my = 0; } // dead zone
    Input.touch.moveX = mx;
    Input.touch.moveY = my;
    Input.touch.active = true;
  }
  function endJoy(e) {
    if (e.pointerId !== joyId) return;
    joyId = null;
    Input.touch.active = false;
    Input.touch.moveX = 0;
    Input.touch.moveY = 0;
    resetJoystickVisual();
  }
  joy.addEventListener('pointerdown', e => {
    e.preventDefault();
    joyId = e.pointerId;
    try { joy.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    Input.mode = 'touch';
    updateJoy(e);
  });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) updateJoy(e); });
  joy.addEventListener('pointerup', endJoy);
  joy.addEventListener('pointercancel', endJoy);

  /* ---- Touch: fire & reload buttons ---- */
  const fire = document.getElementById('touchFire');
  const setFire = (on) => { Input.touch.fire = on; fire.classList.toggle('active', on); };
  fire.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { fire.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    Input.mode = 'touch';
    setFire(true);
  });
  fire.addEventListener('pointerup', () => setFire(false));
  fire.addEventListener('pointercancel', () => setFire(false));

  document.getElementById('touchReload').addEventListener('pointerdown', e => {
    e.preventDefault();
    Input.mode = 'touch';
    if (Input.handlers.reload) Input.handlers.reload();
  });
})();
