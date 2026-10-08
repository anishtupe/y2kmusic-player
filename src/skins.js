// skins.js — the list of skins. The actual looks live in skins.css (body[data-skin="…"]).

export const SKINS = [
  { id: 'chrome', name: 'Chrome Silver', theme: '#c9d3e0' },
  { id: 'bubblegum', name: 'Bubblegum Pink', theme: '#ff8fcf' },
  { id: 'lime', name: 'Frosted Lime', theme: '#c8f560' },
  { id: 'midnight', name: 'Midnight Glitter', theme: '#1a1440' },
  { id: 'ice', name: 'Translucent Ice', theme: '#9fe3ff' },
];

export function applySkin(id) {
  const skin = SKINS.find((s) => s.id === id) || SKINS[0];
  document.body.dataset.skin = skin.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', skin.theme);
}
