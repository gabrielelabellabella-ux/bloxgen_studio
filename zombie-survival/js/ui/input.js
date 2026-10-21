// Input unificato: tastiera + mouse (pointer lock) su PC, e lo stesso stato riempito dai controlli touch.

const KEYMAP = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
};
const PRESS = {
  KeyC: 'crouch', ControlLeft: 'crouch', Space: 'shove', KeyE: 'interact', KeyQ: 'cycle', KeyF: 'flash', KeyG: 'throw',
  Digit1: 'hot1', Digit2: 'hot2', Digit3: 'hot3', Digit4: 'hot4', KeyI: 'inv', Tab: 'inv', KeyH: 'health', KeyK: 'craft',
  KeyB: 'build', KeyM: 'map', Escape: 'pause', KeyP: 'pause', KeyR: 'rotate', KeyX: 'drop', KeyZ: 'rest', KeyL: 'skills', KeyN: 'notes',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = {};
    this.pressed = new Set();
    this.look = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.touchMove = { x: 0, y: 0, active: false };
    this.runToggle = false;
    this.wheel = 0;
    this.mouseDown = false;
    this.locked = false;
    this.enabled = true;
    this.captureKeys = true;
    this.sens = 1;
    this.invertY = false;
    this.onLockChange = null;
    this.onDragMode = null;
    this.dragMode = false;
    this.drag = null;
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.captureKeys) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const k = KEYMAP[e.code];
      if (k) this.held[k] = true;
      const p = PRESS[e.code];
      if (p && !e.repeat) this.pressed.add(p);
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.held[k] = false;
    });
    window.addEventListener('blur', () => {
      this.held = {};
      this.mouseDown = false;
      this.drag = null;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      // senza pointer lock (iframe che non lo permette): tieni premuto e trascina per guardare
      if (this.dragMode) {
        this.drag = { button: e.button, moved: 0 };
        if (e.button === 2) this.pressed.add('shove');
        return;
      }
      if (!this.locked) {
        this.requestLock(true);
        return;
      }
      if (e.button === 0) {
        this.pressed.add('attack');
        this.mouseDown = true;
      }
      if (e.button === 2) this.pressed.add('shove');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (this.drag && e.button === this.drag.button) {
        if (this.drag.button === 0 && this.drag.moved < 7) this.pressed.add('attack');
        this.drag = null;
      }
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.look.x += e.movementX * 0.0022 * this.sens;
        this.look.y += e.movementY * 0.0022 * this.sens * (this.invertY ? -1 : 1);
      } else if (this.drag) {
        this.drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
        this.look.x += e.movementX * 0.0036 * this.sens;
        this.look.y += e.movementY * 0.0036 * this.sens * (this.invertY ? -1 : 1);
      }
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked && !(this.dragMode && e.target === this.canvas)) return;
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.mouseDown = false;
        this.held = {};
        this.unlockedAt = performance.now();
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.lockError());
  }

  // un blocco chiesto con un clic che fallisce (non subito dopo un Esc) vuol dire che qui non è permesso
  lockError() {
    if (!this.reqByClick || this.dragMode) return;
    if (performance.now() - (this.unlockedAt || -1e9) < 1600) return;
    this.dragMode = true;
    if (this.onDragMode) this.onDragMode();
  }

  requestLock(byClick = false) {
    if (this.touchMode || this.dragMode) return;
    this.reqByClick = byClick;
    if (!this.canvas.requestPointerLock) {
      if (byClick) this.lockError();
      return;
    }
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => this.lockError());
    } catch (e) {
      this.lockError();
    }
  }
  releaseLock() {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (e) {
        /* niente */
      }
    }
  }

  // da chiamare una volta per frame: calcola il movimento e consuma gli eventi
  poll() {
    let x = 0, y = 0;
    if (this.held.fwd) y += 1;
    if (this.held.back) y -= 1;
    if (this.held.left) x -= 1;
    if (this.held.right) x += 1;
    if (this.touchMove.active) {
      x = this.touchMove.x;
      y = this.touchMove.y;
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    this.move.x = x;
    this.move.y = y;
    const out = {
      move: this.move,
      look: { x: this.look.x, y: this.look.y },
      run: !!this.held.run || this.runToggle,
      attackHeld: this.mouseDown || !!this.held.attack,
      pressed: this.pressed,
      wheel: this.wheel,
    };
    this.look.x = 0;
    this.look.y = 0;
    this.wheel = 0;
    this.pressed = new Set();
    return out;
  }

  tap(name) {
    this.pressed.add(name);
  }
}
