// Raw input: pointer-lock mouse look, the keyboard set, mouse buttons, and
// one-shot key presses (buy menu numbers, grenade keys, reload) queued for
// the simulation to consume. Nothing here knows what a key means.

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = [];
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let aiming = false;
  let locked = false;

  canvas.addEventListener('click', () => {
    // Locking is requested by the HUD's play button and by clicking the
    // canvas while a round is running; this listener is the fallback.
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) { firing = false; aiming = false; }
    onLockChange(locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    lookX += e.movementX;
    lookY += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) aiming = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
    if (e.button === 2) aiming = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (!e.repeat) pressed.push(e.code);
    keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); firing = false; aiming = false; });

  return {
    state: { keys },
    get firing() { return firing; },
    get aiming() { return aiming; },
    get locked() { return locked; },
    requestLock() { canvas.requestPointerLock(); },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    takePressed() {
      const out = pressed.slice();
      pressed.length = 0;
      return out;
    },
  };
}
