// fx.js — Y2K decoration: twinkling glitter around the device and a star cursor trail on desktop.

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function sparkles(container, count = 26) {
  if (!container) return;
  const glyphs = ['✦', '✧', '★', '⋆', '✩'];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = glyphs[i % glyphs.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.top = `${Math.random() * 100}%`;
    s.style.fontSize = `${8 + Math.random() * 18}px`;
    s.style.animationDelay = `${-Math.random() * 4}s`;
    s.style.animationDuration = `${2.5 + Math.random() * 3}s`;
    container.append(s);
  }
}

export function starTrail() {
  if (!matchMedia('(pointer: fine)').matches || reduceMotion()) return;
  const colors = ['#ff6ad5', '#c774e8', '#ad8cff', '#8795e8', '#94d0ff', '#fff27a'];
  let last = 0;
  let n = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      if (now - last < 28) return;
      last = now;
      const star = document.createElement('span');
      star.className = 'trail-star';
      star.textContent = n % 3 ? '✦' : '★';
      star.style.left = `${e.clientX}px`;
      star.style.top = `${e.clientY}px`;
      star.style.color = colors[n++ % colors.length];
      star.style.setProperty('--dx', `${(Math.random() - 0.5) * 30}px`);
      document.body.append(star);
      setTimeout(() => star.remove(), 800);
    },
    { passive: true }
  );
}
