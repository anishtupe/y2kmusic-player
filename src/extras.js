// extras.js — Clock, Stopwatch and Brick Breaker (played with the wheel).

import { h, toast } from './ui.js';

const pad = (n, l = 2) => String(n).padStart(l, '0');

// ---------------------------------------------------------------------
export class ClockView {
  constructor() {
    this.title = 'Clock';
  }
  render() {
    this.time = h('div.clock-time');
    this.secs = h('div.clock-secs');
    this.date = h('div.clock-date');
    this.zone = h('div.clock-zone', {}, Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' '));
    this.ring = h('div.clock-ring');
    this.tick();
    return h('div.clock', {}, this.ring, this.time, this.secs, this.date, this.zone);
  }
  tick() {
    const d = new Date();
    const h12 = d.getHours() % 12 || 12;
    this.time.innerHTML = `${h12}<span class="blink">:</span>${pad(d.getMinutes())}<small>${d.getHours() < 12 ? 'AM' : 'PM'}</small>`;
    this.secs.textContent = `:${pad(d.getSeconds())}`;
    this.ring.style.setProperty('--sec', d.getSeconds());
    this.date.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  onEnter() {
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }
  onLeave() {
    clearInterval(this.timer);
  }
  onTick() {
    return false;
  }
  onSelect() {}
}

// ---------------------------------------------------------------------
export class StopwatchView {
  constructor() {
    this.title = 'Stopwatch';
    this.elapsed = 0;
    this.startedAt = 0;
    this.running = false;
    this.laps = [];
  }
  get now() {
    return this.elapsed + (this.running ? performance.now() - this.startedAt : 0);
  }
  fmt(ms) {
    const cs = Math.floor(ms / 10) % 100;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000);
    return `${pad(m)}:${pad(s)}.${pad(cs)}`;
  }
  render() {
    this.display = h('div.sw-time', {}, this.fmt(0));
    this.lapList = h('div.sw-laps');
    this.help = h('div.sw-help');
    this.paintHelp();
    return h('div.stopwatch', {}, this.display, this.help, this.lapList);
  }
  paintHelp() {
    this.help.textContent = this.running ? 'center: stop · spin: lap' : this.elapsed ? 'center: go · hold: reset' : 'center: start';
  }
  loop() {
    this.display.textContent = this.fmt(this.now);
    if (this.running) this.raf = requestAnimationFrame(() => this.loop());
  }
  onSelect() {
    if (this.running) {
      this.elapsed = this.now;
      this.running = false;
    } else {
      this.startedAt = performance.now();
      this.running = true;
      this.loop();
    }
    this.paintHelp();
  }
  onHold() {
    if (this.running) return;
    this.elapsed = 0;
    this.laps = [];
    this.lapList.replaceChildren();
    this.display.textContent = this.fmt(0);
    this.paintHelp();
  }
  onTick(dir) {
    // Spinning forward while running records a lap.
    if (!this.running || dir < 0) return false;
    const t = this.now;
    if (this.laps.length && t - this.laps[0] < 400) return false;
    this.laps.unshift(t);
    this.lapList.prepend(h('div.sw-lap', {}, h('span', {}, `Lap ${this.laps.length}`), h('span', {}, this.fmt(t))));
    return true;
  }
  onEnter() {
    if (this.running) this.loop();
  }
  onLeave() {
    cancelAnimationFrame(this.raf);
  }
}

// ---------------------------------------------------------------------
// Brick Breaker: spin to move the paddle, center to launch / pause.

const COLORS = ['#ff4fd8', '#ff9a3c', '#ffe14d', '#59f0a0', '#4fc3ff', '#b07bff'];

export class BrickView {
  constructor() {
    this.title = 'Brick Breaker';
    this.best = Number(localStorage.getItem('swr.brick.best') || 0);
  }

  render() {
    this.canvas = h('canvas.brick-canvas', { 'aria-label': 'Brick Breaker game' });
    this.ctx = this.canvas.getContext('2d');
    return h('div.brick', {}, this.canvas);
  }

  onEnter() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Use layout size (not scaled size) so the game is crisp whatever the device scale.
    this.W = this.canvas.parentElement.clientWidth || 300;
    this.H = this.canvas.parentElement.clientHeight || 240;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg = getComputedStyle(this.canvas).getPropertyValue('--game-bg').trim() || '#10102a';
    if (!this.state) this.newGame();
    this.paused = true;
    this.last = performance.now();
    this.loop();
  }

  onLeave() {
    cancelAnimationFrame(this.raf);
    this.paused = true;
  }

  newGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.state = 'ready';
    this.buildLevel();
  }

  buildLevel() {
    const cols = 7;
    const rows = Math.min(3 + this.level, 7);
    const gap = 3;
    const top = 26;
    const bw = (this.W - 12 - gap * (cols - 1)) / cols;
    this.bricks = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        this.bricks.push({ x: 6 + c * (bw + gap), y: top + r * 13, w: bw, h: 10, color: COLORS[r % COLORS.length], alive: true });
    this.paddle = { w: 56, h: 7, x: this.W / 2 - 28, y: this.H - 16 };
    this.resetBall();
  }

  resetBall() {
    this.ball = { x: this.W / 2, y: this.paddle.y - 6, r: 4, vx: 0, vy: 0, stuck: true };
    this.state = 'ready';
  }

  launch() {
    const speed = 150 + this.level * 18;
    const a = (-Math.PI / 2) + (Math.random() - 0.5) * 0.8;
    this.ball.vx = Math.cos(a) * speed;
    this.ball.vy = Math.sin(a) * speed;
    this.ball.stuck = false;
    this.state = 'play';
  }

  onTick(dir) {
    const p = this.paddle;
    p.x = Math.max(0, Math.min(this.W - p.w, p.x + dir * 18));
    if (this.ball.stuck) this.ball.x = p.x + p.w / 2;
    if (this.paused && this.state !== 'over') this.draw();
    return true;
  }
  onPrev() {
    this.onTick(-1);
    return true;
  }
  onNext() {
    this.onTick(1);
    return true;
  }

  onSelect() {
    if (this.state === 'over') {
      this.newGame();
      this.paused = false;
      return;
    }
    if (this.state === 'ready') {
      this.paused = false;
      this.launch();
      return;
    }
    this.paused = !this.paused;
  }

  step(dt) {
    const b = this.ball;
    if (b.stuck) return;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < b.r) (b.x = b.r), (b.vx = Math.abs(b.vx));
    if (b.x > this.W - b.r) (b.x = this.W - b.r), (b.vx = -Math.abs(b.vx));
    if (b.y < b.r + 16) (b.y = b.r + 16), (b.vy = Math.abs(b.vy));

    const p = this.paddle;
    if (b.vy > 0 && b.y + b.r >= p.y && b.y + b.r <= p.y + p.h + 6 && b.x >= p.x - b.r && b.x <= p.x + p.w + b.r) {
      // Bounce angle depends on where the ball hits the paddle.
      const hit = (b.x - (p.x + p.w / 2)) / (p.w / 2);
      const speed = Math.hypot(b.vx, b.vy) * 1.015;
      const a = -Math.PI / 2 + hit * 1.05;
      b.vx = Math.cos(a) * speed;
      b.vy = Math.sin(a) * speed;
      b.y = p.y - b.r;
    }

    for (const br of this.bricks) {
      if (!br.alive) continue;
      if (b.x + b.r > br.x && b.x - b.r < br.x + br.w && b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
        br.alive = false;
        this.score += 10;
        const overlapX = Math.min(b.x + b.r - br.x, br.x + br.w - (b.x - b.r));
        const overlapY = Math.min(b.y + b.r - br.y, br.y + br.h - (b.y - b.r));
        if (overlapX < overlapY) b.vx = -b.vx;
        else b.vy = -b.vy;
        break;
      }
    }

    if (!this.bricks.some((x) => x.alive)) {
      this.level++;
      toast(`Level ${this.level}!`, 'ok', 1500);
      this.buildLevel();
      this.paused = true;
    }

    if (b.y > this.H + 10) {
      this.lives--;
      if (this.lives <= 0) {
        this.state = 'over';
        this.paused = true;
        if (this.score > this.best) {
          this.best = this.score;
          try {
            localStorage.setItem('swr.brick.best', String(this.best));
          } catch {
            /* ignore */
          }
        }
      } else {
        this.resetBall();
        this.paused = true;
      }
    }
  }

  loop() {
    const now = performance.now();
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  draw() {
    const c = this.ctx;
    const { W, H } = this;
    c.fillStyle = this.bg;
    c.fillRect(0, 0, W, H);

    c.fillStyle = 'rgba(255,255,255,.9)';
    c.font = '700 10px Silkscreen, monospace';
    c.textBaseline = 'top';
    c.fillText(`SCORE ${this.score}`, 6, 4);
    c.textAlign = 'right';
    c.fillText(`${'♥'.repeat(Math.max(0, this.lives))}  LV${this.level}`, W - 6, 4);
    c.textAlign = 'left';

    for (const br of this.bricks) {
      if (!br.alive) continue;
      c.fillStyle = br.color;
      c.fillRect(br.x, br.y, br.w, br.h);
      c.fillStyle = 'rgba(255,255,255,.45)';
      c.fillRect(br.x, br.y, br.w, 2);
    }
    const p = this.paddle;
    const g = c.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#9fb7d8');
    c.fillStyle = g;
    c.fillRect(p.x, p.y, p.w, p.h);

    const b = this.ball;
    c.beginPath();
    c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    c.fillStyle = '#ffe14d';
    c.fill();

    let msg = '';
    if (this.state === 'over') msg = `GAME OVER · BEST ${this.best}`;
    else if (this.state === 'ready') msg = 'CENTER TO LAUNCH';
    else if (this.paused) msg = 'PAUSED';
    if (msg) {
      c.fillStyle = 'rgba(0,0,0,.55)';
      c.fillRect(0, H / 2 + 6, W, 22);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.fillText(msg, W / 2, H / 2 + 12);
      c.textAlign = 'left';
    }
  }
}
