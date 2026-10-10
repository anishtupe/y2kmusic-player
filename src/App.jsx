import { useEffect, useState } from 'react';
import './install.js';
import './style.css';
import './skins.css';

function PlayerView({ active, bootError, setBootError }) {
  useEffect(() => {
    if (!active) return undefined;
    let mounted = true;
    import('./main.js').catch((error) => {
      console.error('Could not start the player:', error);
      if (mounted) setBootError('The player could not start. Please reload this page.');
    });
    return () => {
      mounted = false;
    };
  }, [active, setBootError]);

  return (
    <div className="player-view" hidden={!active}>
      <div className="bg" aria-hidden="true">
        <div className="bg-holo" />
        <div className="bg-grid" />
        <div className="bg-sparkles" id="sparkles" />
        <div className="bg-word bg-word-1">★ spin it ★</div>
        <div className="bg-word bg-word-2">2000 4ever</div>
        <div className="bg-badge"><span>visits</span><b id="visitors">000000</b></div>
      </div>
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>✦ welcome 2 scroll wheel radio ✦ spin the wheel ✦ thx 4 stopping by ✦ add me as a friend ✦ now playing: ur fav song ✦</span>
          <span>✦ welcome 2 scroll wheel radio ✦ spin the wheel ✦ thx 4 stopping by ✦ add me as a friend ✦ now playing: ur fav song ✦</span>
        </div>
      </div>
      <main className="stage">
        <div className="device-wrap" id="device-wrap">
          <div className="device" id="device">
            <div className="guts" aria-hidden="true">
              <div className="guts-board" />
              <div className="guts-battery"><span>3.7V</span></div>
              <div className="guts-chip" />
              <div className="guts-disk" />
              <div className="guts-ribbon" />
            </div>
            <div className="hardware" aria-hidden="true">
              <span className="hardware-volume" />
              <span className="hardware-lock" />
              <span className="hardware-dock" />
            </div>
            <div className="stickers" aria-hidden="true">
              <span className="sticker sticker-star">★</span>
              <span className="sticker sticker-y2k">Y2K</span>
              <span className="sticker sticker-heart">♥</span>
              <span className="sticker sticker-smile">:)</span>
            </div>
            <div className="bezel">
              <div className="screen" id="screen">
                <div className="titlebar">
                  <span className="tb-play" id="tb-play" aria-hidden="true" />
                  <span className="tb-title" id="tb-title">Scroll Wheel</span>
                  <span className="tb-right">
                    <span className="tb-offline" id="tb-offline" title="Offline">⌁</span>
                    <span className="tb-batt" id="tb-batt" aria-hidden="true"><i id="tb-batt-level" /></span>
                  </span>
                </div>
                <div className="content" id="content">
                  <div className="panes" id="panes" aria-live="polite" />
                  <div className="yt-wrap" id="yt-wrap"><div id="yt-player" /></div>
                  <div className="splash" id="splash">
                    <div className="splash-logo">
                      <span className="splash-mark">★</span>
                      <span className="splash-name">scroll<br />wheel<br />radio</span>
                    </div>
                    <div className="splash-intro">
                      your pocket-sized time machine<br />
                      spin to browse · center to select<br />
                      MENU › Settings for home-screen help
                    </div>
                    <div className="splash-tap">tap anywhere to start</div>
                  </div>
                </div>
                <div className="glare" aria-hidden="true" />
              </div>
            </div>
            <div className="brand" aria-label="Scroll Wheel Radio">
              <span className="brand-mark" aria-hidden="true">★</span>
              <span className="brand-name">scroll wheel radio</span>
            </div>
            <div className="wheel" id="wheel" role="group" aria-label="Click wheel: drag in a circle to scroll">
              <span className="wl wl-menu" data-zone="menu">MENU</span>
              <span className="wl wl-next" data-zone="next" id="wl-next" />
              <span className="wl wl-play" data-zone="playPause" id="wl-play" />
              <span className="wl wl-prev" data-zone="prev" id="wl-prev" />
              <button className="center" id="center" type="button" aria-label="Select (hold for more)" />
            </div>
          </div>
        </div>
      </main>
      <div className="toasts" id="toasts" aria-live="assertive" />
      <noscript><p className="noscript">Scroll Wheel Radio needs JavaScript turned on.</p></noscript>
      {bootError && <div className="player-boot-error" role="alert">{bootError}</div>}
    </div>
  );
}

export default function App() {
  const [bootError, setBootError] = useState('');

  useEffect(() => { document.title = 'Scroll Wheel Radio'; }, []);

  return <PlayerView active bootError={bootError} setBootError={setBootError} />;
}
