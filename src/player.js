// player.js — wraps the YouTube IFrame Player API: queue, shuffle, repeat, volume,
// auto-advance, skipping unplayable videos, tab title and the Media Session API.

import * as store from './storage.js';
import { thumbHQ, thumbMQ, makeSong } from './youtube.js';

const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
const APP_NAME = 'Scroll Wheel Radio';

const ERROR_REASON = {
  2: 'has a bad video id',
  5: "can't play in this browser",
  100: 'was removed or is private',
  101: "can't be played outside YouTube",
  150: "can't be played outside YouTube",
  153: "can't be played outside YouTube",
};

function loadIframeAPI(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      s.remove();
      reject(new Error('blocked'));
    };
    document.head.appendChild(s);
  });
}

class Player extends EventTarget {
  constructor() {
    super();
    this.yt = null;
    this.ready = false;
    this.apiFailed = false;
    this.queue = []; // songs in original order
    this.order = []; // indices into queue (shuffled when shuffle is on)
    this.pos = -1; // position inside order
    this.state = S.UNSTARTED;
    this.pending = null;
    this.errorStreak = 0;
    const st = store.getSettings();
    this.volume = st.volume;
    this.shuffle = st.shuffle;
    this.repeat = st.repeat;
    this.timer = null;
    this.startWatch = null;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Load the IFrame API and create the player inside element #hostId. */
  async init(hostId) {
    this.hostId = hostId;
    try {
      await this.connect();
    } catch {
      this.apiFailed = true;
      this.emit('apierror');
      // Try again automatically when the connection comes back.
      window.addEventListener('online', () => this.retryInit(), { once: true });
    }
    this.setupMediaSession();
  }

  async retryInit() {
    if (this.ready) return;
    try {
      await this.connect();
      this.apiFailed = false;
      this.emit('apiready');
    } catch {
      window.addEventListener('online', () => this.retryInit(), { once: true });
    }
  }

  async connect() {
    const YT = await loadIframeAPI();
    await new Promise((resolve) => {
      this.yt = new YT.Player(this.hostId, {
        width: '100%',
        height: '100%',
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          fs: 0,
          origin: location.origin,
        },
        events: {
          onReady: () => {
            this.ready = true;
            this.yt.setVolume(this.volume);
            resolve();
            if (this.pending) {
              const p = this.pending;
              this.pending = null;
              this.loadCurrent(p.autoplay);
            }
          },
          onStateChange: (e) => this.onState(e.data),
          onError: (e) => this.onError(e.data),
        },
      });
    });
  }

  // ---------- Queue ----------

  get current() {
    if (this.pos < 0 || !this.order.length) return null;
    return this.queue[this.order[this.pos]] || null;
  }
  get position() {
    return this.pos + 1;
  }
  get length() {
    return this.queue.length;
  }
  get isPlaying() {
    return this.state === S.PLAYING || this.state === S.BUFFERING;
  }

  buildOrder(startIndex) {
    const idx = this.queue.map((_, i) => i);
    if (this.shuffle) {
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      // Put the chosen song first.
      if (startIndex != null && startIndex >= 0) {
        const at = idx.indexOf(startIndex);
        idx.splice(at, 1);
        idx.unshift(startIndex);
      }
      this.order = idx;
      this.pos = 0;
    } else {
      this.order = idx;
      this.pos = Math.max(0, startIndex || 0);
    }
  }

  /** Replace the queue and start playing at startIndex. */
  playQueue(songs, startIndex = 0, { shuffle } = {}) {
    if (!songs.length) return;
    if (typeof shuffle === 'boolean') this.setShuffle(shuffle, false);
    this.queue = songs.slice();
    this.buildOrder(this.shuffle && shuffle ? Math.floor(Math.random() * songs.length) : startIndex);
    this.errorStreak = 0;
    this.loadCurrent(true);
  }

  /** Play one song by itself (e.g. a search result). */
  playSong(song) {
    this.playQueue([song], 0);
  }

  /** Put a song right after the current one. Returns 'playing' or 'queued'. */
  insertNext(song) {
    if (!this.current) {
      this.playSong(song);
      return 'playing';
    }
    this.queue.push(song);
    this.order.splice(this.pos + 1, 0, this.queue.length - 1);
    this.emit('track', this.current); // refresh "3 of 12"
    return 'queued';
  }

  loadCurrent(autoplay = true) {
    const song = this.current;
    if (!song) return;
    this.emit('track', song);
    this.updateMeta();
    store.addRecent(song);
    if (!this.ready) {
      this.pending = { autoplay };
      if (this.apiFailed) this.emit('apierror');
      return;
    }
    if (autoplay) this.yt.loadVideoById(song.id);
    else this.yt.cueVideoById(song.id);
    this.watchStart(autoplay);
  }

  // Mobile browsers sometimes refuse to start playback that wasn't triggered by a tap
  // inside the video itself. If nothing starts, ask the user to tap the video.
  watchStart(autoplay) {
    clearTimeout(this.startWatch);
    if (!autoplay) return;
    this.startWatch = setTimeout(() => {
      if (!this.isPlaying && this.state !== S.PAUSED && this.state !== S.ENDED) this.emit('needstap');
    }, 3500);
  }

  next(auto = false) {
    if (!this.queue.length) return;
    if (auto && this.repeat === 'one') {
      this.seek(0);
      this.play();
      return;
    }
    if (this.pos < this.order.length - 1) {
      this.pos++;
    } else if (this.repeat === 'all' || !auto) {
      // Repeat-all, or a manual skip past the last song, wraps to the start.
      if (this.shuffle && this.order.length > 1) this.buildOrder(null);
      this.pos = 0;
    } else {
      // End of queue.
      this.emit('queueend');
      return;
    }
    this.loadCurrent(true);
  }

  prev() {
    if (!this.queue.length) return;
    if (this.currentTime > 3) {
      this.seek(0);
      return;
    }
    if (this.pos > 0) this.pos--;
    else if (this.repeat === 'all') this.pos = this.order.length - 1;
    else {
      this.seek(0);
      return;
    }
    this.loadCurrent(true);
  }

  // ---------- Transport ----------

  play() {
    if (!this.ready || !this.current) return;
    this.yt.playVideo();
  }
  pause() {
    if (!this.ready) return;
    this.yt.pauseVideo();
  }
  togglePlay() {
    if (!this.current) return false;
    if (this.isPlaying) this.pause();
    else this.play();
    return true;
  }

  get currentTime() {
    try {
      return this.ready ? this.yt.getCurrentTime() || 0 : 0;
    } catch {
      return 0;
    }
  }
  get duration() {
    try {
      return this.ready ? this.yt.getDuration() || 0 : 0;
    } catch {
      return 0;
    }
  }

  seek(seconds) {
    if (!this.ready) return;
    const d = this.duration;
    const t = Math.max(0, d ? Math.min(seconds, d - 0.5) : seconds);
    this.yt.seekTo(t, true);
    this.emit('time', { current: t, duration: d });
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(100, Math.round(v)));
    if (this.ready) {
      this.yt.setVolume(this.volume);
      if (this.volume > 0 && this.yt.isMuted()) this.yt.unMute();
    }
    store.setSetting('volume', this.volume);
    this.emit('volume', this.volume);
    return this.volume;
  }

  setShuffle(on, rebuild = true) {
    this.shuffle = !!on;
    store.setSetting('shuffle', this.shuffle);
    if (rebuild && this.queue.length) {
      const curIndex = this.order[this.pos];
      this.buildOrder(curIndex);
      if (!this.shuffle) this.pos = curIndex;
    }
    this.emit('mode');
  }

  cycleRepeat() {
    const next = { off: 'all', all: 'one', one: 'off' }[this.repeat] || 'off';
    this.repeat = next;
    store.setSetting('repeat', next);
    this.emit('mode');
    return next;
  }

  // ---------- YouTube events ----------

  onState(state) {
    this.state = state;
    if (state === S.PLAYING) {
      this.errorStreak = 0;
      clearTimeout(this.startWatch);
      this.fillMissingMeta();
      this.startTimer();
    } else {
      this.stopTimer();
    }
    if (state === S.ENDED) this.next(true);
    this.updateMeta();
    this.emit('state', { playing: this.isPlaying, state });
  }

  onError(code) {
    const song = this.current;
    const why = ERROR_REASON[code] || "can't be played";
    this.errorStreak++;
    this.emit('skip', { song, message: `"${song?.song || 'This video'}" ${why} — skipping` });
    if (this.errorStreak >= this.queue.length) {
      this.errorStreak = 0;
      this.emit('queueend');
      return;
    }
    setTimeout(() => {
      // Skip forward even at the end of the list, so one broken song never blocks the queue.
      if (this.pos < this.order.length - 1) this.pos++;
      else this.pos = 0;
      this.loadCurrent(true);
    }, 600);
  }

  /** Songs added without metadata get their real title once YouTube tells us. */
  fillMissingMeta() {
    const song = this.current;
    if (!song || !song.placeholder) return;
    try {
      const data = this.yt.getVideoData();
      if (data?.title) {
        const fixed = makeSong(song.id, data.title, data.author);
        Object.assign(song, fixed, { placeholder: false });
        store.updateSong(song.id, { ...fixed, placeholder: false });
        this.emit('track', song);
        this.updateMeta();
      }
    } catch {
      /* ignore */
    }
  }

  startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => {
      const current = this.currentTime;
      const duration = this.duration;
      this.emit('time', { current, duration });
      if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && duration) {
        try {
          navigator.mediaSession.setPositionState({ duration, position: Math.min(current, duration), playbackRate: 1 });
        } catch {
          /* ignore */
        }
      }
    }, 250);
  }
  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // ---------- Tab title + Media Session ----------

  updateMeta() {
    const song = this.current;
    if (!song) {
      document.title = APP_NAME;
      return;
    }
    document.title = `${this.isPlaying ? '▶' : '❚❚'} ${song.song} · ${song.artist} — ${APP_NAME}`;
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.song,
          artist: song.artist,
          album: APP_NAME,
          artwork: [
            { src: thumbMQ(song.id), sizes: '320x180', type: 'image/jpeg' },
            { src: thumbHQ(song.id), sizes: '480x360', type: 'image/jpeg' },
          ],
        });
        navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
      } catch {
        /* ignore */
      }
    }
  }

  setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const set = (action, fn) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {
        /* action not supported */
      }
    };
    set('play', () => this.play());
    set('pause', () => this.pause());
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    set('seekto', (d) => d.seekTime != null && this.seek(d.seekTime));
    set('seekbackward', (d) => this.seek(this.currentTime - (d.seekOffset || 10)));
    set('seekforward', (d) => this.seek(this.currentTime + (d.seekOffset || 10)));
  }
}

export const player = new Player();
