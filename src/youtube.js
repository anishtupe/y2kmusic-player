// youtube.js — YouTube Data API v3 (search, video + playlist details), link parsing,
// title cleanup and thumbnails. Works without an API key: link-adding falls back to oEmbed.

const API = 'https://www.googleapis.com/youtube/v3';

// Vite replaces import.meta.env at build time. The optional chaining keeps it safe
// if the files are ever served without Vite.
const API_KEY = (import.meta.env && import.meta.env.VITE_YT_API_KEY) || '';

export const hasApiKey = () => !!API_KEY;

/** Error with a machine-readable code: NO_KEY | QUOTA | BAD_KEY | BLOCKED | OFFLINE | NETWORK | NOT_FOUND */
export class YTError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const ERROR_TEXT = {
  NO_KEY: 'Search needs a YouTube API key. Paste links instead!',
  QUOTA: 'Daily search limit reached. Try again tomorrow, or paste links.',
  BAD_KEY: 'The YouTube API key is not valid.',
  BLOCKED: 'This API key is not allowed on this website.',
  OFFLINE: "You're offline.",
  NETWORK: "Couldn't reach YouTube.",
  NOT_FOUND: "Couldn't find that on YouTube.",
};

// ---------- Thumbnails ----------

export const thumbHQ = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const thumbMQ = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

// ---------- Link parsing ----------

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Returns { videoId, playlistId } (either may be null) from any YouTube URL or bare id. */
export function parseLink(input) {
  const text = (input || '').trim();
  if (!text) return { videoId: null, playlistId: null };
  if (ID_RE.test(text)) return { videoId: text, playlistId: null };

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { videoId: null, playlistId: null };
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');
  let videoId = null;
  const playlistId = url.searchParams.get('list');

  if (host === 'youtu.be') {
    videoId = url.pathname.slice(1, 12);
  } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    if (url.searchParams.get('v')) videoId = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) videoId = m[1];
    }
  }
  if (videoId && !ID_RE.test(videoId)) videoId = null;
  // "Radio"/"Mix" lists (RD...) are generated per-user and can't be imported.
  const pl = playlistId && !/^RD/.test(playlistId) ? playlistId : null;
  return { videoId, playlistId: pl };
}

// ---------- Title cleanup ----------

const NOISE =
  /\s*[([【][^)\]】]*?(official|lyric|lyrics|audio|video|visuali[sz]er|music\s*video|\bhd\b|\bhq\b|\b4k\b|\bmv\b|m\/v|explicit|clean|color\s*coded|performance|live\s*session|full\s*album)[^)\]】]*[)\]】]/gi;

function decodeEntities(str) {
  if (!str || !/[&]/.test(str)) return str || '';
  const ta = document.createElement('textarea');
  ta.innerHTML = str;
  return ta.value;
}

function cleanChannel(channel) {
  let c = (channel || '').replace(/\s*-\s*Topic$/i, '').trim();
  if (/VEVO$/i.test(c)) {
    c = c.replace(/VEVO$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  }
  return c;
}

/**
 * "Artist - Song (Official Video)" -> { artist: "Artist", song: "Song" }.
 * Falls back to the channel name for the artist.
 */
export function parseTitle(rawTitle, channel = '') {
  let t = decodeEntities(rawTitle).replace(NOISE, '');
  t = t.replace(/\s*\|\s*(official|lyrics?|audio|video|4k|hd).*$/i, '');
  t = t.replace(/\s+official\s+(music\s+)?(video|audio|mv|m\/v|lyric\s+video|visuali[sz]er)\s*$/i, '');
  t = t.replace(/\s*#\w+/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();

  let artist = '';
  let song = t;

  const dash = t.match(/^(.+?)\s+[-–—~]\s+(.+)$/);
  const quoted = t.match(/^(.+?)\s+["“'‘](.+?)["”'’]\s*(.*)$/);
  if (dash) {
    artist = dash[1].trim();
    song = dash[2].trim();
  } else if (quoted) {
    artist = quoted[1].trim();
    song = (quoted[2] + (quoted[3] ? ` ${quoted[3]}` : '')).trim();
  } else {
    artist = cleanChannel(decodeEntities(channel));
  }
  song = song.replace(/^["“']|["”']$/g, '').trim();
  return { artist: artist || 'Unknown Artist', song: song || decodeEntities(rawTitle) || 'Untitled' };
}

/** Builds the song object we store and play. */
export function makeSong(id, rawTitle, channel) {
  const title = decodeEntities(rawTitle || '');
  const { artist, song } = parseTitle(title, channel);
  return { id, title, song, artist, channel: decodeEntities(channel || '') };
}

// ---------- API helpers ----------

async function apiGet(path, params) {
  if (!API_KEY) throw new YTError('NO_KEY', ERROR_TEXT.NO_KEY);
  if (!navigator.onLine) throw new YTError('OFFLINE', ERROR_TEXT.OFFLINE);
  const qs = new URLSearchParams({ ...params, key: API_KEY });
  let res;
  try {
    res = await fetch(`${API}/${path}?${qs}`);
  } catch {
    throw new YTError(navigator.onLine ? 'NETWORK' : 'OFFLINE', navigator.onLine ? ERROR_TEXT.NETWORK : ERROR_TEXT.OFFLINE);
  }
  if (res.ok) return res.json();

  let reason = '';
  try {
    const body = await res.json();
    reason = body?.error?.errors?.[0]?.reason || body?.error?.status || '';
  } catch {
    /* ignore */
  }
  if (/quota|dailyLimit|rateLimit/i.test(reason)) throw new YTError('QUOTA', ERROR_TEXT.QUOTA);
  if (/keyInvalid|API_KEY_INVALID|badRequest/i.test(reason) && res.status === 400) throw new YTError('BAD_KEY', ERROR_TEXT.BAD_KEY);
  if (res.status === 403) throw new YTError('BLOCKED', ERROR_TEXT.BLOCKED);
  if (res.status === 404) throw new YTError('NOT_FOUND', ERROR_TEXT.NOT_FOUND);
  throw new YTError('NETWORK', ERROR_TEXT.NETWORK);
}

// ---------- Search ----------

const SEARCH_CACHE = 'swr.searchcache';

function cacheGet(q) {
  try {
    return JSON.parse(sessionStorage.getItem(SEARCH_CACHE) || '{}')[q.toLowerCase()] || null;
  } catch {
    return null;
  }
}
function cacheSet(q, results) {
  try {
    const all = JSON.parse(sessionStorage.getItem(SEARCH_CACHE) || '{}');
    all[q.toLowerCase()] = results;
    sessionStorage.setItem(SEARCH_CACHE, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Search embeddable videos. Each search costs 100 quota units, so results are cached per session. */
export async function search(query) {
  const q = query.trim();
  if (!q) return [];
  const cached = cacheGet(q);
  if (cached) return cached;
  const data = await apiGet('search', {
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '20',
    q,
  });
  const results = (data.items || [])
    .filter((it) => it.id?.videoId)
    .map((it) => makeSong(it.id.videoId, it.snippet.title, it.snippet.channelTitle));
  cacheSet(q, results);
  return results;
}

// ---------- Single video details ----------

async function oEmbed(id) {
  const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);
  const urls = [
    `https://www.youtube.com/oembed?url=${watch}&format=json`,
    `https://noembed.com/embed?url=${watch}`,
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (!res.ok) continue;
      const j = await res.json();
      if (j.title) return { title: j.title, channel: j.author_name || '' };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Get title/channel for one video. Uses the API if there is a key, otherwise oEmbed. */
export async function getVideo(id) {
  if (!navigator.onLine) throw new YTError('OFFLINE', ERROR_TEXT.OFFLINE);
  if (API_KEY) {
    try {
      const data = await apiGet('videos', { part: 'snippet,status', id });
      const it = data.items?.[0];
      if (!it) throw new YTError('NOT_FOUND', ERROR_TEXT.NOT_FOUND);
      const song = makeSong(id, it.snippet.title, it.snippet.channelTitle);
      song.embeddable = it.status?.embeddable !== false;
      return song;
    } catch (e) {
      if (e.code === 'NOT_FOUND') throw e;
      // Quota/key problems: fall through to oEmbed so link-adding still works.
    }
  }
  const meta = await oEmbed(id);
  if (meta) return makeSong(id, meta.title, meta.channel);
  // Last resort: save it with a placeholder; the real title is filled in when it plays.
  return { ...makeSong(id, 'YouTube video', ''), placeholder: true };
}

// ---------- Playlists ----------

/** Import a YouTube playlist (needs an API key). Returns { title, songs }. Max 200 songs. */
export async function getPlaylist(playlistId) {
  if (!API_KEY) throw new YTError('NO_KEY', 'Importing playlists needs a YouTube API key. Single video links work without one.');
  let title = 'YouTube Playlist';
  try {
    const meta = await apiGet('playlists', { part: 'snippet', id: playlistId });
    if (meta.items?.[0]) title = decodeEntities(meta.items[0].snippet.title);
    else throw new YTError('NOT_FOUND', "That playlist is private or doesn't exist.");
  } catch (e) {
    if (e.code !== 'NETWORK') throw e;
  }

  const songs = [];
  let pageToken = '';
  for (let page = 0; page < 4; page++) {
    const data = await apiGet('playlistItems', {
      part: 'snippet',
      maxResults: '50',
      playlistId,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of data.items || []) {
      const sn = it.snippet;
      const vid = sn?.resourceId?.videoId;
      if (!vid || /^(Private|Deleted) video$/i.test(sn.title)) continue;
      songs.push(makeSong(vid, sn.title, sn.videoOwnerChannelTitle || sn.channelTitle));
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { title, songs };
}
