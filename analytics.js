// analytics.js — privacy-friendly counting. No cookies, no fingerprinting, honours Do Not Track and Global Privacy Control.
// Set window.MR_ANALYTICS = { goatcounter: 'https://YOURCODE.goatcounter.com/count' } in index.html to turn it on.
export function createAnalytics(cfg = {}) {
  const dnt = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const enabled = !!cfg.goatcounter && !dnt && !/[?&]test=1/.test(location.search) && location.hostname !== 'localhost';
  const once = new Set(); let count = 0;
  function send(path, title, isEvent) {
    if (!enabled || count > 80) return; count++;
    try {
      const u = new URL(cfg.goatcounter);
      u.searchParams.set('p', path); u.searchParams.set('t', title || path); u.searchParams.set('r', document.referrer || '');
      u.searchParams.set('s', `${innerWidth},${innerHeight},${devicePixelRatio || 1}`); if (isEvent) u.searchParams.set('e', 'true'); u.searchParams.set('rnd', String(Math.random()).slice(2, 9));
      const img = new Image(1, 1); img.src = u.toString();
    } catch (e) { /* ignore */ }
  }
  return {
    enabled,
    pageview() { send(location.pathname + location.search, document.title, false); },
    /** Count an event once per session unless `repeat` is true. */
    event(name, repeat = false) { if (!repeat) { if (once.has(name)) return; once.add(name); } send('/e/' + name, name, true); },
  };
}
