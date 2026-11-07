// Lets the website open with no signal. Pages and files come from the network
// first, so a release shows straight away; the copies here are only for when that
// fails. /now and /app pass straight through. Registered by pwa.js, never in the
// Android app.
const CACHE = 'dailies';
const at = file => new URL(file, location).href;
const INDEX = at('index.html');
const SHELL = ['index.html', 'shared.css', 'clock.js', 'pwa.js', 'fonts/hanken-grotesk-latin.woff2'].map(at);

// A kept page mustn't keep its time: a reading from days ago would hold the games
// on that day (see clock.js), where no reading goes by the phone's clock.
const timeless = res => res.text().then(html => new Response(html.replace(/<script>var serverClock=.*?<\/script>/, ''), { headers: res.headers }));
const keep = (cache, key, res) => (/\.html$/.test(key) ? timeless(res) : Promise.resolve(res)).then(copy => cache.put(key, copy));

addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(cache => Promise.all(SHELL.map(key => fetch(key).then(res => {
      if (!res.ok) throw new Error(key);
      return keep(cache, key, res);
    }))))
    .then(() => skipWaiting()));
});

addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => clients.claim()));
});

addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (!/(\/|\.(html|css|js|woff2))$/.test(url.pathname)) return;
  // The one copy of a file, whatever its ?v=: a new version replaces the last.
  const key = url.origin + url.pathname.replace(/\/$/, '/index.html');
  e.respondWith(fetch(request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(cache => keep(cache, key, copy)));
    }
    return res;
  }).catch(() => caches.match(key).then(hit => hit
    // A game that's never been opened here can't start offline: back to the home screen.
    || (request.mode === 'navigate' ? Response.redirect(INDEX) : Response.error()))));
});
