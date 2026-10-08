// wheel.js — the click wheel. Pointer Events (mouse + touch + pen) turn circular drags
// into ticks (one per 22.5°). Taps on MENU / ⏮ / ⏭ / ▶❚❚ act as buttons, but a drag that
// starts on a button still scrolls. The center button supports tap and hold.

const DEG_PER_TICK = 22.5;
const DRAG_START_DEG = 6; // rotation needed before a touch counts as a spin instead of a tap
const DRAG_START_PX = 8;
const HOLD_MS = 550;
const WHEEL_DELTA_PER_TICK = 45;

/**
 * @param {HTMLElement} wheelEl  the round wheel element
 * @param {HTMLElement} centerEl the center button (inside the wheel)
 * @param {object} handlers { tick(dir), menu(), prev(), next(), playPause(), select(), hold(), any() }
 * @param {HTMLElement} scrollTarget element that receives mouse-wheel scrolling
 */
export function createWheel(wheelEl, centerEl, handlers, scrollTarget = wheelEl) {
  // handlers.any(name) runs first for every event; returning false swallows the event.
  const call = (name, ...args) => {
    if (handlers.any?.(name) === false) return undefined;
    return handlers[name]?.(...args);
  };

  let active = null; // the current gesture

  function geometry() {
    const r = wheelEl.getBoundingClientRect();
    const cr = centerEl.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      radius: r.width / 2,
      centerRadius: cr.width / 2,
    };
  }

  function angleOf(x, y, g) {
    return (Math.atan2(y - g.cy, x - g.cx) * 180) / Math.PI;
  }

  /** Which ring button sits at this angle (0° = right, clockwise because y grows downward). */
  function zoneAt(angle) {
    if (angle >= -135 && angle < -45) return 'menu';
    if (angle >= -45 && angle < 45) return 'next';
    if (angle >= 45 && angle < 135) return 'playPause';
    return 'prev';
  }

  function setPressed(zone, on) {
    const label = wheelEl.querySelector(`[data-zone="${zone}"]`);
    if (label) label.classList.toggle('pressed', on);
    if (zone === 'center') centerEl.classList.toggle('pressed', on);
  }

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const g = geometry();
    const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
    if (dist > g.radius + 4) return;

    const inCenter = dist <= g.centerRadius;
    const angle = angleOf(e.clientX, e.clientY, g);
    active = {
      id: e.pointerId,
      g,
      startX: e.clientX,
      startY: e.clientY,
      lastAngle: angle,
      accum: 0, // degrees not yet turned into a tick
      total: 0, // total absolute rotation
      dragging: false,
      zone: inCenter ? 'center' : zoneAt(angle),
      held: false,
      holdTimer: null,
    };
    try {
      wheelEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setPressed(active.zone, true);
    if (handlers.any?.('down') === false) {
      // Gesture swallowed (e.g. it woke the splash screen): ignore it until release.
      active.swallowed = true;
    }

    if (inCenter && !active.swallowed) {
      active.holdTimer = setTimeout(() => {
        if (!active || active.dragging) return;
        active.held = true;
        setPressed('center', false);
        call('hold');
      }, HOLD_MS);
    }
  }

  function startDragging() {
    active.dragging = true;
    clearTimeout(active.holdTimer);
    setPressed(active.zone, false);
    wheelEl.classList.add('spinning');
  }

  function onMove(e) {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    if (active.swallowed) return;
    const g = active.g;
    const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);

    // A press on the center only becomes a spin once the finger leaves the center.
    if (active.zone === 'center' && !active.dragging) {
      if (dist <= g.centerRadius + 6 || active.held) return;
      startDragging();
      active.lastAngle = angleOf(e.clientX, e.clientY, g);
      return;
    }
    // Too close to the middle: the angle jumps around, so ignore this sample.
    if (dist < g.centerRadius * 0.6) return;

    const angle = angleOf(e.clientX, e.clientY, g);
    let delta = angle - active.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    active.lastAngle = angle;
    active.accum += delta;
    active.total += Math.abs(delta);

    if (!active.dragging) {
      const moved = Math.hypot(e.clientX - active.startX, e.clientY - active.startY);
      if (active.total >= DRAG_START_DEG || moved >= DRAG_START_PX) startDragging();
      else return;
    }

    while (Math.abs(active.accum) >= DEG_PER_TICK) {
      const dir = active.accum > 0 ? 1 : -1; // clockwise = down / forward
      active.accum -= dir * DEG_PER_TICK;
      call('tick', dir);
    }
  }

  function onUp(e) {
    if (!active || e.pointerId !== active.id) return;
    const a = active;
    active = null;
    clearTimeout(a.holdTimer);
    setPressed(a.zone, false);
    wheelEl.classList.remove('spinning');
    if (!(e.type === 'pointercancel' || a.dragging || a.held || a.swallowed)) {
      if (a.zone === 'center') call('select');
      else call(a.zone);
    }
    handlers.any?.('up');
  }

  wheelEl.addEventListener('pointerdown', onDown);
  wheelEl.addEventListener('pointermove', onMove);
  wheelEl.addEventListener('pointerup', onUp);
  wheelEl.addEventListener('pointercancel', onUp);
  wheelEl.addEventListener('lostpointercapture', (e) => active && onUp(e));
  wheelEl.addEventListener('contextmenu', (e) => e.preventDefault());

  // Mouse wheel / trackpad scrolling.
  let wheelAccum = 0;
  let wheelReset = null;
  scrollTarget.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      wheelAccum += e.deltaY * unit;
      clearTimeout(wheelReset);
      wheelReset = setTimeout(() => (wheelAccum = 0), 200);
      while (Math.abs(wheelAccum) >= WHEEL_DELTA_PER_TICK) {
        const dir = wheelAccum > 0 ? 1 : -1;
        wheelAccum -= dir * WHEEL_DELTA_PER_TICK;
        call('tick', dir);
      }
    },
    { passive: false }
  );

  return {
    /** Lets keyboard input reuse the same handlers. */
    trigger: (name, ...args) => call(name, ...args),
  };
}
