// storage.js — everything saved in localStorage: songs, playlists, settings, recently played.
// All reads/writes are wrapped so the app keeps working in private mode or when storage is full.

const KEYS = {
  songs: 'swr.songs.v1',
  playlists: 'swr.playlists.v1',
  settings: 'swr.settings.v1',
  recent: 'swr.recent.v1',
};

export const DEFAULT_SETTINGS = {
  skin: 'chrome',
  clickSound: true,
  backlight: 30, // seconds; 0 = always on
  volume: 80,
  shuffle: false,
  repeat: 'off', // 'off' | 'all' | 'one'
};

const RECENT_MAX = 50;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const listeners = new Set();
/** Subscribe to library changes (songs / playlists). */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(what) {
  listeners.forEach((fn) => fn(what));
}

// ---------- Songs ----------
// A song: { id (YouTube video id), title (raw YouTube title), song, artist, channel, addedAt }

export function getSongMap() {
  return read(KEYS.songs, {});
}

export function getSong(id) {
  return getSongMap()[id] || null;
}

/** All saved songs, sorted A–Z by song name. */
export function getSongs() {
  return Object.values(getSongMap()).sort((a, b) =>
    (a.song || a.title).localeCompare(b.song || b.title, undefined, { sensitivity: 'base' })
  );
}

export function hasSong(id) {
  return !!getSongMap()[id];
}

/** Save one or many songs. Existing songs keep their addedAt. */
export function saveSongs(songs) {
  const map = getSongMap();
  const list = Array.isArray(songs) ? songs : [songs];
  for (const s of list) {
    if (!s || !s.id) continue;
    map[s.id] = { ...map[s.id], ...s, addedAt: map[s.id]?.addedAt || Date.now() };
  }
  write(KEYS.songs, map);
  emit('songs');
}

/** Update metadata of a song only if it is already saved. */
export function updateSong(id, patch) {
  const map = getSongMap();
  if (!map[id]) return;
  map[id] = { ...map[id], ...patch };
  write(KEYS.songs, map);
  emit('songs');
}

export function removeSong(id) {
  const map = getSongMap();
  delete map[id];
  write(KEYS.songs, map);
  // Also remove it from every playlist.
  const pls = getPlaylists().map((p) => ({ ...p, songIds: p.songIds.filter((x) => x !== id) }));
  write(KEYS.playlists, pls);
  emit('songs');
}

/** Songs grouped by artist: [{ artist, songs: [...] }] sorted A–Z. */
export function getArtists() {
  const groups = new Map();
  for (const s of getSongs()) {
    const name = s.artist || 'Unknown Artist';
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { artist: name, songs: [] });
    groups.get(key).songs.push(s);
  }
  return [...groups.values()].sort((a, b) =>
    a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' })
  );
}

// ---------- Playlists ----------
// A playlist: { id, name, songIds: [], createdAt }

export function getPlaylists() {
  return read(KEYS.playlists, []);
}

export function getPlaylist(id) {
  return getPlaylists().find((p) => p.id === id) || null;
}

export function getPlaylistSongs(id) {
  const pl = getPlaylist(id);
  if (!pl) return [];
  const map = getSongMap();
  return pl.songIds.map((sid) => map[sid]).filter(Boolean);
}

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function createPlaylist(name, songIds = []) {
  const pls = getPlaylists();
  const pl = { id: uid(), name: name.trim() || 'New Playlist', songIds: [...new Set(songIds)], createdAt: Date.now() };
  pls.push(pl);
  write(KEYS.playlists, pls);
  emit('playlists');
  return pl;
}

export function renamePlaylist(id, name) {
  const pls = getPlaylists().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
  write(KEYS.playlists, pls);
  emit('playlists');
}

export function deletePlaylist(id) {
  write(KEYS.playlists, getPlaylists().filter((p) => p.id !== id));
  emit('playlists');
}

/** Adds a song to a playlist (and to the library). Returns false if it was already there. */
export function addToPlaylist(id, song) {
  saveSongs(song);
  let added = false;
  const pls = getPlaylists().map((p) => {
    if (p.id !== id || p.songIds.includes(song.id)) return p;
    added = true;
    return { ...p, songIds: [...p.songIds, song.id] };
  });
  write(KEYS.playlists, pls);
  emit('playlists');
  return added;
}

export function removeFromPlaylist(id, songId) {
  const pls = getPlaylists().map((p) =>
    p.id === id ? { ...p, songIds: p.songIds.filter((x) => x !== songId) } : p
  );
  write(KEYS.playlists, pls);
  emit('playlists');
}

// ---------- Settings ----------

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  write(KEYS.settings, s);
  return s;
}

// ---------- Recently played ----------
// Stores full song objects so search results you never saved still show up.

export function getRecent() {
  return read(KEYS.recent, []);
}

export function addRecent(song) {
  if (!song?.id) return;
  const list = getRecent().filter((s) => s.id !== song.id);
  list.unshift({ id: song.id, title: song.title, song: song.song, artist: song.artist, channel: song.channel });
  write(KEYS.recent, list.slice(0, RECENT_MAX));
}

// ---------- Reset ----------

export function resetSettings() {
  write(KEYS.settings, {});
}

export function eraseLibrary() {
  try {
    localStorage.removeItem(KEYS.songs);
    localStorage.removeItem(KEYS.playlists);
    localStorage.removeItem(KEYS.recent);
  } catch {
    /* ignore */
  }
  emit('songs');
  emit('playlists');
}
