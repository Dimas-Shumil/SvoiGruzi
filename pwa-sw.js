/* Public PWA: never intercept CRM, API requests or cache customer data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' ||
      url.pathname.startsWith('/api/') || url.pathname.startsWith('/control')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => new Response(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Нет подключения</title><body><h1>Нет подключения к интернету</h1><p>Проверьте соединение и обновите страницу.</p><a href="/">Попробовать снова</a></body></html>',
      {headers: {'Content-Type': 'text/html; charset=utf-8'}, status: 503}
    )));
  }
});
