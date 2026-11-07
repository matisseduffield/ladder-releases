// The time the games go by. Moving the phone's clock or time zone mustn't bring
// tomorrow's puzzle early, so the day comes from our server: the app keeps a
// server reading (see TrustedClock.kt), and on the site the Worker writes one
// into each page. The phone's own clock is only used before any reading exists,
// such as a first open with no connection or a local preview.
(function (root) {
  const zoneAt = time => -new Date(time).getTimezoneOffset();

  // A Date whose local fields show the player's wall clock, so it goes anywhere
  // `new Date()` would. The server's zone comes from the connection and can be
  // off by a little, so the phone may hold the day back but never bring it on.
  function wall({ now, offset }) {
    const zone = zoneAt(now);
    const at = new Date(now + (offset == null ? zone : Math.min(offset, zone)) * 6e4);
    return new Date(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(),
      at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds());
  }

  let site = null;   // the page's reading, and when it was taken
  const keep = reading => { site = { ...reading, mark: performance.now() }; };

  function reading() {
    if (root.ladderClock) {
      try { return JSON.parse(root.ladderClock.read()); } catch { return null; }
    }
    return site && { now: site.now + performance.now() - site.mark, offset: site.offset };
  }

  function now() {
    const known = reading();
    return known ? wall(known) : new Date();
  }

  // A page left open on the site can sleep through midnight.
  async function refresh() {
    try {
      const res = await fetch('/now', { cache: 'no-store' });
      keep(await res.json());
      root.dispatchEvent(new Event('clock'));
    } catch {}
  }

  if (root.serverClock) {
    keep(root.serverClock);
    root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) refresh(); });
    root.addEventListener('pageshow', e => { if (e.persisted) refresh(); });
  }

  // Someone mid-game at midnight finishes the day they're on before the new one
  // takes its place; coming back to it hours later, they get the new day.
  let touched = -Infinity;
  if (root.addEventListener) for (const type of ['pointerdown', 'keydown']) root.addEventListener(type, () => { touched = Date.now(); }, true);
  const playing = () => Date.now() - touched < 30 * 6e4;

  const Clock = { now, wall, playing };
  root.Clock = Clock;
  if (typeof module === 'object' && module.exports) module.exports = Clock;
})(globalThis);
