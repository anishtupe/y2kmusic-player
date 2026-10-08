// ui.js — small DOM helpers shared by every screen: element builder, toasts,
// square-cropped cover art, time formatting and inline SVG icons.

import { thumbHQ, thumbMQ } from './youtube.js';

/** h('div.row.selected', { onclick }, 'text', child) */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className += ` ${v}`;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/**
 * Square cover art from a YouTube thumbnail.
 * hqdefault is 4:3 with black letterbox bars, so it's zoomed until the bars are gone.
 * If hqdefault is missing it falls back to mqdefault (16:9, no bars).
 */
export function cover(videoId, extraClass = '') {
  const wrap = h(`div.cover${extraClass ? `.${extraClass}` : ''}`);
  if (!videoId) {
    wrap.classList.add('cover-empty');
    wrap.append(h('span.cover-note', {}, '♪'));
    return wrap;
  }
  const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', draggable: 'false', referrerpolicy: 'no-referrer' });
  img.className = 'cover-hq';
  img.onerror = () => {
    if (img.dataset.fallback) {
      img.remove();
      wrap.classList.add('cover-empty');
      wrap.append(h('span.cover-note', {}, '♪'));
      return;
    }
    img.dataset.fallback = '1';
    img.className = 'cover-mq';
    img.src = thumbMQ(videoId);
  };
  // YouTube serves a 120x90 grey placeholder instead of a 404 for some missing thumbnails.
  img.onload = () => {
    if (img.naturalWidth === 120 && !img.dataset.fallback) img.onerror();
    else img.classList.add('loaded');
  };
  img.src = thumbHQ(videoId);
  wrap.append(img);
  return wrap;
}

export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h_ = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h_ ? `${h_}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// ---------- Toasts ----------

let toastHost = null;
export function toast(message, type = 'info', ms = 3200) {
  if (!toastHost) toastHost = document.getElementById('toasts');
  if (!toastHost) return;
  // Don't stack the exact same message twice.
  for (const t of toastHost.children) if (t.textContent === message) return;
  const icon = { info: '✦', error: '⚠', ok: '✔' }[type] || '✦';
  const node = h(`div.toast.toast-${type}`, { role: 'status' }, h('span.toast-icon', { 'aria-hidden': 'true' }, icon), message);
  toastHost.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, ms);
}

// ---------- Icons (inline SVG so they never turn into emoji on phones) ----------

const svg = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  play: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
  pause: svg('<rect x="6" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/>'),
  playPause: svg(
    '<path d="M2.5 6v12l8.5-6z" fill="currentColor"/><rect x="13.5" y="6" width="3" height="12" rx=".6" fill="currentColor"/><rect x="18.5" y="6" width="3" height="12" rx=".6" fill="currentColor"/>'
  ),
  prev: svg('<rect x="3" y="6" width="2.6" height="12" rx=".6" fill="currentColor"/><path d="M13 6v12l-7.5-6zM21 6v12l-7.5-6z" fill="currentColor"/>'),
  next: svg('<rect x="18.4" y="6" width="2.6" height="12" rx=".6" fill="currentColor"/><path d="M11 6v12l7.5-6zM3 6v12l7.5-6z" fill="currentColor"/>'),
  shuffle: svg(
    '<path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 4.8c1.1 1.6 2.3 2.6 4.3 2.6H20" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 17h3.5c1.4 0 2.4-.5 3.3-1.4M14.2 8.4c.9-.9 1.9-1.4 3.3-1.4H20" fill="none" stroke="currentColor" stroke-width="2"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2"/>'
  ),
  repeat: svg(
    '<path d="M4 11V9a2 2 0 0 1 2-2h12M20 13v2a2 2 0 0 1-2 2H6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 4l3 3-3 3M9 14l-3 3 3 3" fill="none" stroke="currentColor" stroke-width="2"/>'
  ),
  speakerLow: svg('<path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor"/>'),
  speakerHigh: svg(
    '<path d="M3 9h3l5-4v14l-5-4H3z" fill="currentColor"/><path d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  ),
};
