// menus.js — the screen's view stack (with slide-left / slide-right transitions),
// the reusable list, text-entry and Cover Flow screens, and the whole menu tree.

import { h, cover, toast } from './ui.js';
import * as store from './storage.js';
import * as yt from './youtube.js';
import { player } from './player.js';
import { SKINS, applySkin } from './skins.js';
import { setClickSound } from './sound.js';
import { ClockView, StopwatchView, BrickView } from './extras.js';

const SLIDE_MS = 240;

// =====================================================================
// Navigator: a stack of views. Each view may implement:
//   title, render() -> HTMLElement, onEnter(), onLeave(), onDestroy(),
//   onTick(dir) -> bool (moved?), onSelect(), onHold(), onMenu() -> bool,
//   onPrev() -> bool, onNext() -> bool, onPlayPause() -> bool, submit()
// Returning true from onMenu/onPrev/onNext/onPlayPause means "handled here".
// =====================================================================

export class Navigator {
  constructor(panesEl, titleEl) {
    this.panes = panesEl;
    this.titleEl = titleEl;
    this.stack = [];
    this.pane = null;
    this.anim = null;
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  updateTitle() {
    const t = this.top?.title;
    this.titleEl.textContent = typeof t === 'function' ? t() : t || '';
  }

  finishAnim() {
    if (!this.anim) return;
    clearTimeout(this.anim.timer);
    this.anim.done();
    this.anim = null;
  }

  show(view, dir) {
    this.finishAnim();
    if (!view.el) {
      view.el = view.render();
      view.el.classList.add('pane');
    }
    const el = view.el;
    const old = this.pane;
    this.pane = el;
    this.updateTitle();

    if (!old || old === el || dir === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (old && old !== el) old.remove();
      if (el.parentNode !== this.panes) this.panes.append(el);
      return;
    }
    const enter = dir === 'forward' ? 'enter-right' : 'enter-left';
    const leave = dir === 'forward' ? 'leave-left' : 'leave-right';
    el.classList.add(enter);
    this.panes.append(el);
    void el.offsetWidth; // start the transition from the off-screen position
    el.classList.remove(enter);
    old.classList.add(leave);
    const done = () => {
      old.classList.remove(leave);
      if (old !== this.pane) old.remove();
    };
    this.anim = { timer: setTimeout(() => { this.anim = null; done(); }, SLIDE_MS), done };
  }

  push(view) {
    // A view object can only be in the stack once (e.g. Now Playing).
    const at = this.stack.indexOf(view);
    if (at !== -1) {
      if (at === this.stack.length - 1) return;
      this.stack.splice(at, 1);
    }
    this.top?.onLeave?.();
    this.stack.push(view);
    this.show(view, 'forward');
    view.onEnter?.();
  }

  pop() {
    if (this.stack.length <= 1) return false;
    const v = this.stack.pop();
    v.onLeave?.();
    v.onDestroy?.();
    this.show(this.top, 'back');
    this.top.onEnter?.();
    return true;
  }

  /** Pop several levels at once (e.g. after finishing a multi-step flow). */
  popN(n) {
    if (n <= 0) return;
    const keep = Math.max(1, this.stack.length - n);
    while (this.stack.length > keep + 1) {
      const v = this.stack.splice(this.stack.length - 2, 1)[0];
      v.onDestroy?.();
    }
    this.pop();
  }

  replace(view) {
    const old = this.stack.pop();
    old?.onLeave?.();
    old?.onDestroy?.();
    this.stack.push(view);
    this.show(view, 'forward');
    view.onEnter?.();
  }

  setRoot(view) {
    this.stack = [view];
    this.show(view, 'none');
    view.onEnter?.();
  }

  toRoot() {
    while (this.stack.length > 2) this.stack.splice(1, 1)[0].onDestroy?.();
    this.pop();
  }
}

// =====================================================================
// ListView — the classic white list with a blue highlight.
// item: { label, sub?, right?, arrow?, thumb? (video id), action?, hold?, cls? }
// =====================================================================

export class ListView {
  constructor(opts) {
    this.opts = opts;
    this.title = opts.title;
    this.sel = opts.initial || 0;
    this.top = 0;
    this.items = [];
  }

  getItems() {
    const it = this.opts.items;
    return (typeof it === 'function' ? it() : it) || [];
  }

  render() {
    this.root = h(`div.list${this.opts.thumbs ? '.list-thumbs' : ''}`, { role: 'listbox' });
    this.build();
    return this.root;
  }

  build() {
    this.items = this.getItems();
    this.sel = Math.max(0, Math.min(this.sel, this.items.length - 1));
    if (!this.items.length) {
      this.rows = [];
      this.root.replaceChildren(h('div.empty', {}, this.opts.empty || 'Nothing here yet'));
      return;
    }
    this.rows = this.items.map((item, i) => {
      const row = h(
        `div.row${item.cls ? `.${item.cls}` : ''}`,
        {
          role: 'option',
          onclick: () => {
            this.sel = i;
            this.paint();
            this.onSelect();
          },
        },
        item.thumb !== undefined ? cover(item.thumb, 'row-cover') : null,
        h(
          'span.label',
          {},
          h('span.label-inner', {}, item.label),
          item.sub ? h('span.sub', {}, item.sub) : null
        ),
        item.right != null ? h('span.right', {}, item.right) : null,
        item.arrow ? h('span.arrow', { 'aria-hidden': 'true' }, '›') : null
      );
      return row;
    });
    this.root.replaceChildren(...this.rows);
    this.paint();
  }

  refresh() {
    if (this.root) this.build();
  }

  paint() {
    if (!this.rows?.length) return;
    this.rows.forEach((r, i) => {
      const on = i === this.sel;
      r.classList.toggle('selected', on);
      r.setAttribute('aria-selected', on);
      const inner = r.querySelector('.label-inner');
      inner.classList.remove('marquee');
      if (on) {
        const box = inner.parentElement;
        const over = inner.scrollWidth - box.clientWidth;
        if (over > 4) {
          inner.style.setProperty('--marquee-dist', `-${over + 12}px`);
          inner.style.setProperty('--marquee-time', `${Math.max(3, over / 22)}s`);
          inner.classList.add('marquee');
        }
      }
    });
    const rowH = this.rows[0].offsetHeight;
    if (!rowH) return;
    const visible = Math.max(1, Math.floor(this.root.clientHeight / rowH));
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel >= this.top + visible) this.top = this.sel - visible + 1;
    this.top = Math.max(0, Math.min(this.top, this.rows.length - visible));
    this.root.scrollTop = this.top * rowH;
  }

  onEnter() {
    if (this.opts.live) this.build();
    requestAnimationFrame(() => this.paint());
  }

  onTick(dir) {
    if (!this.items.length) return false;
    const next = Math.max(0, Math.min(this.items.length - 1, this.sel + dir));
    if (next === this.sel) return false;
    this.sel = next;
    this.paint();
    return true;
  }

  onSelect() {
    this.items[this.sel]?.action?.(this.items[this.sel], this.sel);
  }

  onHold() {
    const item = this.items[this.sel];
    if (item?.hold) item.hold(item, this.sel);
  }
}

// =====================================================================
// TextEntryView — type by spinning the wheel (classic style) or with a real keyboard.
// =====================================================================

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const URL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789.:/?=&-_';
const SPECIAL = { DONE: 'DONE', DEL: 'DEL', SPACE: 'SPACE', CASE: 'ABC', PASTE: 'PASTE' };

export class TextEntryView {
  constructor({ title, placeholder = '', initial = '', charset = 'text', paste = false, submitLabel = 'DONE', onSubmit }) {
    this.title = title;
    this.placeholder = placeholder;
    this.initial = initial;
    this.onSubmitCb = onSubmit;
    this.upper = false;
    this.submitLabel = submitLabel;
    const chars = (charset === 'url' ? URL_CHARS : LETTERS).split('');
    this.tokens = [
      ...(paste ? [SPECIAL.PASTE] : []),
      SPECIAL.DONE,
      SPECIAL.DEL,
      SPECIAL.SPACE,
      SPECIAL.CASE,
      ...chars,
    ];
    this.idx = this.tokens.indexOf('a');
    this.busy = false;
  }

  render() {
    this.input = h('input.entry-input', {
      type: 'text',
      placeholder: this.placeholder,
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
      'aria-label': this.title,
    });
    this.input.value = this.initial;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.submit();
      }
    });
    this.strip = h('div.strip', { 'aria-hidden': 'true' });
    this.status = h('div.entry-status', {}, 'spin to choose · center to type');
    const el = h('div.entry', {}, h('div.entry-field', {}, this.input), this.strip, this.status);
    this.paintStrip();
    return el;
  }

  label(tok) {
    if (tok === SPECIAL.DONE) return this.submitLabel;
    if (tok === SPECIAL.CASE) return this.upper ? 'abc' : 'ABC';
    if (tok.length === 1) return this.upper ? tok.toUpperCase() : tok;
    return tok;
  }

  paintStrip() {
    const cells = [];
    for (let o = -3; o <= 3; o++) {
      const i = (this.idx + o + this.tokens.length) % this.tokens.length;
      const tok = this.tokens[i];
      cells.push(
        h(
          `span.cell${o === 0 ? '.on' : ''}${tok.length > 1 ? '.word' : ''}`,
          {
            style: { opacity: String(1 - Math.abs(o) * 0.2) },
            onclick: () => {
              this.idx = i;
              this.paintStrip();
              this.onSelect();
            },
          },
          this.label(tok)
        )
      );
    }
    this.strip.replaceChildren(...cells);
  }

  onEnter() {
    // On desktop, focus the field so normal typing works right away.
    if (matchMedia('(pointer: fine)').matches) setTimeout(() => this.input?.focus({ preventScroll: true }), SLIDE_MS);
  }
  onLeave() {
    this.input?.blur();
  }

  onTick(dir) {
    if (this.busy) return false;
    this.idx = (this.idx + dir + this.tokens.length) % this.tokens.length;
    this.paintStrip();
    return true;
  }

  async onSelect() {
    if (this.busy) return;
    const tok = this.tokens[this.idx];
    const v = this.input.value;
    if (tok === SPECIAL.DONE) return this.submit();
    if (tok === SPECIAL.DEL) this.input.value = v.slice(0, -1);
    else if (tok === SPECIAL.SPACE) this.input.value = v + ' ';
    else if (tok === SPECIAL.CASE) {
      this.upper = !this.upper;
      this.paintStrip();
    } else if (tok === SPECIAL.PASTE) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) this.input.value = text.trim();
      } catch {
        toast('Tap the box and paste with your keyboard', 'info');
        this.input.focus();
      }
    } else this.input.value = v + (this.upper ? tok.toUpperCase() : tok);
    this.input.scrollLeft = this.input.scrollWidth;
  }

  setBusy(text) {
    this.busy = !!text;
    this.status.textContent = text || 'spin to choose · center to type';
    this.status.classList.toggle('busy', !!text);
  }

  submit() {
    if (this.busy) return;
    const value = this.input.value.trim();
    if (!value) {
      toast('Type something first', 'info', 1800);
      return;
    }
    this.input.blur();
    this.onSubmitCb?.(value, this);
  }
}

// =====================================================================
// Cover Flow — horizontal 3D carousel of covers.
// =====================================================================

class CoverFlowView {
  constructor(ctx) {
    this.ctx = ctx;
    this.title = 'Cover Flow';
    this.sel = 0;
    this.nodes = new Map();
  }

  render() {
    this.track = h('div.cf-track');
    this.caption = h('div.cf-caption');
    return h('div.coverflow', {}, this.track, this.caption);
  }

  onEnter() {
    this.songs = store.getSongs();
    this.sel = Math.min(this.sel, Math.max(0, this.songs.length - 1));
    this.nodes.forEach((n) => n.remove());
    this.nodes.clear();
    this.paint();
  }

  paint() {
    if (!this.songs.length) {
      this.caption.replaceChildren(h('div.cf-song', {}, 'No covers yet'), h('div.cf-artist', {}, 'Add songs with Search or Add from Link'));
      return;
    }
    const RANGE = 5;
    // Remove covers that left the visible window.
    for (const [i, n] of this.nodes) {
      if (Math.abs(i - this.sel) > RANGE) {
        n.remove();
        this.nodes.delete(i);
      }
    }
    for (let i = Math.max(0, this.sel - RANGE); i <= Math.min(this.songs.length - 1, this.sel + RANGE); i++) {
      let n = this.nodes.get(i);
      if (!n) {
        n = cover(this.songs[i].id, 'cf-item');
        n.addEventListener('click', () => {
          if (i === this.sel) this.onSelect();
          else {
            this.sel = i;
            this.paint();
          }
        });
        this.nodes.set(i, n);
        this.track.append(n);
      }
      const off = i - this.sel;
      const side = Math.sign(off);
      const x = off === 0 ? 0 : side * 62 + off * 26;
      n.style.transform = `translateX(calc(-50% + ${x}px)) translateZ(${off === 0 ? 30 : -40}px) rotateY(${-side * 62}deg)`;
      n.style.zIndex = String(100 - Math.abs(off));
      n.classList.toggle('on', off === 0);
    }
    const s = this.songs[this.sel];
    this.caption.replaceChildren(h('div.cf-song', {}, s.song), h('div.cf-artist', {}, s.artist));
  }

  onTick(dir) {
    if (!this.songs?.length) return false;
    const next = Math.max(0, Math.min(this.songs.length - 1, this.sel + dir));
    if (next === this.sel) return false;
    this.sel = next;
    this.paint();
    return true;
  }

  onSelect() {
    if (!this.songs?.length) return;
    this.ctx.playSongs(this.songs, this.sel);
  }
}

// =====================================================================
// The menu tree
// =====================================================================

export function buildMenus(ctx) {
  const { nav } = ctx;
  const list = (opts) => new ListView(opts);

  // ---------- song actions ----------

  function addToPlaylistView(song) {
    return list({
      title: 'Add to Playlist',
      live: true,
      items: () => [
        {
          label: '+ New Playlist…',
          action: () =>
            nav.push(
              new TextEntryView({
                title: 'New Playlist',
                placeholder: 'Playlist name',
                onSubmit: (name) => {
                  store.createPlaylist(name, []);
                  const pl = store.getPlaylists().at(-1);
                  store.addToPlaylist(pl.id, song);
                  toast(`Added to "${pl.name}"`, 'ok');
                  nav.popN(2);
                },
              })
            ),
        },
        ...store.getPlaylists().map((p) => ({
          label: p.name,
          right: p.songIds.includes(song.id) ? '✓' : String(p.songIds.length),
          action: () => {
            const added = store.addToPlaylist(p.id, song);
            toast(added ? `Added to "${p.name}"` : `Already in "${p.name}"`, added ? 'ok' : 'info');
            nav.pop();
          },
        })),
      ],
    });
  }

  /** Options for one song. queue/index say what to play; playlistId enables "remove from playlist". */
  function songActions(song, { queue, index, playlistId } = {}) {
    return list({
      title: song.song,
      live: true,
      items: () => {
        const saved = store.hasSong(song.id);
        const items = [
          { label: 'Play Now', action: () => (queue ? ctx.playSongs(queue, index) : ctx.playSongs([song], 0)) },
          {
            label: 'Play Next',
            action: () => {
              ctx.queueNext(song);
              nav.pop();
            },
          },
          { label: 'Add to Playlist', arrow: true, action: () => nav.push(addToPlaylistView(song)) },
        ];
        if (!saved) {
          items.push({
            label: 'Save to Songs',
            action: () => {
              store.saveSongs(song);
              toast('Saved to Songs', 'ok');
              nav.pop();
            },
          });
        }
        if (playlistId) {
          items.push({
            label: 'Remove from Playlist',
            action: () => {
              store.removeFromPlaylist(playlistId, song.id);
              toast('Removed from playlist', 'ok');
              nav.pop();
            },
          });
        }
        if (saved) {
          items.push({
            label: 'Remove from Songs',
            action: () =>
              nav.push(
                confirmView('Remove Song?', `Remove "${song.song}"`, () => {
                  store.removeSong(song.id);
                  toast('Song removed', 'ok');
                  nav.popN(2);
                })
              ),
          });
        }
        return items;
      },
    });
  }

  function confirmView(title, yesLabel, onYes) {
    return list({
      title,
      initial: 1,
      items: [
        { label: yesLabel, cls: 'danger', action: onYes },
        { label: 'Cancel', action: () => nav.pop() },
      ],
    });
  }

  /** Rows for a list of songs: select plays from that row, hold opens options. */
  function songRows(songs, extra = {}) {
    return songs.map((s, i) => ({
      label: s.song,
      sub: s.artist,
      thumb: s.id,
      action: () => ctx.playSongs(songs, i),
      hold: () => nav.push(songActions(s, { queue: songs, index: i, ...extra })),
    }));
  }

  // ---------- Music ----------

  function songsView() {
    return list({
      title: 'Songs',
      thumbs: true,
      live: true,
      empty: 'No songs yet. Use Search or Add from Link — hold center on a song for options.',
      items: () => songRows(store.getSongs()),
    });
  }

  function artistsView() {
    return list({
      title: 'Artists',
      live: true,
      empty: 'No artists yet',
      items: () =>
        store.getArtists().map((a) => ({
          label: a.artist,
          right: String(a.songs.length),
          arrow: true,
          action: () =>
            nav.push(
              list({
                title: a.artist,
                thumbs: true,
                live: true,
                items: () => {
                  const songs = store.getArtists().find((x) => x.artist === a.artist)?.songs || [];
                  return [{ label: '▶ Play All', thumb: undefined, action: () => ctx.playSongs(songs, 0) }, ...songRows(songs)];
                },
              })
            ),
        })),
    });
  }

  function playlistView(id) {
    const v = list({
      title: () => store.getPlaylist(id)?.name || 'Playlist',
      thumbs: true,
      live: true,
      items: () => {
        const pl = store.getPlaylist(id);
        if (!pl) return [];
        const songs = store.getPlaylistSongs(id);
        const rows = [];
        if (songs.length) {
          rows.push({ label: '▶ Play All', action: () => ctx.playSongs(songs, 0, { shuffle: false }) });
          rows.push({ label: '⤨ Shuffle', action: () => ctx.playSongs(songs, 0, { shuffle: true }) });
        }
        rows.push(...songRows(songs, { playlistId: id }));
        rows.push({
          label: 'Rename Playlist…',
          action: () =>
            nav.push(
              new TextEntryView({
                title: 'Rename',
                initial: pl.name,
                onSubmit: (name) => {
                  store.renamePlaylist(id, name);
                  toast('Renamed', 'ok');
                  nav.pop();
                  nav.updateTitle();
                },
              })
            ),
        });
        rows.push({
          label: 'Delete Playlist…',
          cls: 'danger',
          action: () =>
            nav.push(
              confirmView('Delete?', `Delete "${pl.name}"`, () => {
                store.deletePlaylist(id);
                toast('Playlist deleted', 'ok');
                nav.popN(2);
              })
            ),
        });
        return rows;
      },
    });
    return v;
  }

  function playlistsView() {
    return list({
      title: 'Playlists',
      live: true,
      items: () => [
        {
          label: '+ New Playlist…',
          action: () =>
            nav.push(
              new TextEntryView({
                title: 'New Playlist',
                placeholder: 'Playlist name',
                onSubmit: (name) => {
                  const pl = store.createPlaylist(name);
                  toast(`Created "${pl.name}"`, 'ok');
                  nav.replace(playlistView(pl.id));
                },
              })
            ),
        },
        ...store.getPlaylists().map((p) => ({
          label: p.name,
          right: String(p.songIds.length),
          arrow: true,
          action: () => nav.push(playlistView(p.id)),
        })),
      ],
    });
  }

  function recentView() {
    return list({
      title: 'Recently Played',
      thumbs: true,
      live: true,
      empty: 'Nothing played yet',
      items: () => songRows(store.getRecent()),
    });
  }

  function searchView() {
    if (!yt.hasApiKey()) {
      return list({
        title: 'Search',
        items: [
          { label: 'Search needs an API key', cls: 'note' },
          { label: 'See README to add one', cls: 'note' },
          { label: 'Add from Link instead', arrow: true, action: () => nav.replace(linkView()) },
        ],
        initial: 2,
      });
    }
    return new TextEntryView({
      title: 'Search',
      placeholder: 'Song or artist',
      submitLabel: 'SEARCH',
      onSubmit: (q) => {
        if (!navigator.onLine) {
          toast("You're offline", 'error');
          return;
        }
        let results = null;
        let message = 'Searching…';
        const view = list({
          title: `“${q}”`,
          thumbs: true,
          empty: message,
          items: () =>
            (results || []).map((s) => ({
              label: s.song,
              sub: s.artist,
              thumb: s.id,
              right: store.hasSong(s.id) ? '✓' : null,
              action: () => nav.push(songActions(s)),
            })),
        });
        nav.push(view);
        yt.search(q)
          .then((r) => {
            results = r;
            view.opts.empty = 'No results';
            view.refresh();
          })
          .catch((e) => {
            message = yt.ERROR_TEXT[e.code] || "Search didn't work";
            view.opts.empty = message;
            view.refresh();
            toast(message, 'error', 4500);
          });
      },
    });
  }

  function linkView() {
    return new TextEntryView({
      title: 'Add from Link',
      placeholder: 'Paste a YouTube link',
      charset: 'url',
      paste: true,
      submitLabel: 'ADD',
      onSubmit: async (text, entry) => {
        const { videoId, playlistId } = yt.parseLink(text);
        if (!videoId && !playlistId) {
          toast("That doesn't look like a YouTube link", 'error');
          return;
        }
        if (!navigator.onLine) {
          toast("You're offline", 'error');
          return;
        }
        // Playlist link (needs a key). If there's no key but the link also has a video, add that video.
        if (playlistId && (yt.hasApiKey() || !videoId)) {
          entry.setBusy('Importing playlist…');
          try {
            const { title, songs } = await yt.getPlaylist(playlistId);
            if (!songs.length) throw new yt.YTError('NOT_FOUND', 'That playlist is empty or private.');
            store.saveSongs(songs);
            const pl = store.createPlaylist(title, songs.map((s) => s.id));
            toast(`Imported ${songs.length} songs into "${pl.name}"`, 'ok', 4000);
            entry.setBusy(null);
            entry.input.value = '';
            nav.push(playlistView(pl.id));
          } catch (e) {
            entry.setBusy(null);
            toast(e.message || "Couldn't import that playlist", 'error', 5000);
          }
          return;
        }
        if (playlistId && !yt.hasApiKey()) toast('Adding just this video — playlists need an API key', 'info', 4000);
        entry.setBusy('Adding…');
        try {
          const song = await yt.getVideo(videoId);
          entry.setBusy(null);
          if (song.embeddable === false) {
            toast("That video can't be played outside YouTube", 'error', 4500);
            return;
          }
          store.saveSongs(song);
          entry.input.value = '';
          toast(`Added "${song.song}"`, 'ok');
          nav.push(songActions(song));
        } catch (e) {
          entry.setBusy(null);
          toast(e.message || "Couldn't add that video", 'error');
        }
      },
    });
  }

  function musicView() {
    return list({
      title: 'Music',
      items: [
        { label: 'Playlists', arrow: true, action: () => nav.push(playlistsView()) },
        { label: 'Songs', arrow: true, action: () => nav.push(songsView()) },
        { label: 'Artists', arrow: true, action: () => nav.push(artistsView()) },
        { label: 'Cover Flow', arrow: true, action: () => nav.push(new CoverFlowView(ctx)) },
        { label: 'Recently Played', arrow: true, action: () => nav.push(recentView()) },
        { label: 'Search', arrow: true, action: () => nav.push(searchView()) },
        { label: 'Add from Link', arrow: true, action: () => nav.push(linkView()) },
      ],
    });
  }

  // ---------- Extras ----------

  function extrasView() {
    return list({
      title: 'Extras',
      items: [
        { label: 'Clock', arrow: true, action: () => nav.push(new ClockView()) },
        { label: 'Stopwatch', arrow: true, action: () => nav.push(new StopwatchView()) },
        { label: 'Brick Breaker', arrow: true, action: () => nav.push(new BrickView()) },
      ],
    });
  }

  // ---------- Settings ----------

  const BACKLIGHT = [
    [0, 'Always On'],
    [10, '10 sec'],
    [30, '30 sec'],
    [60, '1 min'],
  ];

  function skinsView() {
    return list({
      title: 'Skins',
      live: true,
      initial: Math.max(0, SKINS.findIndex((s) => s.id === store.getSettings().skin)),
      items: () =>
        SKINS.map((s) => ({
          label: s.name,
          right: store.getSettings().skin === s.id ? '✓' : null,
          action: (_, i) => {
            store.setSetting('skin', s.id);
            applySkin(s.id);
            nav.top.refresh?.();
            nav.top.sel = i;
          },
        })),
    });
  }

  function settingsView() {
    const v = list({
      title: 'Settings',
      live: true,
      items: () => {
        const st = store.getSettings();
        const re = () => v.refresh();
        return [
          { label: 'Skins', arrow: true, action: () => nav.push(skinsView()) },
          {
            label: 'Click Sound',
            right: st.clickSound ? 'On' : 'Off',
            action: () => {
              store.setSetting('clickSound', !st.clickSound);
              setClickSound(!st.clickSound);
              re();
            },
          },
          {
            label: 'Backlight',
            right: BACKLIGHT.find((b) => b[0] === st.backlight)?.[1] || `${st.backlight}s`,
            action: () => {
              const i = BACKLIGHT.findIndex((b) => b[0] === st.backlight);
              const nextVal = BACKLIGHT[(i + 1) % BACKLIGHT.length][0];
              store.setSetting('backlight', nextVal);
              ctx.onBacklightChange?.(nextVal);
              re();
            },
          },
          {
            label: 'Shuffle',
            right: player.shuffle ? 'On' : 'Off',
            action: () => {
              player.setShuffle(!player.shuffle);
              re();
            },
          },
          {
            label: 'Repeat',
            right: { off: 'Off', all: 'All', one: 'One' }[player.repeat],
            action: () => {
              player.cycleRepeat();
              re();
            },
          },
          {
            label: 'About',
            arrow: true,
            action: () =>
              nav.push(
                list({
                  title: 'About',
                  items: [
                    { label: 'Scroll Wheel Radio', cls: 'note' },
                    { label: `${store.getSongs().length} songs · ${store.getPlaylists().length} playlists`, cls: 'note' },
                    { label: yt.hasApiKey() ? 'YouTube search: on' : 'YouTube search: no key', cls: 'note' },
                    { label: 'Music plays via YouTube', cls: 'note' },
                  ],
                })
              ),
          },
          {
            label: 'Reset',
            arrow: true,
            action: () =>
              nav.push(
                list({
                  title: 'Reset',
                  initial: 2,
                  items: [
                    {
                      label: 'Reset All Settings',
                      action: () => {
                        store.resetSettings();
                        const d = store.getSettings();
                        applySkin(d.skin);
                        setClickSound(d.clickSound);
                        ctx.onBacklightChange?.(d.backlight);
                        player.setShuffle(d.shuffle);
                        player.repeat = d.repeat;
                        player.setVolume(d.volume);
                        toast('Settings reset', 'ok');
                        nav.pop();
                      },
                    },
                    {
                      label: 'Erase Songs & Playlists',
                      cls: 'danger',
                      action: () =>
                        nav.push(
                          confirmView('Erase All?', 'Erase everything', () => {
                            store.eraseLibrary();
                            toast('Library erased', 'ok');
                            nav.popN(2);
                          })
                        ),
                    },
                    { label: 'Cancel', action: () => nav.pop() },
                  ],
                })
              ),
          },
        ];
      },
    });
    return v;
  }

  // ---------- Main menu ----------

  const main = list({
    title: 'Scroll Wheel',
    items: [
      { label: 'Music', arrow: true, action: () => nav.push(musicView()) },
      {
        label: 'Shuffle Songs',
        action: () => {
          const songs = store.getSongs();
          if (!songs.length) {
            toast('No songs yet — add some from Search or a link', 'info', 3500);
            return;
          }
          ctx.playSongs(songs, 0, { shuffle: true });
        },
      },
      { label: 'Now Playing', arrow: true, action: () => ctx.openNowPlaying(true) },
      { label: 'Extras', arrow: true, action: () => nav.push(extrasView()) },
      { label: 'Settings', arrow: true, action: () => nav.push(settingsView()) },
    ],
  });

  return { main };
}
