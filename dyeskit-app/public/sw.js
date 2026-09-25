/* DYESKIT service worker — makes the app installable and survives a dropped signal.
 *
 * Deliberately conservative:
 *   • only the interface shell is cached (HTML, CSS, JS, icons)
 *   • /api/ is NEVER cached — survey data and scores always come from the server,
 *     so nobody can be shown a stale score or a record they no longer have access to
 *   • when the network is gone and the page is not cached, a plain offline notice is shown
 */

const VERSION = 'dyeskit-shell-v2';
const SHELL = [
  '/', '/index.html', '/css/theme.css', '/js/app.js', '/js/charts.js',
  '/images/logo-placeholder.svg', '/images/icon-192.png', '/images/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache data or authentication.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then(hit => {
      const fromNetwork = fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => hit || new Response(
          '<!doctype html><meta charset="utf-8"><title>DYESKIT — offline</title>' +
          '<body style="font-family:system-ui;padding:40px;max-width:32rem;margin:auto">' +
          '<h1>No connection</h1><p>DYESKIT needs the server to show data. ' +
          'Reconnect and reopen the app.</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        ));
      return hit || fromNetwork;   // cache first for the shell, network updates it in the background
    })
  );
});
