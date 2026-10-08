// nowplaying.js — the Now Playing screen.
// Cover view: the cover art fills the screen and the YouTube video sits in the corner
// (never smaller than 200×200, as YouTube requires). Video view: the video fills the screen.
// Wheel = volume. Hold center = scrub through the song. Tap center = switch views.

import { h, cover, fmtTime, ICON } from './ui.js';
import { player } from './player.js';

const OVERLAY_MS = 1600;
const SCRUB_IDLE_MS = 2600;

export class NowPlayingView {
  constructor(screenEl) {
    this.screen = screenEl;
    this.mode = 'cover'; // 'cover' | 'video'
    this.scrubbing = false;
    this.overlay = null; // 'volume' | null
    this.visible = false;
    this.title = () => (this.mode === 'video' && player.current ? player.current.song : 'Now Playing');

    player.addEventListener('track', () => this.paintTrack());
    player.addEventListener('time', (e) => this.paintTime(e.detail));
    player.addEventListener('state', () => this.paintTrack());
    player.addEventListener('mode', () => this.paintModes());
    player.addEventListener('volume', () => this.paintVolume());
  }

  render() {
    this.art = h('div.np-art');
    this.song = h('div.np-song');
    this.artist = h('div.np-artist');
    this.count = h('div.np-count');
    this.modes = h('div.np-modes');
    this.elapsed = h('span.np-elapsed', {}, '0:00');
    this.remaining = h('span.np-remaining', {}, '-0:00');
    this.fill = h('div.np-fill');
    this.knob = h('div.np-knob');
    this.bar = h('div.np-bar', {}, this.fill, this.knob);
    this.volFill = h('div.np-fill');
    this.volBar = h('div.np-vol', {}, h('span.np-vol-icon', { html: ICON.speakerLow }), h('div.np-bar', {}, this.volFill), h('span.np-vol-icon', { html: ICON.speakerHigh }));
    this.prog = h('div.np-prog', {}, this.bar, h('div.np-times', {}, this.elapsed, this.remaining), this.volBar);
    this.hint = h('div.np-hint', {}, 'center: video');
    this.empty = h('div.np-empty', {}, h('div.np-empty-note', {}, '♪'), h('div', {}, 'Nothing playing'), h('div.np-empty-sub', {}, 'Music › Search or Add from Link'));
    const el = h(
      'div.np',
      {},
      this.art,
      h('div.np-top', {}, this.song, this.artist),
      h('div.np-side', {}, this.count, this.modes, this.prog, this.hint),
      this.empty
    );
    this.root = el;
    this.paintTrack();
    this.paintModes();
    this.paintVolume();
    return el;
  }

  applyScreenMode() {
    if (!this.visible) return;
    this.screen.dataset.np = player.current ? this.mode : 'empty';
  }

  onEnter() {
    this.visible = true;
    this.applyScreenMode();
    this.paintTrack();
  }

  onLeave() {
    this.visible = false;
    this.endScrub();
    delete this.screen.dataset.np;
  }

  setMode(mode) {
    this.mode = mode;
    this.applyScreenMode();
    this.navUpdateTitle?.();
  }

  paintTrack() {
    if (!this.root) return;
    const s = player.current;
    this.root.classList.toggle('is-empty', !s);
    this.applyScreenMode();
    if (!s) return;
    if (this.artId !== s.id) {
      this.artId = s.id;
      this.art.replaceChildren(cover(s.id, 'np-cover'));
    }
    this.song.textContent = s.song;
    this.artist.textContent = s.artist;
    this.count.textContent = `${player.position} of ${player.length}`;
    this.root.classList.toggle('paused', !player.isPlaying);
    this.navUpdateTitle?.();
  }

  paintTime({ current, duration } = { current: player.currentTime, duration: player.duration }) {
    if (!this.root) return;
    const pct = duration ? Math.min(100, (current / duration) * 100) : 0;
    this.fill.style.width = `${pct}%`;
    this.knob.style.left = `${pct}%`;
    this.elapsed.textContent = fmtTime(current);
    this.remaining.textContent = `-${fmtTime(Math.max(0, duration - current))}`;
  }

  paintModes() {
    if (!this.modes) return;
    const parts = [];
    if (player.shuffle) parts.push(h('span.np-mode', { html: ICON.shuffle, title: 'Shuffle on' }));
    if (player.repeat !== 'off') {
      parts.push(
        h('span.np-mode', { html: ICON.repeat, title: `Repeat ${player.repeat}` }, player.repeat === 'one' ? h('b', {}, '1') : null)
      );
    }
    this.modes.replaceChildren(...parts);
  }

  paintVolume() {
    if (this.volFill) this.volFill.style.width = `${player.volume}%`;
  }

  showOverlay(kind) {
    this.prog.classList.toggle('show-volume', kind === 'volume');
    clearTimeout(this.overlayTimer);
    if (kind) this.overlayTimer = setTimeout(() => this.showOverlay(null), OVERLAY_MS);
  }

  // ---------- wheel ----------

  onTick(dir) {
    if (!player.current) return false;
    if (this.scrubbing) {
      const d = player.duration;
      if (!d) return false;
      const step = Math.max(2, d / 60);
      player.seek(player.currentTime + dir * step);
      this.paintTime();
      this.armScrubIdle();
      return true;
    }
    const before = player.volume;
    player.setVolume(before + dir * 4);
    this.showOverlay('volume');
    return player.volume !== before;
  }

  onSelect() {
    if (!player.current) return;
    if (this.scrubbing) {
      this.endScrub();
      return;
    }
    this.setMode(this.mode === 'cover' ? 'video' : 'cover');
  }

  onHold() {
    if (!player.current) return;
    if (this.scrubbing) this.endScrub();
    else {
      this.scrubbing = true;
      this.showOverlay(null);
      this.prog.classList.add('scrubbing');
      this.armScrubIdle();
    }
  }

  armScrubIdle() {
    clearTimeout(this.scrubTimer);
    this.scrubTimer = setTimeout(() => this.endScrub(), SCRUB_IDLE_MS);
  }

  endScrub() {
    this.scrubbing = false;
    clearTimeout(this.scrubTimer);
    this.prog?.classList.remove('scrubbing');
  }
}
