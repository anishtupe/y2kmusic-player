// main.js — wires everything together: scaling the device to the screen, the click wheel,
// keyboard shortcuts, the "tap to start" screen, backlight, battery, offline handling.

import * as store from './storage.js';
import { player } from './player.js';
import { createWheel } from './wheel.js';
import { Navigator, buildMenus } from './menus.js';
import { NowPlayingView } from './nowplaying.js';
import { applySkin } from './skins.js';
import { unlockAudio, click, setClickSound } from './sound.js';
import { toast, ICON } from './ui.js';
import { sparkles, starTrail } from './fx.js';

const $ = (id) => document.getElementById(id);

// Design size of the device in CSS pixels (style.css uses the same numbers).
const DEVICE_W = 340;
const DEVICE_H = 580;
const YT_MIN = 200; // YouTube's minimum player size
const CONTENT_H = 262; // screen content height (style.css)

// ---------------------------------------------------------------------------
// Settings
const settings = store.getSettings();
applySkin(settings.skin);
setClickSound(settings.clickSound);

// Wheel glyphs as SVG so phones don't turn them into emoji.
$('wl-prev').innerHTML = ICON.prev;
$('wl-next').innerHTML = ICON.next;
$('wl-play').innerHTML = ICON.playPause;

// ---------------------------------------------------------------------------
// Fit the device to the window. On phones it fills the height with no scrolling.
// The YouTube player is sized so that it is >= 200x200 *on screen* after scaling.

const wrap = $('device-wrap');
const screen = $('screen');

function fit() {
  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;
  const mobile = vw < 600;
  const marquee = document.querySelector('.marquee')?.offsetHeight || 0;
  const padX = mobile ? 8 : 48;
  const padY = mobile ? 8 + marquee : 64 + marquee;
  let scale = Math.min((vw - padX) / DEVICE_W, (vh - padY) / DEVICE_H);
  scale = Math.min(scale, mobile ? 1.15 : 1.3);
  scale = Math.max(scale, 0.5);
  document.documentElement.style.setProperty('--scale', scale.toFixed(4));
  wrap.style.width = `${DEVICE_W * scale}px`;
  wrap.style.height = `${DEVICE_H * scale}px`;
  // The iframe must be >= 200 CSS px (what YouTube itself measures) AND >= 200 px on screen.
  const yt = Math.min(CONTENT_H, Math.max(YT_MIN, Math.ceil(YT_MIN / scale) + 1));
  document.documentElement.style.setProperty('--yt-size', `${yt}px`);
  document.body.classList.toggle('is-mobile', mobile);
}
fit();
window.addEventListener('resize', fit);
window.visualViewport?.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 250));

// ---------------------------------------------------------------------------
// Screens

const nav = new Navigator($('panes'), $('tb-title'));
const npView = new NowPlayingView(screen);
npView.navUpdateTitle = () => nav.top === npView && nav.updateTitle();

const ctx = {
  nav,
  playSongs(songs, index = 0, opts = {}) {
    if (!songs?.length) return;
    player.playQueue(songs, index, opts);
    ctx.openNowPlaying();
  },
  openNowPlaying() {
    nav.push(npView);
  },
  queueNext(song) {
    const r = player.insertNext(song);
    if (r === 'playing') ctx.openNowPlaying();
    else toast(`"${song.song}" plays next`, 'ok');
  },
  onBacklightChange(sec) {
    backlight.set(sec);
  },
};

const { main } = buildMenus(ctx);
nav.setRoot(main);

// ---------------------------------------------------------------------------
// Backlight: dim the screen after a while without input.

const backlight = {
  sec: settings.backlight,
  timer: null,
  set(sec) {
    this.sec = sec;
    this.poke();
  },
  poke() {
    screen.classList.remove('dim');
    clearTimeout(this.timer);
    if (this.sec > 0) this.timer = setTimeout(() => screen.classList.add('dim'), this.sec * 1000);
  },
};
backlight.poke();

// ---------------------------------------------------------------------------
// "Tap the wheel to start" — browsers (especially phones) only allow sound after a tap.

const splash = $('splash');
let splashOn = true;
const wheelEl = $('wheel');
wheelEl.classList.add('hint');

function dismissSplash() {
  if (!splashOn) return;
  splashOn = false;
  unlockAudio();
  splash.classList.add('gone');
  wheelEl.classList.remove('hint');
  setTimeout(() => splash.remove(), 500);
  click('press');
}
splash.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  dismissSplash();
});

// ---------------------------------------------------------------------------
// The wheel

const actions = {
  tick(dir) {
    if (nav.top.onTick?.(dir)) click('tick');
  },
  menu() {
    click('press');
    if (!nav.top.onMenu?.()) nav.pop();
  },
  prev() {
    click('press');
    if (!nav.top.onPrev?.()) player.prev();
  },
  next() {
    click('press');
    if (!nav.top.onNext?.()) player.next();
  },
  playPause() {
    click('press');
    if (nav.top.onPlayPause?.()) return;
    if (!player.togglePlay()) toast('Nothing to play yet — try Music › Search', 'info', 2200);
  },
  select() {
    click('press');
    nav.top.onSelect?.();
  },
  hold() {
    click('press');
    nav.top.onHold?.();
  },
  any(name) {
    backlight.poke();
    if (splashOn) {
      if (name === 'down' || name === 'key') dismissSplash();
      return false;
    }
    return true;
  },
};

const wheel = createWheel(wheelEl, $('center'), actions, $('device'));

// ---------------------------------------------------------------------------
// Keyboard: ↑/↓ scroll, Enter select (hold = long press), Esc/Backspace menu,
// Space play/pause, ←/→ previous/next.

let enterTimer = null;
let enterHeld = false;

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const inInput = e.target instanceof HTMLElement && e.target.matches('input, textarea');

  if (splashOn) {
    if (['Tab', 'Shift'].includes(e.key)) return;
    e.preventDefault();
    actions.any('key');
    return;
  }

  if (inInput) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.target.blur();
      wheel.trigger('menu');
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      wheel.trigger('tick', e.key === 'ArrowUp' ? -1 : 1);
    }
    return; // let normal typing happen
  }

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      wheel.trigger('tick', -1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      wheel.trigger('tick', 1);
      break;
    case 'Enter':
      e.preventDefault();
      if (e.repeat) return;
      enterHeld = false;
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => {
        enterHeld = true;
        wheel.trigger('hold');
      }, 550);
      break;
    case 'Escape':
    case 'Backspace':
      e.preventDefault();
      wheel.trigger('menu');
      break;
    case ' ':
    case 'MediaPlayPause':
      e.preventDefault();
      wheel.trigger('playPause');
      break;
    case 'ArrowLeft':
      e.preventDefault();
      wheel.trigger('prev');
      break;
    case 'ArrowRight':
      e.preventDefault();
      wheel.trigger('next');
      break;
    default:
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key !== 'Enter' || !enterTimer) return;
  clearTimeout(enterTimer);
  enterTimer = null;
  if (!enterHeld && !splashOn) wheel.trigger('select');
});

// ---------------------------------------------------------------------------
// Title bar: play state + battery + offline

const tbPlay = $('tb-play');
function paintPlayIcon() {
  if (!player.current) tbPlay.innerHTML = '';
  else tbPlay.innerHTML = player.isPlaying ? ICON.play : ICON.pause;
}
player.addEventListener('state', paintPlayIcon);
player.addEventListener('track', paintPlayIcon);

const battLevel = $('tb-batt-level');
function paintBattery(b) {
  battLevel.style.width = `${Math.round((b?.level ?? 1) * 100)}%`;
  $('tb-batt').classList.toggle('low', (b?.level ?? 1) < 0.2 && !b?.charging);
  $('tb-batt').classList.toggle('charging', !!b?.charging);
}
paintBattery(null);
if (navigator.getBattery) {
  navigator
    .getBattery()
    .then((b) => {
      paintBattery(b);
      b.addEventListener('levelchange', () => paintBattery(b));
      b.addEventListener('chargingchange', () => paintBattery(b));
    })
    .catch(() => {});
}

function paintOnline() {
  document.body.classList.toggle('offline', !navigator.onLine);
}
paintOnline();
window.addEventListener('offline', () => {
  paintOnline();
  toast("You're offline — music needs the internet", 'error', 4000);
});
window.addEventListener('online', () => {
  paintOnline();
  toast('Back online ✦', 'ok');
});

// ---------------------------------------------------------------------------
// Player notices

player.addEventListener('skip', (e) => toast(e.detail.message, 'error', 4000));
player.addEventListener('queueend', () => toast('End of the list ✦', 'info', 2000));
player.addEventListener('apierror', () =>
  toast(navigator.onLine ? "Couldn't load the YouTube player. Check your connection or ad blocker." : "You're offline — music needs the internet", 'error', 5000)
);
player.addEventListener('apiready', () => toast('YouTube player connected ✦', 'ok'));
player.addEventListener('needstap', () => {
  ctx.openNowPlaying();
  npView.setMode('video');
  toast('Tap the video once to start playback ▶', 'info', 5000);
});

player.init('yt-player');

// ---------------------------------------------------------------------------
// Decoration

sparkles($('sparkles'));
starTrail();

// A tiny "visits" counter, MySpace style (counts your own visits on this browser).
try {
  const visits = Number(localStorage.getItem('swr.visits') || 0) + 1;
  localStorage.setItem('swr.visits', String(visits));
  $('visitors').textContent = String(visits).padStart(6, '0');
} catch {
  /* ignore */
}
